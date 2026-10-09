-- Prova de aceite (09/10/2026): excluir ancora de saldo.
-- Roda depois da migration 20261009182401 e termina em ROLLBACK.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_c uuid; v_a1 uuid; v_a2 uuid; v_a3 uuid; v_ok boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA ANCORA', 'outro', 'corrente', '555.559-9', true, 0, date '2026-09-30') returning id into v_c;
  v_a1 := public.fn_conciliacao_registrar_ancora(v_c, date '2026-10-10', 1000, 'extrato_pdf', 'pdf');
  v_a2 := public.fn_conciliacao_registrar_ancora(v_c, date '2026-08-31', 500, 'informado', null);
  v_a3 := public.fn_conciliacao_registrar_ancora(v_c, date '2026-07-15', 200, 'informado', null);

  -- 1. mes aberto: apaga, e o saldo do banco perde a ancora
  perform public.fn_conciliacao_excluir_ancora(v_a1);
  if exists (select 1 from public.conciliacao_saldos_ancora where id = v_a1) then
    raise exception 'FALHA 1: ancora continua';
  end if;
  raise notice 'OK 1 apaga ancora de mes aberto';

  -- 2. ancora do ultimo dia abre o mes seguinte: setembro fechado recusa 31/08
  insert into public.conciliacao_fechamentos (conta_bancaria_id, mes, saldo_banco, saldo_app, fechado_por)
  values (v_c, date '2026-09-01', 0, 0, v_tiago);
  v_ok := false;
  begin
    perform public.fn_conciliacao_excluir_ancora(v_a2);
  exception when others then
    v_ok := sqlerrm like '%fechado%';
  end;
  if not v_ok or not exists (select 1 from public.conciliacao_saldos_ancora where id = v_a2) then
    raise exception 'FALHA 2: apagou ancora que abre mes fechado';
  end if;
  raise notice 'OK 2 recusa ancora de 31/08 com setembro fechado';

  -- 3. mes da propria ancora fechado recusa
  insert into public.conciliacao_fechamentos (conta_bancaria_id, mes, saldo_banco, saldo_app, fechado_por)
  values (v_c, date '2026-07-01', 0, 0, v_tiago);
  v_ok := false;
  begin
    perform public.fn_conciliacao_excluir_ancora(v_a3);
  exception when others then
    v_ok := sqlerrm like '%fechado%';
  end;
  if not v_ok then raise exception 'FALHA 3: apagou ancora de mes fechado'; end if;
  raise notice 'OK 3 recusa ancora dentro de mes fechado';

  -- 4. reaberto, apaga
  update public.conciliacao_fechamentos set reaberto_em = now(), reaberto_por = v_tiago, motivo_reabertura = 'prova'
   where conta_bancaria_id = v_c and mes = date '2026-09-01';
  perform public.fn_conciliacao_excluir_ancora(v_a2);
  raise notice 'OK 4 reaberto, apaga';

  -- 5. id que nao existe
  v_ok := false;
  begin
    perform public.fn_conciliacao_excluir_ancora(gen_random_uuid());
  exception when others then
    v_ok := sqlerrm like '%nao encontrada%';
  end;
  if not v_ok then raise exception 'FALHA 5: id inexistente'; end if;
  raise notice 'OK 5 id inexistente recusa';

  -- 6. sem login nao passa
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    perform public.fn_conciliacao_excluir_ancora(v_a3);
  exception when others then
    v_ok := sqlerrm like '%Sem permissao%';
  end;
  if not v_ok then raise exception 'FALHA 6: usuario sem permissao apagou'; end if;
  raise notice 'OK 6 sem permissao recusa';
end;
$prova$;

rollback;
