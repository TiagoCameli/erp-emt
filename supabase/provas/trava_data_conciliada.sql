-- Prova da trava por data em mes conciliado (PR 1 do controle total, 09/10/2026).
--
-- Regra: conta (ou a conta pai, no caso de subconta) + data <= ultimo mes
-- conciliado fechado -> recusa. Vale para pagar, estornar, salvar e excluir
-- transferencia e gravar posicao de aplicacao.
--
-- Rodar dentro de begin/rollback (npx supabase db query --linked -f): termina
-- com raise 'PROVA OK', nada fica gravado. Usa as contas reais: BB 102.124-9 e
-- BB 30.893-5 tem setembro/2026 fechado.

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_bb102 uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_bb308 uuid := 'c766c8cf-54ec-4244-8a54-03b4b687c235';
  v_sub102 uuid := '5c8e0e86-bbdb-46a4-9809-1e1700fffac0';
  v_caixinha uuid := '68269366-f466-4e37-abdd-5de690f72eaa';
  v_parcela uuid := '65585f9b-b16b-4467-9103-8318a6e59ec3';
  v_trf uuid;
  v_conciliada uuid;
  v_msg text;

begin
  -- 1. Transferencia nova em setembro (mes fechado) e recusada.
  begin
    perform public.fn_salvar_transferencia(null, v_bb102, v_bb308, date '2026-09-15', 10, 0, 'prova', null, null);
    v_msg := 'FALHOU 1: transferencia em setembro passou';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%conciliada ate%' then raise exception 'FALHOU 1: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 2. Antes do ultimo mes fechado (agosto, sem fechamento proprio) tambem.
  begin
    perform public.fn_salvar_transferencia(null, v_bb102, v_bb308, date '2026-08-10', 10, 0, 'prova', null, null);
    v_msg := 'FALHOU 2: transferencia em agosto passou';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%conciliada ate%' then raise exception 'FALHOU 2: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 3. Outubro (aberto) passa.
  v_trf := public.fn_salvar_transferencia(null, v_bb102, v_bb308, date '2026-10-05', 10, 0, 'prova', null, null);

  -- 4. Editar a de outubro movendo para setembro e recusado.
  begin
    perform public.fn_salvar_transferencia(v_trf, v_bb102, v_bb308, date '2026-09-30', 10, 0, 'prova', null, null);
    v_msg := 'FALHOU 4: mover para setembro passou';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%conciliada ate%' then raise exception 'FALHOU 4: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 5. Pagar parcela com data de setembro numa conta fechada e recusado.
  begin
    perform public.fn_pagar_parcela(v_parcela, v_bb102, date '2026-09-20', 0, 0, 0, 'prova da trava');
    v_msg := 'FALHOU 5: pagamento em setembro passou';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%conciliada ate%' then raise exception 'FALHOU 5: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 6. Subconta herda o fechamento da conta pai.
  begin
    perform public.fn_conciliacao_exigir_data_aberta(v_sub102, date '2026-09-10');
    v_msg := 'FALHOU 6: subconta nao herdou a trava';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%conciliada ate%' then raise exception 'FALHOU 6: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 7. Conta sem fechamento nao trava.
  perform public.fn_conciliacao_exigir_data_aberta(v_caixinha, date '2025-03-10');

  -- 8. Excluir transferencia conciliada da mensagem clara (nao o erro da FK).
  select t.transferencia_id into v_conciliada from public.extrato_transacoes t
   join public.transferencias_contas tr on tr.id = t.transferencia_id
   where tr.data_transferencia >= date '2026-10-01' limit 1;
  if v_conciliada is not null then
    begin
      perform public.fn_excluir_transferencia(v_conciliada, 'prova');
      v_msg := 'FALHOU 8: excluiu transferencia conciliada';
    exception when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg not like '%esta conciliada%' then raise exception 'FALHOU 8: %', v_msg; end if;
    end;
    if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;
  end if;

  raise exception 'PROVA OK';
end
$prova$;
