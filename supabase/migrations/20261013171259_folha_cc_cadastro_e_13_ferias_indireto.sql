-- Folha: CC do cadastro segue a ultima folha. 13o e ferias: custo indireto
-- diluido nos 12 meses do ano (Tiago, 13/10/2026).
--
-- 1. Trocar o CC de uma linha da folha (ou gerar a folha) atualiza
--    colaboradores.centro_custo_id quando essa folha e a de competencia mais
--    recente do colaborador. Folha antiga nao mexe no cadastro.
-- 2. 13o e ferias (e as guias deles) continuam com UM lancamento e UMA parcela
--    para pagar. So a leitura de custo muda: vw_custo_rateios corta cada
--    rateio em 12 fatias (centavos por maior resto, sobra nos primeiros
--    meses), uma por mes do ano do mes de competencia, e manda a fatia para o
--    Escritorio Central, que e raiz indireta. Assim o rateio do indireto
--    (fn_rateio_indireto_mes) distribui o 13o e as ferias entre as obras mes a
--    mes, igual aos outros indiretos. Nenhum lancamento muda.

-- ---------------------------------------------------------------- 1. cadastro
create or replace function public.fn_folha_item_cc_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp date;
begin
  if new.centro_custo_id is null then
    return new;
  end if;
  select f.competencia into v_comp from public.folhas f where f.id = new.folha_id;
  if exists (
    select 1
      from public.folha_itens fi
      join public.folhas f on f.id = fi.folha_id
     where fi.colaborador_id = new.colaborador_id
       and f.competencia > v_comp
  ) then
    return new;
  end if;
  update public.colaboradores
     set centro_custo_id = new.centro_custo_id
   where id = new.colaborador_id
     and centro_custo_id is distinct from new.centro_custo_id;
  return new;
end;
$$;

revoke all on function public.fn_folha_item_cc_no_cadastro() from public, anon, authenticated;

create trigger trg_folha_item_cc_no_cadastro
  after insert or update of centro_custo_id on public.folha_itens
  for each row execute function public.fn_folha_item_cc_no_cadastro();

-- Carga: quem ja diverge da ultima folha passa a ser igual a ela.
update public.colaboradores c
   set centro_custo_id = u.centro_custo_id
  from (
    select distinct on (fi.colaborador_id) fi.colaborador_id, fi.centro_custo_id
      from public.folha_itens fi
      join public.folhas f on f.id = fi.folha_id
     where fi.centro_custo_id is not null
     order by fi.colaborador_id, f.competencia desc
  ) u
 where c.id = u.colaborador_id
   and c.centro_custo_id is distinct from u.centro_custo_id;

-- ------------------------------------------------- 2. custo por competencia
create view public.vw_custo_rateios
with (security_invoker = true) as
select r.id, r.lancamento_id, r.centro_custo_id, r.categoria_id,
       r.valor::numeric(14, 2) as valor, l.mes_competencia
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
 where coalesce(l.origem, '') not in ('decimo_terceiro', 'decimo_terceiro_guia', 'ferias', 'ferias_guia')
union all
select r.id, r.lancamento_id, coalesce(ec.id, r.centro_custo_id), r.categoria_id,
       ((c.cent / 12
         + case when m.n <= abs(c.cent % 12) then (case when c.cent < 0 then -1 else 1 end) else 0 end
        ) / 100.0)::numeric(14, 2),
       make_date(extract(year from l.mes_competencia)::int, m.n, 1)
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  cross join lateral (select round(r.valor * 100)::bigint as cent) c
  cross join generate_series(1, 12) as m(n)
  left join lateral (
    select x.id from public.centros_custo x
     where x.pai_id is null and x.tipo = 'escritorio' and x.papel_rateio = 'indireto'
     order by x.created_at, x.id
     limit 1
  ) ec on true
 where l.origem in ('decimo_terceiro', 'decimo_terceiro_guia', 'ferias', 'ferias_guia');

comment on view public.vw_custo_rateios is
  'Rateios como os relatorios de custo enxergam: 13o e ferias em 12 fatias no Escritorio Central (indireto), uma por mes do ano da competencia. O resto igual a lancamento_rateios com o mes do lancamento.';

revoke all on public.vw_custo_rateios from public, anon;
grant select on public.vw_custo_rateios to authenticated;

-- Os relatorios de custo passam a ler a view. Troca por texto com checagem:
-- se um trecho nao for achado, a migration para.
do $troca$
declare
  v_t record;
  v_oid oid;
  v_def text;
  v_novo text;
begin
  for v_t in
    select * from (values
      (1, 'fn_rel_custo_centro_custo', 'from public.lancamento_rateios r', 'from public.vw_custo_rateios r'),
      (2, 'fn_rel_custo_centro_custo', 'l.mes_competencia >= date_trunc', 'r.mes_competencia >= date_trunc'),
      (3, 'fn_rel_custo_centro_custo', 'l.mes_competencia < p_fim', 'r.mes_competencia < p_fim'),
      (4, 'fn_rel_custo_centro_serie', 'from public.lancamento_rateios r', 'from public.vw_custo_rateios r'),
      (5, 'fn_rel_custo_centro_serie', 'l.mes_competencia', 'r.mes_competencia'),
      (6, 'fn_rel_custo_centro_vida', 'join public.lancamento_rateios r', 'join public.vw_custo_rateios r'),
      (7, 'fn_rel_custo_centro_vida', 'min(l.mes_competencia)', 'min(r.mes_competencia)'),
      (8, 'fn_rel_custo_por_mes', 'from public.lancamento_rateios r', 'from public.vw_custo_rateios r'),
      (9, 'fn_rel_custo_por_mes', 'l.mes_competencia', 'r.mes_competencia'),
      (10, 'fn_rel_custo_receita', 'from public.lancamento_rateios r', 'from public.vw_custo_rateios r'),
      (11, 'fn_rel_custo_receita', 'l.mes_competencia', 'r.mes_competencia'),
      (12, 'fn_rel_custos_indiretos', 'from public.lancamento_rateios r', 'from public.vw_custo_rateios r'),
      (13, 'fn_rel_custos_indiretos', 'l.mes_competencia', 'r.mes_competencia'),
      (14, 'fn_rel_gestao_maiores_custos', 'from public.lancamento_rateios r', 'from public.vw_custo_rateios r'),
      (15, 'fn_rel_gestao_maiores_custos', 'l.mes_competencia >= date_trunc', 'r.mes_competencia >= date_trunc'),
      (16, 'fn_rel_gestao_maiores_custos', 'l.mes_competencia < p_fim', 'r.mes_competencia < p_fim'),
      -- DRE: o doc abre a janela em 11 meses para cada lado (a fatia de um 13o
      -- pode cair no periodo com o lancamento fora dele) e a fatia filtra o mes.
      (17, 'fn_rel_dre', 'l.mes_competencia >= date_trunc(''month'', p_inicio)::date',
           'l.mes_competencia >= (date_trunc(''month'', p_inicio) - interval ''11 months'')::date'),
      (18, 'fn_rel_dre', 'l.mes_competencia < p_fim',
           'l.mes_competencia < (p_fim + interval ''11 months'')::date'),
      (19, 'fn_rel_dre', 'join public.lancamento_rateios r on r.lancamento_id = l.id',
           'join public.vw_custo_rateios r on r.lancamento_id = l.id
   and r.mes_competencia >= date_trunc(''month'', p_inicio)::date
   and r.mes_competencia < p_fim')
    ) as t(ordem, fn, de, para)
    order by ordem
  loop
    select p.oid into strict v_oid
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_t.fn;
    v_def := pg_get_functiondef(v_oid);
    v_novo := replace(v_def, v_t.de, v_t.para);
    if v_novo = v_def then
      raise exception 'Troca % nao achou "%" em %', v_t.ordem, v_t.de, v_t.fn;
    end if;
    execute v_novo;
  end loop;
end
$troca$;
