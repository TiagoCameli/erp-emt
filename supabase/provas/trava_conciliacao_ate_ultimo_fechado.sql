-- Prova (revisao do PR 1): as operacoes da propria conciliacao e excluir
-- posicao de aplicacao tambem respeitam "ate o ultimo mes fechado", e a trava
-- nao e executavel por anon. Rodar em begin/rollback depois das migrations do
-- PR 1; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_bb102 uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_caixa uuid := '3e8dd187-0684-40f0-8757-55608b9204ec';
  v_posicao uuid := '6ddd43b5-05b5-42b8-aea0-110884b0cdbd';  -- Caixa, 09/10/2026
  v_msg text;
begin
  -- 1. Trava das operacoes da conciliacao: agosto (aberto) com setembro fechado.
  begin
    perform public.fn_conciliacao_exigir_mes_aberto(v_bb102, date '2026-08-10');
    v_msg := 'FALHOU 1: agosto passou com setembro fechado';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%conciliada ate%' then raise exception 'FALHOU 1: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 2. Outubro continua aberto.
  perform public.fn_conciliacao_exigir_mes_aberto(v_bb102, date '2026-10-05');

  -- 3. Excluir posicao de aplicacao com a conta pai fechada no mes da posicao.
  insert into public.conciliacao_fechamentos (conta_bancaria_id, mes, saldo_banco, saldo_app, fechado_por)
  values (v_caixa, date '2026-10-01', 0, 0, 'c66fca9f-5428-4fb9-855f-dcff548764df');
  begin
    perform public.fn_excluir_posicao_aplicacao(v_posicao, 'prova');
    v_msg := 'FALHOU 3: excluiu posicao em mes fechado';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%conciliada ate%' then raise exception 'FALHOU 3: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 4. Anon nao executa a trava (ela devolve nome da conta e mes no erro).
  if has_function_privilege('anon', 'public.fn_conciliacao_exigir_data_aberta(uuid, date)', 'execute') then
    raise exception 'FALHOU 4: anon executa fn_conciliacao_exigir_data_aberta';
  end if;

  raise exception 'PROVA OK';
end
$prova$;
