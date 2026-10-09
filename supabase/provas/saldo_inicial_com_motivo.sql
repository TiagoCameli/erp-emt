-- Prova: saldo inicial so muda com motivo e nunca em conta com mes conciliado
-- fechado (PR 1 do controle total, 09/10/2026). Rodar em begin/rollback; termina
-- com raise 'PROVA OK'.

-- Como owner com o usuario nos claims: auth.uid() vem dos claims e e isso que o
-- trigger e as RPCs usam; a coluna saldo_inicial nao e legivel por authenticated.
select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_bb102 uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_sub102 uuid := '5c8e0e86-bbdb-46a4-9809-1e1700fffac0';
  v_caixinha uuid := '68269366-f466-4e37-abdd-5de690f72eaa';
  v_saldo numeric; v_data date; v_msg text; v_eventos int;
begin
  select saldo_inicial, saldo_inicial_data into v_saldo, v_data from public.contas_bancarias where id = v_caixinha;

  -- 1. Update direto, sem motivo: recusado.
  begin
    update public.contas_bancarias set saldo_inicial = v_saldo + 1 where id = v_caixinha;
    v_msg := 'FALHOU 1: mudou sem motivo';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%motivo%' then raise exception 'FALHOU 1: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 2. Pela RPC com motivo: passa e grava o evento.
  perform public.fn_alterar_saldo_inicial(v_caixinha, v_saldo + 1, v_data, 'prova');
  select count(*) into v_eventos from public.contas_saldo_inicial_eventos
   where conta_bancaria_id = v_caixinha and motivo = 'prova' and saldo_depois = v_saldo + 1;
  if v_eventos <> 1 then raise exception 'FALHOU 2: evento nao gravado (%)', v_eventos; end if;

  -- 3. Pela RPC sem motivo: recusado.
  begin
    perform public.fn_alterar_saldo_inicial(v_caixinha, v_saldo + 2, v_data, '  ');
    v_msg := 'FALHOU 3: RPC sem motivo passou';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%motivo%' then raise exception 'FALHOU 3: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 4. Conta com mes conciliado fechado: recusado mesmo com motivo.
  begin
    perform public.fn_alterar_saldo_inicial(v_bb102, 1, date '2025-01-01', 'prova');
    v_msg := 'FALHOU 4: mudou conta com mes fechado';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%conciliado fechado%' then raise exception 'FALHOU 4: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 5. Subconta herda o fechamento da conta pai.
  begin
    perform public.fn_alterar_saldo_inicial(v_sub102, 1, date '2025-01-01', 'prova');
    v_msg := 'FALHOU 5: mudou subconta com conta pai fechada';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%conciliado fechado%' then raise exception 'FALHOU 5: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 6. A RPC sem mudanca nao pede motivo, nem em conta com mes fechado.
  perform public.fn_alterar_saldo_inicial(v_caixinha, v_saldo + 1, v_data, '');
  perform public.fn_alterar_saldo_inicial(v_bb102,
    (select saldo_inicial from public.contas_bancarias where id = v_bb102),
    (select saldo_inicial_data from public.contas_bancarias where id = v_bb102), '');

  -- 7. Trocar so o nome continua livre.
  update public.contas_bancarias set nome = nome where id = v_caixinha;

  raise exception 'PROVA OK';
end
$prova$;
