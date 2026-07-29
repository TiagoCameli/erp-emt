-- A trilha do fechamento de competencia tem tabela propria.
--
-- A primeira versao (20260729180001) gravava fechamento, reabertura e excecao
-- direto no audit_log com acao propria. A prova de aceite estourou na primeira
-- tentativa de lancar em mes fechado: `audit_log_acao_check` so aceita INSERT,
-- UPDATE e DELETE. Forcar o contrato do audit_log seria remendo, e o evento de
-- competencia tem campos proprios (mes, motivo, documento), entao ganhou tabela.

create table if not exists public.competencia_eventos (
  id uuid primary key default gen_random_uuid(),
  mes date not null,
  tipo text not null check (tipo in ('fechou', 'reabriu', 'excecao')),
  motivo text,
  entidade_tipo text,
  entidade_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint competencia_eventos_dia1 check (extract(day from mes) = 1)
);

comment on table public.competencia_eventos is
  'Trilha do fechamento de competencia: quem fechou, quem reabriu (com motivo) e quem lancou em mes fechado pela excecao.';

create index if not exists idx_competencia_eventos_mes
  on public.competencia_eventos (mes, created_at desc);

alter table public.competencia_eventos enable row level security;

drop policy if exists competencia_eventos_select on public.competencia_eventos;
create policy competencia_eventos_select
  on public.competencia_eventos for select
  to authenticated
  using (public.tem_permissao('financeiro.competencias', 'ver'));

revoke all on table public.competencia_eventos from anon, authenticated;
grant select on table public.competencia_eventos to authenticated;

drop trigger if exists trg_audit_competencia_eventos on public.competencia_eventos;
create trigger trg_audit_competencia_eventos
  after insert or update or delete on public.competencia_eventos
  for each row execute function public.fn_audit();

create or replace function public.fn_exigir_competencia_aberta(
  p_mes date,
  p_entidade text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
begin
  if not public.fn_competencia_fechada(v_mes) then
    return;
  end if;

  if not public.tem_permissao('financeiro.competencias', 'desaprovar') then
    raise exception 'A competencia %/% esta fechada: nao da para lancar nela. Reabra a competencia ou escolha outro mes de referencia.',
      to_char(v_mes, 'MM'), to_char(v_mes, 'YYYY');
  end if;

  insert into public.competencia_eventos (mes, tipo, entidade_tipo, entidade_id, created_by)
  values (v_mes, 'excecao', p_entidade, p_id, (select auth.uid()));
end;
$$;

revoke all on function public.fn_exigir_competencia_aberta(date, text, uuid) from public;

create or replace function public.fn_fechar_competencia(
  p_mes date,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mes date;
  v_obs text;
begin
  if not public.tem_permissao('financeiro.competencias', 'aprovar') then
    raise exception 'Sem permissao para fechar competencia';
  end if;
  if p_mes is null then
    raise exception 'Informe o mes a fechar';
  end if;

  v_mes := date_trunc('month', p_mes)::date;
  v_obs := nullif(btrim(coalesce(p_observacao, '')), '');

  if v_mes > date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date then
    raise exception 'Nao da para fechar um mes que ainda nao comecou';
  end if;

  -- Fechar duas vezes nao duplica nem gera evento novo.
  if public.fn_competencia_fechada(v_mes) then
    return;
  end if;

  insert into public.competencias_fechadas (mes, observacao, fechado_por, created_by)
  values (v_mes, v_obs, (select auth.uid()), (select auth.uid()));

  insert into public.competencia_eventos (mes, tipo, motivo, created_by)
  values (v_mes, 'fechou', v_obs, (select auth.uid()));
end;
$$;

revoke all on function public.fn_fechar_competencia(date, text) from public;
grant execute on function public.fn_fechar_competencia(date, text) to authenticated;

create or replace function public.fn_reabrir_competencia(
  p_mes date,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mes date;
  v_motivo text;
begin
  if not public.tem_permissao('financeiro.competencias', 'desaprovar') then
    raise exception 'Sem permissao para reabrir competencia';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if v_motivo = '' then
    raise exception 'Informe o motivo da reabertura';
  end if;

  v_mes := date_trunc('month', p_mes)::date;

  if not public.fn_competencia_fechada(v_mes) then
    raise exception 'Esta competencia nao esta fechada';
  end if;

  delete from public.competencias_fechadas where mes = v_mes;

  insert into public.competencia_eventos (mes, tipo, motivo, created_by)
  values (v_mes, 'reabriu', v_motivo, (select auth.uid()));
end;
$$;

revoke all on function public.fn_reabrir_competencia(date, text) from public;
grant execute on function public.fn_reabrir_competencia(date, text) to authenticated;

-- O painel passa a mostrar quantas excecoes e reaberturas o mes teve: mes
-- fechado com excecao e mes cujo custo mudou depois de fechado.
drop function if exists public.fn_competencias_painel(int);

create or replace function public.fn_competencias_painel(p_meses int default 13)
returns table(
  mes date,
  fechada boolean,
  fechado_em timestamptz,
  fechado_por uuid,
  observacao text,
  custo numeric,
  lancamentos int,
  incompletos int,
  excecoes int,
  reaberturas int
)
language sql
stable
security definer
set search_path to ''
as $$
  with meses as (
    select date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date
           - (n || ' months')::interval as mes
    from generate_series(0, greatest(coalesce(p_meses, 13), 1) - 1) as n
    union
    select mes::timestamp from public.competencias_fechadas
    union
    select mes::timestamp from public.competencia_eventos
    union
    select distinct mes_competencia::timestamp from public.lancamentos
  )
  select
    m.mes::date,
    (cf.mes is not null) as fechada,
    cf.fechado_em,
    cf.fechado_por,
    cf.observacao,
    coalesce((
      select sum(r.valor)
      from public.lancamento_rateios r
      join public.lancamentos l on l.id = r.lancamento_id
      where l.tipo = 'a_pagar' and l.status <> 'cancelado'
        and l.mes_competencia = m.mes::date
    ), 0) as custo,
    (
      select count(*)::int from public.lancamentos l
      where l.mes_competencia = m.mes::date and l.status <> 'cancelado'
    ) as lancamentos,
    (
      select count(*)::int from public.lancamentos l
      where l.mes_competencia = m.mes::date and l.status = 'previsto'
    ) as incompletos,
    (
      select count(*)::int from public.competencia_eventos e
      where e.mes = m.mes::date and e.tipo = 'excecao'
    ) as excecoes,
    (
      select count(*)::int from public.competencia_eventos e
      where e.mes = m.mes::date and e.tipo = 'reabriu'
    ) as reaberturas
  from meses m
  left join public.competencias_fechadas cf on cf.mes = m.mes::date
  where public.tem_permissao('financeiro.competencias', 'ver')
  order by m.mes desc
$$;

revoke all on function public.fn_competencias_painel(int) from public;
grant execute on function public.fn_competencias_painel(int) to authenticated;
