-- Posicao bancaria contra o extrato (15/10/2026).
--
-- A auditoria de 15/10 achou a BB 30.893-5 com -640.000,00 no sistema e 0,00 no
-- ultimo OFX (08/10): a transferencia de 13/10 entrou no sistema, o extrato que
-- a confirma ainda nao foi importado. A tela nao tinha como mostrar isso.
--
-- Por conta visivel (mesmo `fn_pode_ver_saldo` de `fn_saldos_das_contas`): o
-- ultimo extrato importado (data e saldo final do OFX), o movimento que o
-- sistema registra DEPOIS dessa data e, com ele, o saldo do sistema NA DATA do
-- extrato. A diferenca na data e o que nao fecha; o movimento depois e o que o
-- banco ainda nao confirmou.
--
-- Mesmo recorte de movimento de `fn_rel_posicao_bancaria`: parcela `no_saldo` e
-- transferencias depois do corte. Parcela paga sem data de pagamento conta como
-- ja estando no extrato (nao ha data para empurra-la para depois).
--
-- SECURITY DEFINER porque `fn_rel_posicao_bancaria` e `saldo_inicial` nao sao
-- legiveis pelo `authenticated`; a permissao de saldo e checada aqui dentro,
-- por conta, com o `auth.uid()` de quem chama. Conta AUSENTE = sem permissao.
-- So acrescenta: nada que o cliente no ar chama muda.

create function public.fn_conferencia_extrato_contas()
 returns table(
   conta_bancaria_id uuid,
   extrato_data date,
   extrato_saldo numeric,
   saldo_sistema numeric,
   movimento_depois numeric,
   lancamentos_depois integer,
   saldo_sistema_na_data numeric,
   diferenca_na_data numeric
 )
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with permitidas as (
    select c.id, c.saldo_inicial_data
    from public.contas_bancarias c
    where c.ativo and public.fn_pode_ver_saldo(c.id)
  ),
  ultimo as (
    select distinct on (e.conta_bancaria_id)
      e.conta_bancaria_id,
      coalesce(e.saldo_final_data, e.periodo_fim) as data,
      e.saldo_final
    from public.extratos_ofx e
    join permitidas p on p.id = e.conta_bancaria_id
    where e.saldo_final is not null
      and coalesce(e.saldo_final_data, e.periodo_fim) is not null
    order by e.conta_bancaria_id,
      coalesce(e.saldo_final_data, e.periodo_fim) desc,
      e.importado_em desc
  ),
  movimento as (
    select v.conta_bancaria_id as conta, v.data_pagamento as data,
      case when v.tipo = 'a_receber' then v.valor_liquido else -v.valor_liquido end as valor
    from public.vw_parcelas_caixa v
    join permitidas p on p.id = v.conta_bancaria_id
    where v.no_saldo
    union all
    select t.conta_destino_id, t.data_transferencia, t.valor
    from public.transferencias_contas t
    join permitidas p on p.id = t.conta_destino_id
    where p.saldo_inicial_data is null or t.data_transferencia > p.saldo_inicial_data
    union all
    select t.conta_origem_id, t.data_transferencia, -(t.valor + t.tarifa)
    from public.transferencias_contas t
    join permitidas p on p.id = t.conta_origem_id
    where p.saldo_inicial_data is null or t.data_transferencia > p.saldo_inicial_data
  ),
  depois as (
    select u.conta_bancaria_id as conta,
      coalesce(sum(m.valor), 0) as total,
      count(m.valor)::integer as quantos
    from ultimo u
    left join movimento m on m.conta = u.conta_bancaria_id and m.data > u.data
    group by u.conta_bancaria_id
  )
  select
    s.conta_bancaria_id,
    u.data,
    u.saldo_final,
    s.saldo,
    d.total,
    d.quantos,
    case when u.data is null then null else round(s.saldo - d.total, 2) end,
    case when u.data is null then null else round(s.saldo - d.total - u.saldo_final, 2) end
  from public.fn_saldos_das_contas() s
  left join ultimo u on u.conta_bancaria_id = s.conta_bancaria_id
  left join depois d on d.conta = s.conta_bancaria_id
$function$;

comment on function public.fn_conferencia_extrato_contas() is
  'Por conta com saldo visivel: ultimo extrato OFX (data, saldo final), movimento do sistema depois dele e a diferenca na data do extrato (15/10/2026).';

revoke all on function public.fn_conferencia_extrato_contas() from public, anon;
grant execute on function public.fn_conferencia_extrato_contas() to authenticated;

do $$
declare
  v oid := 'public.fn_conferencia_extrato_contas()'::regprocedure;
begin
  if not has_function_privilege('authenticated', v, 'execute') then
    raise exception 'fn_conferencia_extrato_contas sem execute para authenticated';
  end if;
  if has_function_privilege('anon', v, 'execute') then
    raise exception 'fn_conferencia_extrato_contas com execute para anon';
  end if;
end $$;
