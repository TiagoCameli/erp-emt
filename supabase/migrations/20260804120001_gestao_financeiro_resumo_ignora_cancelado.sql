-- =============================================================
-- Painel de Gestao: os KPIs do Financeiro param de contar lancamento CANCELADO.
--
-- Defeito (medido em 04/08/2026): fn_rel_gestao_financeiro_resumo filtrava so
-- lancamentos.tipo = 'a_pagar'. Lancamento cancelado continuava entrando, e os
-- cartoes "A pagar em aberto", "Vence em ate 7 dias", "Pagamentos a aprovar" e
-- "Pago no mes" mostravam MAIS do que a empresa deve. E a primeira tela depois
-- do login, e as dez fn_rel_* irmas (aging, dre, fluxo de caixa, posicao
-- bancaria, custo por mes/centro/grupo/insumo/subcategoria, fornecedores) todas
-- ja cortam cancelado, entao o painel discordava dos relatorios do mesmo dado.
-- Na propria tela de Gestao, a tabela "maiores custos" ja usava .neq('status',
-- 'cancelado'): os cartoes discordavam da tabela logo abaixo deles.
--
-- Como isso entrou: quando essas somas viraram RPC (20260801120001), o pedido
-- foi preservar a semantica do TypeScript antigo para a prova de paridade
-- fechar, e o comentario daquela migration registrou que o corte "a pagar" NAO
-- excluia cancelado. Paridade com um numero errado e numero errado.
--
-- O criterio e copia do das irmas, nao um setimo criterio: `l.status <>
-- 'cancelado'` no cabecalho do lancamento (identico a fn_rel_aging,
-- fn_rel_fluxo_caixa, fn_rel_posicao_bancaria, fn_rel_dre e as fn_rel_custo_*).
-- A parcela cancelada nao precisa de filtro proprio aqui: cada um dos tres
-- cortes ja pede um status exato de parcela (aprovado, pendente, pago), e
-- 'cancelado' nao e nenhum dos tres. Repetir `p.status <> 'cancelado'` seria
-- linha morta.
--
-- Efeito colateral consciente em "Pago no mes": fn_cancelar_ordem_compra
-- cancela o cabecalho do lancamento mas PRESERVA a parcela ja paga (dinheiro
-- que saiu nao se mexe). Com este filtro, essa parcela paga sai tambem do "Pago
-- no mes" do painel. E o que fn_rel_posicao_bancaria e fn_rel_fluxo_caixa ja
-- fazem hoje: o painel passa a concordar com o extrato e com o DRE em vez de
-- discordar. Nao ha nenhuma linha assim no banco hoje (0 lancamentos
-- cancelados).
--
-- Nada e renomeado: mesma funcao, mesma assinatura, mesmas sete colunas de
-- retorno, mesmos grants. Nenhum TypeScript precisa acompanhar. Unica mudanca
-- de comportamento: cancelado sai da conta.
--
-- Prova em supabase/provas/gestao_resumo_ignora_cancelado.sql (roda contra
-- producao em begin ... rollback; 11 de 11 passaram em 04/08/2026).
--
-- Aplicada em producao por MCP em 04/08/2026, versao 20260804204627. md5 do
-- prosrc: 505d0ce3aa98748a226ece9f591c504d antes,
-- 92967669ba1489f4c282ca6ed5316dbb depois.
-- =============================================================

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
    -- Lancamento cancelado nao e divida: fora dos tres cortes, com o MESMO
    -- criterio das fn_rel_* irmas. Parcela cancelada ja cai fora sozinha,
    -- porque cada corte abaixo exige um status exato de parcela.
    select p.status, p.valor, p.data_vencimento, p.data_pagamento
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
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

-- create or replace nao mexe em grant nem em owner; os dois ficam aqui de
-- proposito, para a funcao continuar autocontida se alguem rodar so este
-- arquivo num banco novo.
revoke all on function public.fn_rel_gestao_financeiro_resumo(date) from public, anon;
grant execute on function public.fn_rel_gestao_financeiro_resumo(date) to authenticated;

comment on function public.fn_rel_gestao_financeiro_resumo(date) is
  'KPIs do Financeiro no painel de Gestao (a pagar ate 7 dias com vencidas, a aprovar, pago no mes) agregados no banco. Ignora lancamento cancelado, igual as fn_rel_* irmas. p_hoje nulo = hoje em America/Rio_Branco. Uma linha.';

-- fn_rel_gestao_compras_resumo NAO tem o mesmo defeito e nao e tocada aqui:
-- ela filtra por lista branca (`oc.status in ('pendente_aprovacao',
-- 'aprovado')`, e `c.status = 'aberta'` nas cotacoes), e 'cancelado' /
-- 'cancelada' sao status mutuamente exclusivos no check das duas tabelas. OC
-- cancelada, portanto, nunca entra. Confirmado tambem em
-- fn_cancelar_ordem_compra, que grava status = 'cancelado' na OC.

notify pgrst, 'reload schema';
