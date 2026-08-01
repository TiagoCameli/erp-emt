-- =============================================================
-- Painel de Gestao: os KPIs de Compras e Financeiro passam a somar NO BANCO.
--
-- Defeito corrigido (01/08/2026): comprasResumo e financeiroResumo buscavam as
-- LINHAS (select valor_total / select valor) e somavam no Node. O PostgREST tem
-- teto silencioso de 1000 linhas: passando disso ele devolve 1000 sem erro
-- nenhum, e os cartoes "A pagar em aberto", "Vence em ate 7 dias", "Pagamentos a
-- aprovar" e "Pago no mes" comecariam a mostrar um numero MENOR que o real, sem
-- aviso, na primeira tela depois do login. lancamento_parcelas e a tabela de
-- maior volume do ERP, entao era questao de tempo. Numero errado na tela do dono
-- e pior que tela feia: o count/sum agora sai do Postgres, que nao trunca.
--
-- SECURITY INVOKER, igual as fn_rel_* irmas (conferido com pg_get_functiondef no
-- banco vivo, nao nas migrations do repo): rodam sob o RLS do usuario logado,
-- exatamente como as consultas diretas que substituem. Quem nao ve
-- ordens_compra / lancamento_parcelas continua vendo zero, sem checagem de
-- permissao duplicada dentro da funcao. Leitura pura, STABLE, search_path fixo.
--
-- Os filtros sao copia fiel dos que o TypeScript fazia. Nenhuma regra de negocio
-- muda aqui: so o LUGAR onde a soma acontece. Em particular, o corte "a pagar"
-- olha lancamentos.tipo e NAO exclui lancamento cancelado, porque era isso que a
-- tela ja fazia; mudar isso e outra decisao, com outra prova.
-- =============================================================

-- ---------- Compras: OCs a aprovar, OCs abertas e cotacoes em aberto ----------
-- Uma linha so. As duas somas saem da mesma varredura de ordens_compra
-- (count/sum com FILTER), e a contagem de cotacoes vem por subconsulta escalar
-- porque e outra tabela.
create or replace function public.fn_rel_gestao_compras_resumo()
returns table (
  ocs_aprovar_contagem int,
  ocs_aprovar_valor numeric,
  ocs_abertas_contagem int,
  ocs_abertas_valor numeric,
  cotacoes_abertas int
)
language sql
stable
set search_path = ''
as $$
  select
    count(*) filter (where oc.status = 'pendente_aprovacao')::int,
    coalesce(sum(oc.valor_total) filter (where oc.status = 'pendente_aprovacao'), 0),
    count(*) filter (where oc.status = 'aprovado')::int,
    coalesce(sum(oc.valor_total) filter (where oc.status = 'aprovado'), 0),
    (select count(*) from public.cotacoes c where c.status = 'aberta')::int
  from public.ordens_compra oc
  where oc.status in ('pendente_aprovacao', 'aprovado')
$$;

revoke all on function public.fn_rel_gestao_compras_resumo() from public, anon;
grant execute on function public.fn_rel_gestao_compras_resumo() to authenticated;

comment on function public.fn_rel_gestao_compras_resumo() is
  'KPIs de Compras do painel de Gestao (OCs a aprovar, OCs abertas, cotacoes abertas) agregados no banco. Uma linha.';

-- ---------- Financeiro: a pagar, a aprovar e pago no mes ----------
-- p_hoje existe para a tela mandar a MESMA data que ela usa no resto do painel
-- (dataHojeISO, fuso de Rio Branco) e para a prova conseguir fixar o dia. Nulo
-- cai no hoje de Rio Branco, nunca no UTC do servidor, que vira o dia seguinte
-- as 21h locais.
create or replace function public.fn_rel_gestao_financeiro_resumo(p_hoje date default null)
returns table (
  a_pagar_contagem int,
  a_pagar_vencidas int,
  a_pagar_valor numeric,
  a_aprovar_contagem int,
  a_aprovar_valor numeric,
  pago_mes_contagem int,
  pago_mes_valor numeric
)
language sql
stable
set search_path = ''
as $$
  with janela as (
    select
      d.hoje,
      d.hoje + 7 as limite7,
      date_trunc('month', d.hoje)::date as inicio_mes,
      (date_trunc('month', d.hoje) + interval '1 month')::date as proximo_mes
    from (
      select coalesce(
        p_hoje,
        (now() at time zone 'America/Rio_Branco')::date
      ) as hoje
    ) d
  ),
  base as (
    select p.status, p.valor, p.data_vencimento, p.data_pagamento
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where l.tipo = 'a_pagar'
  )
  -- left join ... on true garante uma linha mesmo com base vazia: os FILTER
  -- viram falso e a funcao devolve zeros, nunca "nenhuma linha".
  select
    count(*) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    )::int,
    count(*) filter (
      where b.status = 'aprovado'
        and b.data_vencimento <= j.limite7
        and b.data_vencimento < j.hoje
    )::int,
    coalesce(sum(b.valor) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    ), 0),
    count(*) filter (where b.status = 'pendente')::int,
    coalesce(sum(b.valor) filter (where b.status = 'pendente'), 0),
    count(*) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    )::int,
    coalesce(sum(b.valor) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    ), 0)
  from janela j
  left join base b on true
$$;

revoke all on function public.fn_rel_gestao_financeiro_resumo(date) from public, anon;
grant execute on function public.fn_rel_gestao_financeiro_resumo(date) to authenticated;

comment on function public.fn_rel_gestao_financeiro_resumo(date) is
  'KPIs do Financeiro no painel de Gestao (a pagar ate 7 dias com vencidas, a aprovar, pago no mes) agregados no banco. p_hoje nulo = hoje em America/Rio_Branco. Uma linha.';

notify pgrst, 'reload schema';
