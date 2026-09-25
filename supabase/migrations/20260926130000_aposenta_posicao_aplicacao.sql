-- =============================================================
-- Aposenta fn_rel_posicao_aplicacao
--
-- APLICAR SO DEPOIS DO DEPLOY DO PR DAS APLICACOES (o codigo anterior le
-- aplicado/resgatado/posicao_aplicacao de fn_saldos_das_contas; tirar a coluna
-- antes derruba Contas bancarias, Pagamentos, Transferencias e Relatorios).
--
-- fn_rel_posicao_aplicacao media o modelo ANTIGO (lancamentos de natureza
-- movimentacao), e o numero nao fazia sentido: os 49 "Resgate de aplicacao"
-- antigos nao tem aplicacao correspondente. Quem chamava: so
-- fn_saldos_das_contas (colunas aplicado/resgatado/posicao_aplicacao), que
-- alimentava a coluna oculta "Em aplicacao" de Contas bancarias, removida no
-- mesmo PR. A posicao agora mora em Financeiro > Aplicacoes (fn_aba_aplicacoes).
-- =============================================================
drop function public.fn_saldos_das_contas();

create function public.fn_saldos_das_contas()
 returns table(
   conta_bancaria_id uuid, saldo_inicial numeric, saldo_inicial_data date,
   entradas numeric, saidas numeric, saldo numeric,
   anterior_parcelas integer, anterior_recebido numeric, anterior_pago numeric
 )
 language sql
 stable security definer
 set search_path to ''
as $function$
  with permitidas as (
    select c.id, c.saldo_inicial, c.saldo_inicial_data
    from public.contas_bancarias c
    where public.fn_pode_ver_saldo(c.id)
  ),
  mov as (
    select
      m.conta_bancaria_id as conta,
      coalesce(sum(m.total) filter (
        where m.tipo in ('a_receber', 'transferencia_entrada')), 0) as entradas,
      coalesce(sum(m.total) filter (
        where m.tipo not in ('a_receber', 'transferencia_entrada')), 0) as saidas
    from public.fn_rel_posicao_bancaria() m
    group by m.conta_bancaria_id
  ),
  antes as (select * from public.fn_rel_movimento_antes_do_corte())
  select
    p.id,
    p.saldo_inicial,
    p.saldo_inicial_data,
    coalesce(mov.entradas, 0),
    coalesce(mov.saidas, 0),
    round(p.saldo_inicial + coalesce(mov.entradas, 0) - coalesce(mov.saidas, 0), 2),
    antes.parcelas,
    antes.recebido,
    antes.pago
  from permitidas p
  left join mov on mov.conta = p.id
  left join antes on antes.conta_bancaria_id = p.id
$function$;

revoke all on function public.fn_saldos_das_contas() from public, anon;
grant execute on function public.fn_saldos_das_contas() to authenticated;

drop function public.fn_rel_posicao_aplicacao();
