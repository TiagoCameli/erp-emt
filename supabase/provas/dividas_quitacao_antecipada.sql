-- Prova (quitacao antecipada paga pelo lancamento): o caso do BB 023.409.504,
-- quitado em 22/10/2026 pela parcela 42 do LAN-2026-6867 (vencia 05/11).
-- Usa o contrato real enquanto ele ainda estiver ativo; depois que a
-- quitacao for registrada pela tela, esta prova para no "ja quitado".
-- Rodar em begin/rollback depois das migrations; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_c uuid; v_msg text; v_q record; v_r record;
begin
  select id into v_c from public.contratos_divida where numero = '023.409.504';
  if v_c is null then raise exception 'FALHOU 0: contrato nao encontrado'; end if;

  -- 1. Amortizacao em 22/10 continua recusando: renumeraria o resto e a
  --    parcela 42 paga cairia numa linha nova.
  v_msg := 'FALHOU 1: amortizou por cima de parcela paga';
  begin perform public.fn_registrar_evento_contrato(v_c, 'amortizacao', date '2026-10-22', 1000, 'x');
  exception when others then if sqlerrm ilike '%parcela paga%' then v_msg := null; else v_msg := 'FALHOU 1: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 2. Quitacao antes do dia em que a parcela foi paga continua recusando.
  v_msg := 'FALHOU 2: quitou antes do pagamento';
  begin perform public.fn_registrar_evento_contrato(v_c, 'quitacao', date '2026-10-21', 330805.78, 'x');
  exception when others then if sqlerrm ilike '%parcela paga%' then v_msg := null; else v_msg := 'FALHOU 2: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 3. Quitacao no dia do pagamento passa: principal = saldo em 22/10, o que
  --    passa dele e juros, e o contrato fica quitado sem saldo.
  perform public.fn_registrar_evento_contrato(v_c, 'quitacao', date '2026-10-22', 330805.78, 'Quitacao BB em 22/10/2026');
  select principal, juros into v_q from public.contrato_divida_cronograma
   where contrato_id = v_c and substituida_em is null and tipo = 'quitacao';
  if v_q.principal <> 318628.66 or v_q.juros <> 12177.12 then
    raise exception 'FALHOU 3: quitacao principal % juros %', v_q.principal, v_q.juros;
  end if;
  if (select status from public.contratos_divida where id = v_c) <> 'quitado' then raise exception 'FALHOU 3b: nao quitou'; end if;
  select saldo_devedor, juros_a_pagar, jsonb_array_length(restantes) as n into v_r
    from public.fn_rel_dividas_contratos(date '2026-11-03') where contrato_id = v_c;
  if v_r.saldo_devedor <> 0 or v_r.juros_a_pagar <> 0 or v_r.n <> 0 then
    raise exception 'FALHOU 3c: saldo % juros % restantes %', v_r.saldo_devedor, v_r.juros_a_pagar, v_r.n;
  end if;
  if exists (select 1 from public.contrato_divida_cronograma
              where contrato_id = v_c and substituida_em is null and vencimento > date '2026-10-22') then
    raise exception 'FALHOU 3d: sobrou linha depois da quitacao';
  end if;

  raise exception 'PROVA OK';
end;
$prova$;
