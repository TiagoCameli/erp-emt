-- Prova (quitacao automatica pelo lancamento ligado), no caso real do BB
-- 023.409.504 / LAN-2026-6867, que a migration quita ao ser aplicada.
-- O gatilho e adiado para o fim da transacao; aqui ele e posto em immediate
-- para a prova enxergar o efeito sem commitar.
-- Rodar em begin/rollback depois das migrations; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);
set constraints public.trg_contrato_quitacao_pelo_pagamento immediate;

do $prova$
declare
  v_c uuid; v_l uuid; v_p uuid; v_q record; v_e record; v_s numeric;
begin
  select id, lancamento_id into v_c, v_l from public.contratos_divida where numero = '023.409.504';
  select id into v_p from public.lancamento_parcelas where lancamento_id = v_l and numero_parcela = 42;

  -- 1. A migration quitou: principal = saldo em 22/10, juros = o que passou dele.
  if (select status from public.contratos_divida where id = v_c) <> 'quitado' then raise exception 'FALHOU 1: nao quitou'; end if;
  select principal, juros, vencimento into v_q from public.contrato_divida_cronograma
   where contrato_id = v_c and substituida_em is null and tipo = 'quitacao';
  if v_q.principal <> 318628.66 or v_q.juros <> 12177.12 or v_q.vencimento <> date '2026-10-22' then
    raise exception 'FALHOU 1b: quitacao % % em %', v_q.principal, v_q.juros, v_q.vencimento;
  end if;
  select tipo, automatico, valor into v_e from public.contrato_divida_eventos where contrato_id = v_c order by versao_nova desc limit 1;
  if v_e.tipo <> 'quitacao' or not v_e.automatico or v_e.valor <> 330805.78 then raise exception 'FALHOU 1c: evento %', v_e; end if;
  if (select saldo_devedor from public.fn_rel_dividas_contratos(date '2026-11-03') where contrato_id = v_c) <> 0 then
    raise exception 'FALHOU 1d: saldo na lista';
  end if;

  -- 2. As funcoes internas ficam fechadas para quem chama a API.
  if has_function_privilege('authenticated', 'public.fn_contrato_registrar_evento(uuid,text,date,numeric,text,jsonb,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.fn_contrato_sincronizar_lancamento(uuid)', 'execute') then
    raise exception 'FALHOU 2: funcao interna aberta';
  end if;

  -- 3. Estorno da parcela, por quem nao tem financeiro.dividas: volta ao
  --    cronograma de antes e a ativo, com o mesmo saldo de antes.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  update public.lancamento_parcelas set status = 'aprovado' where id = v_p;
  if (select status from public.contratos_divida where id = v_c) <> 'ativo' then raise exception 'FALHOU 3: estorno nao reabriu'; end if;
  select saldo_devedor into v_s from public.fn_rel_dividas_contratos(date '2026-11-03') where contrato_id = v_c;
  if v_s <> 318628.66 then raise exception 'FALHOU 3b: saldo depois do estorno %', v_s; end if;
  if exists (select 1 from public.contrato_divida_cronograma where contrato_id = v_c and substituida_em is null and tipo = 'quitacao')
     or (select count(*) from public.contrato_divida_cronograma where contrato_id = v_c and substituida_em is null) <> 49 then
    raise exception 'FALHOU 3c: cronograma nao voltou';
  end if;
  select tipo, automatico into v_e from public.contrato_divida_eventos where contrato_id = v_c order by versao_nova desc limit 1;
  if v_e.tipo <> 'cronograma' or not v_e.automatico then raise exception 'FALHOU 3d: evento do desfazer %', v_e; end if;

  -- 4. Pago abaixo do saldo nao e quitacao: fica ativo.
  update public.lancamento_parcelas set valor = 100000.00 where id = v_p;
  update public.lancamento_parcelas set status = 'pago' where id = v_p;
  if (select status from public.contratos_divida where id = v_c) <> 'ativo' then raise exception 'FALHOU 4: quitou abaixo do saldo'; end if;

  -- 5. Pago de novo com o valor certo, sem permissao de dividas: quita.
  update public.lancamento_parcelas set status = 'aprovado' where id = v_p;
  update public.lancamento_parcelas set valor = 330805.78 where id = v_p;
  update public.lancamento_parcelas set status = 'pago' where id = v_p;
  if (select status from public.contratos_divida where id = v_c) <> 'quitado' then raise exception 'FALHOU 5: nao quitou de novo'; end if;

  -- 6. Quitacao feita pela tela nao e desfeita pelo estorno.
  update public.lancamento_parcelas set status = 'aprovado' where id = v_p;
  perform set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);
  perform public.fn_registrar_evento_contrato(v_c, 'quitacao', date '2026-10-22', 330805.78, 'quitacao pela tela');
  update public.lancamento_parcelas set status = 'pago' where id = v_p;
  update public.lancamento_parcelas set status = 'aprovado' where id = v_p;
  if (select status from public.contratos_divida where id = v_c) <> 'quitado' then raise exception 'FALHOU 6: desfez quitacao manual'; end if;

  raise exception 'PROVA OK';
end;
$prova$;
