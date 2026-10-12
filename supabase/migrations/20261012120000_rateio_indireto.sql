-- Rateio do custo indireto (PR 3 do controle total, 12/10/2026; D6, D7, D8).
--
-- Todo mes o custo dos centros indiretos (Escritorio Central, Manutencao/
-- Documentacao de Equipamentos, 002 - Equipamentos Colorado 2026) e distribuido
-- nas obras pelo custo direto operacional de cada uma no mes. O Tiago pode
-- ajustar os percentuais do mes e confirmar. Vive so nos relatorios: nenhum
-- lancamento muda.
--
-- Quem rateia e quem fica de fora e marcado por id (papel_rateio), porque o tipo
-- nao decide: 002 Colorado e 001 Carretas sao tipo obra, e o primeiro e indireto
-- e o segundo e unidade propria (nao rateia nem recebe).
-- Custo do mes por raiz: fn_rel_custo_receita, o mesmo predicado de custo dos
-- relatorios (sem financeiro, investimento, socio, empresa ligada, imobilizado,
-- movimentacao, distribuicao, mutuo; investimento so com pedido).

alter table public.centros_custo add column if not exists papel_rateio text;
alter table public.centros_custo drop constraint if exists centros_custo_papel_rateio_check;
alter table public.centros_custo add constraint centros_custo_papel_rateio_check
  check (papel_rateio is null or (nivel = 1 and papel_rateio in ('indireto', 'fora')));

update public.centros_custo set papel_rateio = 'indireto'
 where id in ('0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e',   -- Escritorio Central
              'fbd2556a-3e96-474b-818f-ff536a288dff',   -- Manutencao/Documentacao de Equipamentos
              '891f3c63-f7e5-49fb-a97c-9c99deeadc2b');  -- 002 - Equipamentos Colorado 2026
update public.centros_custo set papel_rateio = 'fora'
 where id = 'a39e45c0-aea5-4d98-aebd-814616b8551c';     -- 001 - Carretas EMT

create table if not exists public.rateio_indireto_meses (
  mes date primary key check (mes = date_trunc('month', mes)::date),
  status text not null check (status in ('ajustado', 'confirmado')),
  motivo text not null check (btrim(motivo) <> ''),
  atualizado_por uuid,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.rateio_indireto_percentuais (
  mes date not null references public.rateio_indireto_meses(mes) on delete cascade,
  centro_custo_id uuid not null references public.centros_custo(id),
  percentual numeric(9, 6) not null check (percentual >= 0 and percentual <= 100),
  primary key (mes, centro_custo_id)
);

create table if not exists public.rateio_indireto_eventos (
  id uuid primary key default gen_random_uuid(),
  mes date not null,
  acao text not null check (acao in ('ajustou', 'confirmou', 'voltou_ao_automatico')),
  motivo text not null,
  percentuais jsonb,
  criado_por uuid,
  criado_em timestamptz not null default now()
);

alter table public.rateio_indireto_meses enable row level security;
alter table public.rateio_indireto_percentuais enable row level security;
alter table public.rateio_indireto_eventos enable row level security;
drop policy if exists rateio_indireto_meses_ver on public.rateio_indireto_meses;
create policy rateio_indireto_meses_ver on public.rateio_indireto_meses for select to authenticated
  using ((select public.tem_permissao('financeiro.relatorios', 'ver')));
drop policy if exists rateio_indireto_percentuais_ver on public.rateio_indireto_percentuais;
create policy rateio_indireto_percentuais_ver on public.rateio_indireto_percentuais for select to authenticated
  using ((select public.tem_permissao('financeiro.relatorios', 'ver')));
drop policy if exists rateio_indireto_eventos_ver on public.rateio_indireto_eventos;
create policy rateio_indireto_eventos_ver on public.rateio_indireto_eventos for select to authenticated
  using ((select public.tem_permissao('financeiro.relatorios', 'ver')));
revoke all on public.rateio_indireto_meses, public.rateio_indireto_percentuais, public.rateio_indireto_eventos from anon, authenticated;
grant select on public.rateio_indireto_meses, public.rateio_indireto_percentuais, public.rateio_indireto_eventos to authenticated;

-- Rateio de UM mes: uma linha por obra que recebe (custo direto > 0, ou com %
-- gravado no ajuste). Indireto em centavos por maior resto; o que nao tem para
-- onde ir (mes sem obra com custo, ou ajuste so com obras sem custo) aparece em
-- nao_rateado, repetido em toda linha (e na unica linha sentinela quando nao ha obra).
create or replace function public.fn_rateio_indireto_mes(p_mes date)
 returns table(centro_id uuid, centro text, custo_direto numeric, pct_sugerido numeric, pct_vigente numeric,
               indireto numeric, sem_custo boolean, status text, nao_rateado numeric, custo_indireto_mes numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_status text;
  v_indireto_cent bigint;
begin
  if not public.tem_permissao('financeiro.relatorios', 'ver') then
    raise exception 'Sem permissao para ver relatorios';
  end if;
  select m.status into v_status from public.rateio_indireto_meses m where m.mes = v_mes;

  select coalesce(round(sum(r.total) * 100), 0)::bigint into v_indireto_cent
    from public.fn_rel_custo_receita(array[v_mes]) r
    join public.centros_custo c on c.id = r.centro_custo_id
   where r.tipo = 'a_pagar' and c.papel_rateio = 'indireto';

  return query
  with custo as (
    select r.centro_custo_id as id, sum(r.total) as total
      from public.fn_rel_custo_receita(array[v_mes]) r
      join public.centros_custo c on c.id = r.centro_custo_id
     where r.tipo = 'a_pagar' and c.nivel = 1 and c.tipo = 'obra' and c.papel_rateio is null
     group by r.centro_custo_id
    having sum(r.total) > 0
  ),
  base as (
    select coalesce(cu.id, p.centro_custo_id) as id,
           coalesce(cu.total, 0) as custo_direto,
           p.percentual as pct_gravado
      from custo cu
      full join (select * from public.rateio_indireto_percentuais where mes = v_mes) p on p.centro_custo_id = cu.id
  ),
  pct as (
    select b.id, b.custo_direto,
           case when sum(b.custo_direto) over () > 0
                then round(b.custo_direto * 100 / sum(b.custo_direto) over (), 6) else 0 end as sugerido,
           case when v_status is null
                then case when sum(b.custo_direto) over () > 0 then b.custo_direto / sum(b.custo_direto) over () else 0 end
                else coalesce(b.pct_gravado, 0) / 100 end as fracao
      from base b
  ),
  bruto as (
    select p.*, floor(v_indireto_cent * p.fracao)::bigint as cent,
           v_indireto_cent * p.fracao - floor(v_indireto_cent * p.fracao) as resto
      from pct p
  ),
  dist as (
    select b.*,
           (case when sum(b.fracao) over () > 0.999999
                 then v_indireto_cent - sum(b.cent) over () else 0 end) as sobra,
           row_number() over (order by b.resto desc, b.id) as ordem
      from bruto b
  ),
  final as (
    select d.id, d.custo_direto, d.sugerido, d.fracao,
           d.cent + case when d.ordem <= d.sobra then 1 else 0 end as cent
      from dist d
  ),
  totais as (select coalesce(sum(cent), 0) as rateado from final)
  select f.id, c.nome, round(f.custo_direto, 2), f.sugerido, round(f.fracao * 100, 6),
         round(f.cent / 100.0, 2), (f.custo_direto = 0),
         coalesce(v_status, 'automatico'),
         round((v_indireto_cent - (select rateado from totais)) / 100.0, 2),
         round(v_indireto_cent / 100.0, 2)
    from final f join public.centros_custo c on c.id = f.id
  union all
  select null::uuid, null::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, true,
         coalesce(v_status, 'automatico'), round(v_indireto_cent / 100.0, 2), round(v_indireto_cent / 100.0, 2)
   where not exists (select 1 from final)
  order by 3 desc;
end;
$function$;

-- Soma mes a mes numa janela [inicio, fim): por obra, e o nao rateado do periodo
-- numa linha com centro_id nulo.
create or replace function public.fn_rateio_indireto_periodo(p_inicio date, p_fim date)
 returns table(centro_id uuid, indireto numeric, nao_rateado numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.relatorios', 'ver') then
    raise exception 'Sem permissao para ver relatorios';
  end if;
  return query
    with x as (
      select g.mes::date as mes, m.centro_id, m.indireto, m.nao_rateado
        from generate_series(date_trunc('month', p_inicio)::date, (p_fim - interval '1 day')::date, interval '1 month') g(mes)
        cross join lateral public.fn_rateio_indireto_mes(g.mes::date) m
    )
    select x.centro_id, round(sum(x.indireto), 2), 0::numeric from x where x.centro_id is not null group by x.centro_id
    union all
    select null::uuid, 0::numeric, round(coalesce(sum(y.nr), 0), 2)
      from (select x.mes, max(x.nao_rateado) as nr from x group by x.mes) y;
end;
$function$;

-- Ajustar (ou confirmar) os percentuais de um mes. So quem fecha o mes
-- (financeiro.competencias aprovar); competencia fechada segue a regra do app.
create or replace function public.fn_rateio_indireto_salvar(p_mes date, p_percentuais jsonb, p_motivo text, p_confirmar boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_soma numeric;
begin
  if not public.tem_permissao('financeiro.competencias', 'aprovar') then
    raise exception 'Sem permissao para ajustar o rateio do indireto (precisa poder fechar o mes)';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do ajuste do rateio';
  end if;
  if jsonb_typeof(p_percentuais) is distinct from 'array' or jsonb_array_length(p_percentuais) = 0 then
    raise exception 'Informe os percentuais das obras';
  end if;
  perform public.fn_exigir_competencia_aberta(v_mes, 'rateio_indireto', null);

  if exists (select 1 from jsonb_array_elements(p_percentuais) e
              where not exists (select 1 from public.centros_custo c
                                 where c.id = (e->>'centroId')::uuid and c.nivel = 1 and c.tipo = 'obra' and c.papel_rateio is null)) then
    raise exception 'So obra que recebe rateio entra no ajuste (nao indireto, nao Carretas)';
  end if;
  if (select count(*) from jsonb_array_elements(p_percentuais)) <> (select count(distinct e->>'centroId') from jsonb_array_elements(p_percentuais) e) then
    raise exception 'A mesma obra aparece duas vezes no ajuste';
  end if;
  select round(sum((e->>'percentual')::numeric), 6) into v_soma from jsonb_array_elements(p_percentuais) e;
  if v_soma is null or abs(v_soma - 100) > 0.0001 then
    raise exception 'Os percentuais tem que somar 100%% (somam %)', v_soma;
  end if;

  insert into public.rateio_indireto_meses (mes, status, motivo, atualizado_por, atualizado_em)
  values (v_mes, case when p_confirmar then 'confirmado' else 'ajustado' end, btrim(p_motivo), (select auth.uid()), now())
  on conflict (mes) do update set status = excluded.status, motivo = excluded.motivo,
                                  atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em;
  delete from public.rateio_indireto_percentuais where mes = v_mes;
  insert into public.rateio_indireto_percentuais (mes, centro_custo_id, percentual)
  select v_mes, (e->>'centroId')::uuid, round((e->>'percentual')::numeric, 6) from jsonb_array_elements(p_percentuais) e;
  insert into public.rateio_indireto_eventos (mes, acao, motivo, percentuais, criado_por)
  values (v_mes, case when p_confirmar then 'confirmou' else 'ajustou' end, btrim(p_motivo), p_percentuais, (select auth.uid()));
end;
$function$;

-- Desfazer o ajuste do mes: volta ao automatico (pelo custo direto).
create or replace function public.fn_rateio_indireto_automatico(p_mes date, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_mes date := date_trunc('month', p_mes)::date;
begin
  if not public.tem_permissao('financeiro.competencias', 'aprovar') then
    raise exception 'Sem permissao para ajustar o rateio do indireto (precisa poder fechar o mes)';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo';
  end if;
  perform public.fn_exigir_competencia_aberta(v_mes, 'rateio_indireto', null);
  delete from public.rateio_indireto_meses where mes = v_mes;
  insert into public.rateio_indireto_eventos (mes, acao, motivo, criado_por)
  values (v_mes, 'voltou_ao_automatico', btrim(p_motivo), (select auth.uid()));
end;
$function$;

revoke execute on function public.fn_rateio_indireto_mes(date) from public, anon;
revoke execute on function public.fn_rateio_indireto_periodo(date, date) from public, anon;
revoke execute on function public.fn_rateio_indireto_salvar(date, jsonb, text, boolean) from public, anon;
revoke execute on function public.fn_rateio_indireto_automatico(date, text) from public, anon;
grant execute on function public.fn_rateio_indireto_mes(date) to authenticated;
grant execute on function public.fn_rateio_indireto_periodo(date, date) to authenticated;
grant execute on function public.fn_rateio_indireto_salvar(date, jsonb, text, boolean) to authenticated;
grant execute on function public.fn_rateio_indireto_automatico(date, text) to authenticated;
