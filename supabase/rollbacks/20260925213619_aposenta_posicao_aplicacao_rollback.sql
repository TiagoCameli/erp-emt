-- Rollback de 20260925213619: devolve fn_rel_posicao_aplicacao e as tres
-- colunas de fn_saldos_das_contas (texto de 20260822180000 e 20260827184118).
create or replace function public.fn_rel_posicao_aplicacao()
 returns table(conta_bancaria_id uuid, aplicado numeric, resgatado numeric, posicao numeric)
 language sql stable set search_path to ''
as $function$
  select p.conta_bancaria_id,
    coalesce(sum(p.valor_liquido) filter (where l.tipo = 'a_pagar'), 0) as aplicado,
    coalesce(sum(p.valor_liquido) filter (where l.tipo = 'a_receber'), 0) as resgatado,
    coalesce(sum(case when l.tipo = 'a_pagar' then p.valor_liquido else -p.valor_liquido end), 0) as posicao
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  join public.categorias_financeiras c on c.id = l.categoria_id
  where p.status = 'pago' and p.conta_bancaria_id is not null and l.status <> 'cancelado'
    and c.natureza = 'movimentacao'
  group by p.conta_bancaria_id
$function$;
revoke all on function public.fn_rel_posicao_aplicacao() from public, anon, authenticated;

drop function public.fn_saldos_das_contas();
create function public.fn_saldos_das_contas()
 returns table(conta_bancaria_id uuid, saldo_inicial numeric, saldo_inicial_data date, entradas numeric, saidas numeric, saldo numeric, anterior_parcelas integer, anterior_recebido numeric, anterior_pago numeric, aplicado numeric, resgatado numeric, posicao_aplicacao numeric)
 language sql stable security definer set search_path to ''
as $function$
  with permitidas as (
    select c.id, c.saldo_inicial, c.saldo_inicial_data
    from public.contas_bancarias c
    where public.fn_pode_ver_saldo(c.id)
  ),
  mov as (
    select m.conta_bancaria_id as conta,
      coalesce(sum(m.total) filter (where m.tipo in ('a_receber', 'transferencia_entrada')), 0) as entradas,
      coalesce(sum(m.total) filter (where m.tipo not in ('a_receber', 'transferencia_entrada')), 0) as saidas
    from public.fn_rel_posicao_bancaria() m
    group by m.conta_bancaria_id
  ),
  antes as (select * from public.fn_rel_movimento_antes_do_corte()),
  apl as (select * from public.fn_rel_posicao_aplicacao())
  select p.id, p.saldo_inicial, p.saldo_inicial_data,
    coalesce(mov.entradas, 0), coalesce(mov.saidas, 0),
    round(p.saldo_inicial + coalesce(mov.entradas, 0) - coalesce(mov.saidas, 0), 2),
    antes.parcelas, antes.recebido, antes.pago,
    apl.aplicado, apl.resgatado, apl.posicao
  from permitidas p
  left join mov on mov.conta = p.id
  left join antes on antes.conta_bancaria_id = p.id
  left join apl on apl.conta_bancaria_id = p.id
$function$;
revoke all on function public.fn_saldos_das_contas() from public, anon;
grant execute on function public.fn_saldos_das_contas() to authenticated;
