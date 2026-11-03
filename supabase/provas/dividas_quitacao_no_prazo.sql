-- Prova (contrato pago ate o fim do prazo vira quitado): simula, em
-- transacao desfeita, o pagamento de todas as parcelas em aberto do BB
-- 023.411.704 (LAN-2026-6866, 16 em aberto em 03/11/2026).
-- O gatilho e adiado para o fim da transacao; aqui ele e posto em immediate
-- para a prova enxergar o efeito sem commitar.
-- Rodar em begin/rollback depois das migrations; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set constraints public.trg_contrato_quitacao_pelo_pagamento immediate;

do $prova$
declare
  v_c uuid; v_l uuid; v_v int; v_n int; v_e record; v_ult uuid;
begin
  select id, lancamento_id into v_c, v_l from public.contratos_divida where numero = '023.411.704';
  if (select status from public.contratos_divida where id = v_c) <> 'ativo' then raise exception 'FALHOU 0: contrato nao esta ativo'; end if;
  v_v := public.fn_contrato_versao_atual(v_c);
  select count(*) into v_n from public.contrato_divida_cronograma where contrato_id = v_c and substituida_em is null;

  -- 1. Faltando uma parcela, nada muda.
  select id into v_ult from public.lancamento_parcelas where lancamento_id = v_l order by numero_parcela desc limit 1;
  update public.lancamento_parcelas set status = 'pago', data_pagamento = data_vencimento
   where lancamento_id = v_l and status <> 'pago' and id <> v_ult;
  if (select status from public.contratos_divida where id = v_c) <> 'ativo' then raise exception 'FALHOU 1: quitou com parcela em aberto'; end if;

  -- 2. Paga a ultima: quitado, sem versao nova nem linha nova, evento sem valor.
  update public.lancamento_parcelas set status = 'pago', data_pagamento = data_vencimento where id = v_ult;
  if (select status from public.contratos_divida where id = v_c) <> 'quitado' then raise exception 'FALHOU 2: nao quitou no prazo'; end if;
  if public.fn_contrato_versao_atual(v_c) <> v_v
     or (select count(*) from public.contrato_divida_cronograma where contrato_id = v_c and substituida_em is null) <> v_n then
    raise exception 'FALHOU 2b: mexeu no cronograma';
  end if;
  select tipo, automatico, valor, versao_anterior, versao_nova, data into v_e
    from public.contrato_divida_eventos where contrato_id = v_c order by versao_nova desc, created_at desc limit 1;
  if v_e.tipo <> 'quitacao' or not v_e.automatico or v_e.valor is not null or v_e.versao_anterior <> v_e.versao_nova
     or v_e.data <> (select data_vencimento from public.lancamento_parcelas where id = v_ult) then
    raise exception 'FALHOU 2c: evento %', v_e;
  end if;

  -- 3. Estorno da ultima: volta a ativo, cronograma intacto.
  update public.lancamento_parcelas set status = 'pendente', data_pagamento = null where id = v_ult;
  if (select status from public.contratos_divida where id = v_c) <> 'ativo' then raise exception 'FALHOU 3: estorno nao reabriu'; end if;
  if public.fn_contrato_versao_atual(v_c) <> v_v then raise exception 'FALHOU 3b: estorno gravou versao'; end if;
  if (select count(*) from public.contrato_divida_eventos where contrato_id = v_c and tipo = 'cronograma' and automatico) <> 1 then
    raise exception 'FALHOU 3c: evento do desfazer';
  end if;

  raise exception 'PROVA OK';
end;
$prova$;
