-- Prova (PR 4 do controle total): fechar o mes da conta exige a posicao do
-- ultimo dia de cada aplicacao ativa das subcontas (Caixa, setembro/2026).
-- Rodar em begin/rollback depois da migration; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_conta uuid := '3e8dd187-0684-40f0-8757-55608b9204ec'; -- Caixa corrente
  v_mes date := date '2026-09-01';
  v_msg text;
begin
  -- 1. Sem posicao em 30/09 (so a abertura de 25/09): recusa citando a posicao.
  v_msg := 'FALHOU 1: fechou sem a posicao do fim do mes';
  begin
    perform public.fn_conciliacao_fechar_mes(v_conta, v_mes);
  exception when others then
    if sqlerrm ilike '%posicao%30/09/2026%' then v_msg := null; else v_msg := 'FALHOU 1: ' || sqlerrm; end if;
  end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 2. Com a posicao de 30/09 nas duas, a checagem passa (pode parar em outra).
  insert into public.aplicacao_posicoes (aplicacao_id, data, saldo_liquido)
  select a.id, date '2026-09-30', 1 from public.aplicacoes a
   where a.conta_bancaria_id = '37ca9c33-859d-42d7-8c14-78a6119d0258';
  v_msg := null;
  begin
    perform public.fn_conciliacao_fechar_mes(v_conta, v_mes);
  exception when others then
    if sqlerrm ilike '%posicao%' then v_msg := 'FALHOU 2: ' || sqlerrm; end if;
  end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 3. Aplicacao inativa nao bloqueia.
  update public.aplicacao_posicoes set excluido_em = now(), motivo_exclusao = 'prova' where data = date '2026-09-30';
  update public.aplicacoes set ativa = false where conta_bancaria_id = '37ca9c33-859d-42d7-8c14-78a6119d0258';
  v_msg := null;
  begin
    perform public.fn_conciliacao_fechar_mes(v_conta, v_mes);
  exception when others then
    if sqlerrm ilike '%posicao%' then v_msg := 'FALHOU 3: ' || sqlerrm; end if;
  end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 4. Mes anterior a qualquer posicao gravada (agosto) nao exige posicao.
  update public.aplicacoes set ativa = true where conta_bancaria_id = '37ca9c33-859d-42d7-8c14-78a6119d0258';
  v_msg := null;
  begin
    perform public.fn_conciliacao_fechar_mes(v_conta, date '2026-08-01');
  exception when others then
    if sqlerrm ilike '%posicao%' then v_msg := 'FALHOU 4: ' || sqlerrm; end if;
  end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  raise exception 'PROVA OK';
end
$prova$;
