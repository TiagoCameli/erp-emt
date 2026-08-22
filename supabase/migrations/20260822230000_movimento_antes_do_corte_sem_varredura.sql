-- =============================================================
-- "Fora do saldo pelo corte" nao pode contar o que ja estava fora
--
-- `fn_rel_movimento_antes_do_corte` existe para uma frase na tela: quantos
-- pagamentos e quanto valor a DATA DE CORTE deixou fora do saldo. Ela alimenta o
-- rotulo da coluna "Saldo atual" em Contas bancarias:
--
--   "Fora do saldo: N pagamento(s) anteriores, R$ X recebidos e R$ Y pagos
--    (ja representados pelo saldo de abertura)."
--
-- Depois da opcao A (20260822210000), aplicacao e resgate do principal estao
-- fora do saldo por NATUREZA, corte ou nao corte. Conta-los aqui faria a frase
-- mentir duas vezes: exageraria o efeito do corte e atribuiria a ele um
-- movimento que ele nao removeu.
--
-- Nao muda nada hoje: nenhuma conta tem data de corte, entao a funcao devolve
-- zero linhas. Entra agora porque e no dia do rebase que a frase vai ser lida, e
-- ai o numero errado ja estaria na tela.
--
-- Mesmo left join das irmas: `lancamentos.categoria_id` e nulavel.
-- =============================================================

create or replace function public.fn_rel_movimento_antes_do_corte()
returns table(
  conta_bancaria_id uuid,
  corte date,
  parcelas integer,
  recebido numeric,
  pago numeric
)
language sql
stable
set search_path to ''
as $function$
  select
    c.id,
    c.saldo_inicial_data,
    count(p.id)::int,
    coalesce(sum(p.valor_liquido) filter (where l.tipo = 'a_receber'), 0),
    coalesce(sum(p.valor_liquido) filter (where l.tipo = 'a_pagar'), 0)
  from public.contas_bancarias c
  join public.lancamento_parcelas p on p.conta_bancaria_id = c.id
  join public.lancamentos l on l.id = p.lancamento_id
  left join public.categorias_financeiras cf on cf.id = l.categoria_id
  where c.saldo_inicial_data is not null
    and p.status = 'pago'
    and l.status <> 'cancelado'
    and p.data_pagamento is not null
    and p.data_pagamento <= c.saldo_inicial_data
    -- A varredura esta fora do saldo por natureza, nao pelo corte. Contar aqui
    -- daria ao corte o credito de ter removido algo que ele nao removeu.
    and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
  group by c.id, c.saldo_inicial_data
$function$;

revoke all on function public.fn_rel_movimento_antes_do_corte() from public, anon;
grant execute on function public.fn_rel_movimento_antes_do_corte() to authenticated;

comment on function public.fn_rel_movimento_antes_do_corte() is
  'Pagamentos que a DATA DE CORTE deixou fora do saldo de cada conta, para a tela dizer isso em vez de esconder. Nao conta natureza movimentacao: aquela ja esta fora do saldo por conta propria (opcao A), e somar aqui atribuiria ao corte um efeito que nao e dele.';
