-- O cartão "Pago no mês" do Painel deixa de somar os lançamentos que a aba
-- Aplicações gera sozinha (origem 'aplicacao': rendimento negativo e ajuste de
-- abertura). Não são pagamento: ninguém recebeu esse dinheiro. Em 14/10/2026 o
-- cartão de outubro carregava R$ 293.228,59 de rendimento negativo, e o de
-- setembro R$ 4.798.542,77 de ajuste de abertura.
--
-- O cartão abre a aba Pagas, que passa a esconder a mesma origem
-- (`aplicarFiltrosPagas`): os dois têm que contar o mesmo conjunto.
--
-- A view `vw_parcelas_caixa` NÃO muda: ela alimenta o saldo das contas, e o
-- saldo da subconta de investimentos só fecha com esses lançamentos.
-- Mesma assinatura, então os grants continuam.

CREATE OR REPLACE FUNCTION public.fn_rel_gestao_financeiro_resumo(p_hoje date DEFAULT NULL::date)
 RETURNS TABLE(a_pagar_contagem integer, a_pagar_vencidas integer, a_pagar_valor numeric, a_aprovar_contagem integer, a_aprovar_valor numeric, pago_mes_contagem integer, pago_mes_valor numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    select v.status, v.valor, v.valor_liquido, v.data_vencimento, v.data_pagamento
    from public.vw_parcelas_caixa v
    where v.tipo = 'a_pagar'
      and v.origem <> 'aplicacao'
  )
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
    coalesce(sum(b.valor_liquido) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    ), 0)
  from janela j
  left join base b on true
$function$;
