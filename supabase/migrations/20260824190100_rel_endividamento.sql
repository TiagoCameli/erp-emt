-- As duas consultas do relatorio de endividamento.
--
-- Ambas SECURITY INVOKER (o padrao dos outros relatorios, como
-- fn_rel_posicao_bancaria): elas leem `lancamentos` e `lancamento_parcelas`
-- passando pela RLS, entao quem nao pode ver lancamento nao ve divida nenhuma.
-- Se fossem definer, o relatorio furaria a permissao de quem so tem a aba de
-- relatorios.
--
-- O saldo devedor NAO e um campo: e a soma das parcelas que ainda nao foram
-- pagas. Por isso as duas contam parcela, e nao o `valor` do lancamento -- um
-- financiamento de 57 parcelas com 17 pagas deve o que falta, nao o total
-- contratado.

-- ---------------------------------------------------------------------------
-- 1. Uma linha por contrato
-- ---------------------------------------------------------------------------

create or replace function public.fn_rel_endividamento()
returns table (
  lancamento_id uuid,
  numero text,
  credor text,
  descricao text,
  categoria text,
  valor_contratado numeric,
  total_pago numeric,
  saldo_devedor numeric,
  parcelas int,
  parcelas_pagas int,
  proximo_vencimento date
)
language sql
stable
set search_path to ''
as $$
  select
    l.id,
    l.numero,
    coalesce(f.nome_fantasia, f.razao_social, '(sem credor)') as credor,
    l.descricao,
    coalesce(cf.nome, '(sem categoria)') as categoria,
    l.valor as valor_contratado,
    -- Pago pelo LIQUIDO: e o que saiu da conta de fato.
    coalesce(sum(p.valor_liquido) filter (where p.status = 'pago'), 0) as total_pago,
    coalesce(sum(p.valor) filter (where p.status <> 'pago'), 0) as saldo_devedor,
    count(p.id)::int as parcelas,
    count(p.id) filter (where p.status = 'pago')::int as parcelas_pagas,
    min(p.data_vencimento) filter (where p.status <> 'pago') as proximo_vencimento
  from public.lancamentos l
  left join public.lancamento_parcelas p on p.lancamento_id = l.id
  left join public.fornecedores f on f.id = l.fornecedor_id
  left join public.categorias_financeiras cf on cf.id = l.categoria_id
  where l.e_divida
    and l.status <> 'cancelado'
  group by l.id, l.numero, f.nome_fantasia, f.razao_social, l.descricao, cf.nome, l.valor
$$;

revoke all on function public.fn_rel_endividamento() from public;
grant execute on function public.fn_rel_endividamento() to authenticated;

comment on function public.fn_rel_endividamento() is
  'Uma linha por divida marcada (e_divida): contratado, pago, saldo e proximo vencimento. Saldo sai da soma das parcelas em aberto, nao de um campo.';

-- ---------------------------------------------------------------------------
-- 2. O que vence pela frente, mes a mes
-- ---------------------------------------------------------------------------
-- So parcela EM ABERTO. Parcela vencida e nao paga entra no primeiro mes, e nao
-- no mes em que venceu: para o caixa, ela e um compromisso de agora.

create or replace function public.fn_rel_endividamento_por_mes(p_meses int default 12)
returns table (
  mes date,
  valor numeric,
  parcelas int
)
language sql
stable
set search_path to ''
as $$
  with limite as (
    select (date_trunc('month', (now() at time zone 'America/Rio_Branco')::date)
            + (greatest(coalesce(p_meses, 12), 1) || ' months')::interval)::date as fim,
           date_trunc('month', (now() at time zone 'America/Rio_Branco')::date)::date as inicio
  )
  select
    greatest(date_trunc('month', p.data_vencimento)::date, limite.inicio) as mes,
    sum(p.valor) as valor,
    count(*)::int as parcelas
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  cross join limite
  where l.e_divida
    and l.status <> 'cancelado'
    and p.status <> 'pago'
    and p.data_vencimento is not null
    and p.data_vencimento < limite.fim
  group by 1
  order by 1
$$;

revoke all on function public.fn_rel_endividamento_por_mes(int) from public;
grant execute on function public.fn_rel_endividamento_por_mes(int) to authenticated;

comment on function public.fn_rel_endividamento_por_mes(int) is
  'Parcelas de divida em aberto por mes de vencimento, nos proximos N meses. Parcela vencida e nao paga cai no mes corrente: para o caixa ela e compromisso de agora.';
