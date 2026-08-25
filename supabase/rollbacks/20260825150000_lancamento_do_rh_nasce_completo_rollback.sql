-- Rollback de 20260825150000_lancamento_do_rh_nasce_completo.
--
-- ATENÇÃO: voltar isto DEVOLVE o defeito. O lançamento do RH volta a nascer sem
-- quem recebe, sem categoria (portanto fora de qualquer linha do DRE), sem forma
-- e sem vencimento. Só rode se a mudança quebrou algo pior que isso.
--
-- Ordem inversa da migration, e as duas funções voltam ao corpo que estava vivo
-- antes (md5 conferido no dia: fn_fechar_diarias 6efeee0a97a235b2be9cbeac1f9178f0,
-- fn_registrar_adiantamento 18601d5d73500ed2b4e4ab5ac167d114).

-- 1. O trigger primeiro: enquanto ele existir, qualquer insert do RH chama a
-- função de categoria, e derrubar a função antes deixaria o insert quebrado.
drop trigger if exists trg_rh_completar_lancamento on public.lancamentos;
drop function if exists public.fn_rh_completar_lancamento();

-- 2. Desfaz o conserto de dados. Volta a categoria a NULA nos lançamentos de
-- diária, que era o estado anterior -- e era o defeito.
update public.lancamentos
set categoria_id = null
where origem = 'diaria'
  and categoria_id = (
    select id from public.categorias_financeiras where nome = 'Diárias Mão de Obra'
  );

-- 3. fn_fechar_diarias volta à assinatura de 3 argumentos, com vencimento
-- opcional. DROP da nova antes de criar a velha: manter as duas faria o PostgREST
-- escolher uma delas em runtime.
drop function if exists public.fn_fechar_diarias(uuid, date, date, uuid);

create function public.fn_fechar_diarias(
  p_colaborador uuid,
  p_competencia date,
  p_data_vencimento date default null::date
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_total numeric; v_nome text; v_cc uuid; v_lanc uuid; v_comp date;
begin
  if not public.tem_permissao('rh.diaristas', 'criar') then raise exception 'Sem permissao para fechar diarias'; end if;
  v_comp := date_trunc('month', p_competencia)::date;

  perform public.fn_exigir_competencia_aberta(v_comp, 'lancamento', null);

  perform 1 from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null for update;

  select coalesce(sum(valor), 0) into v_total from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null;
  if v_total <= 0 then raise exception 'Nao ha diarias em aberto nessa competencia'; end if;

  select nome, centro_custo_id into v_nome, v_cc from public.colaboradores where id = p_colaborador;

  insert into public.lancamentos (tipo, origem, origem_id, centro_custo_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, created_by)
  values ('a_pagar', 'diaria', p_colaborador, v_cc, 'Diarias ' || coalesce(v_nome, '') || ' ' || to_char(v_comp, 'MM/YYYY'), v_total, 'a_pagar',
          (now() at time zone 'America/Rio_Branco')::date, v_comp, p_data_vencimento, (select auth.uid()))
  returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_total, p_data_vencimento, 'pendente', (select auth.uid()));
  if v_cc is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_cc, v_total, (select auth.uid()));
  end if;

  update public.rh_diarias set lancamento_id = v_lanc
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null;
  return v_lanc;
end;
$function$;

revoke all on function public.fn_fechar_diarias(uuid, date, date) from public;
grant execute on function public.fn_fechar_diarias(uuid, date, date) to authenticated;

-- 4. fn_registrar_adiantamento volta sem a forma de pagamento.
create or replace function public.fn_registrar_adiantamento(p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_colab uuid := (p_dados->>'colaborador_id')::uuid;
  v_comp date := date_trunc('month', (p_dados->>'competencia')::date)::date;
  v_valor numeric(14,2) := (p_dados->>'valor')::numeric;
  v_data date := (p_dados->>'data')::date;
  v_desc text := nullif(btrim(coalesce(p_dados->>'descricao', '')), '');
  v_uid uuid := (select auth.uid());
  v_nome text; v_cc uuid; v_adiant uuid; v_lanc uuid;
  v_qtd integer; v_total_cent bigint; v_base_cent bigint; v_sobra_cent bigint;
begin
  if not public.tem_permissao('rh.adiantamentos', 'criar') then
    raise exception 'Sem permissao para criar adiantamentos';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'O valor do adiantamento tem que ser maior que zero';
  end if;

  perform public.fn_exigir_competencia_aberta(v_comp, 'adiantamento', null);

  select nome, centro_custo_id into v_nome, v_cc
  from public.colaboradores where id = v_colab;
  if v_nome is null then raise exception 'Colaborador nao encontrado'; end if;

  insert into public.rh_adiantamentos
    (colaborador_id, competencia, valor, data, descricao, created_by)
  values (v_colab, v_comp, v_valor, v_data, v_desc, v_uid)
  returning id into v_adiant;

  insert into public.lancamentos
    (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
     data_compra, mes_competencia, data_vencimento, created_by)
  values
    ('a_pagar', 'adiantamento', v_adiant, v_cc,
     'Adiantamento ' || v_nome || ' ' || to_char(v_comp, 'MM/YYYY'),
     v_valor, 'a_pagar',
     (now() at time zone 'America/Rio_Branco')::date, v_comp, v_data, v_uid)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_valor, v_data, 'pendente', v_uid);

  if v_cc is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_cc, v_valor, v_uid);
  end if;

  update public.rh_adiantamentos set lancamento_id = v_lanc where id = v_adiant;

  v_qtd := coalesce((p_dados->>'parcelas')::integer, 1);
  if v_qtd < 1 or v_qtd > 60 then
    raise exception 'Parcelas fora do limite (1 a 60): %', v_qtd;
  end if;
  v_total_cent := round(v_valor * 100)::bigint;
  if v_qtd > v_total_cent then
    raise exception 'Parcelas demais para o valor: cada parcela ficaria em zero';
  end if;
  v_base_cent := v_total_cent / v_qtd;
  v_sobra_cent := v_total_cent - v_base_cent * v_qtd;

  insert into public.rh_adiantamento_parcelas
    (adiantamento_id, numero, competencia, valor_previsto)
  select v_adiant,
         n,
         (date_trunc('month', v_comp) + ((n - 1) || ' month')::interval)::date,
         ((v_base_cent + case when n = 1 then v_sobra_cent else 0 end)::numeric / 100)
  from generate_series(1, v_qtd) n;

  return v_adiant;
end;
$function$;

revoke all on function public.fn_registrar_adiantamento(jsonb) from public;
grant execute on function public.fn_registrar_adiantamento(jsonb) to authenticated;

-- 5. A função de categoria sai depois do trigger e das funções que a chamavam.
drop function if exists public.fn_categoria_do_rh(uuid, text);

-- 6. A coluna. Sai por último: as funções acima não a mencionam mais.
drop index if exists public.idx_lancamentos_colaborador;
alter table public.lancamentos drop column if exists colaborador_id;

-- 7. A categoria "Diárias Mão de Obra" NÃO é apagada, é inativada. Se alguém já
-- classificou um lançamento nela na janela em que a migration esteve de pé,
-- apagar deixaria o lançamento apontando para um id que não existe -- e o passo 2
-- acima só limpa os de origem `diaria`. Inativar tira da lista sem quebrar
-- ninguém.
update public.categorias_financeiras
set ativo = false
where nome = 'Diárias Mão de Obra';
