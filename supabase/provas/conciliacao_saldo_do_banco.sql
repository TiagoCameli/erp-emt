-- Prova de aceite, Bloco B (03/10/2026): saldo do app numa data e saldo no
-- painel da conciliacao. Roda em transacao e termina em ROLLBACK.
--
-- Conta de controle criada aqui: saldo inicial R$ 1.000,00 em 31/08/2026,
-- um pagamento de R$ 100,00 em 10/09, um recebimento de R$ 300,00 em 20/09,
-- uma transferencia de saida de R$ 50,00 com R$ 2,00 de tarifa em 15/09, e um
-- pagamento de R$ 999,00 em 30/08 (antes do corte, nao pode contar).
--   em 12/09: 1000 - 100 = 900,00
--   em 30/09: 1000 - 100 - 52 + 300 = 1.148,00
-- Controle: a usuaria so com Conciliacao (sem permissao de saldo) recebe null
-- da fn_conciliacao_saldo_app e o painel sem valores, mas com o "bate".

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_brenda uuid := 'a7324fb8-8311-4986-b975-8a8141ec7efc';
  v_bb uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_conta uuid;
  v_centro uuid;
  v_lanc uuid;
  v_saldo numeric;
  v_painel jsonb;
  v_import jsonb;
begin
  select c.id into v_centro from public.centros_custo c
  where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;

  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA SALDO', 'outro', 'corrente', '999.999-9', true, 1000, date '2026-08-31')
  returning id into v_conta;

  -- pagamento 100 em 10/09
  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_pagar', 'manual', 'prova pago', 100, 'pago', date '2026-09-10', date '2026-09-01', date '2026-09-10', v_centro) returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
  values (v_lanc, 1, 100, date '2026-09-10', 'pago', v_conta, date '2026-09-10');
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 100);

  -- recebimento 300 em 20/09
  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_receber', 'manual', 'prova recebido', 300, 'pago', date '2026-09-20', date '2026-09-01', date '2026-09-20', v_centro) returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
  values (v_lanc, 1, 300, date '2026-09-20', 'pago', v_conta, date '2026-09-20');
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 300);

  -- antes do corte: nao conta
  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_pagar', 'manual', 'prova antes do corte', 999, 'pago', date '2026-08-30', date '2026-08-01', date '2026-08-30', v_centro) returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
  values (v_lanc, 1, 999, date '2026-08-30', 'pago', v_conta, date '2026-08-30');
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 999);

  -- transferencia de saida 50 + 2 de tarifa em 15/09
  insert into public.transferencias_contas (numero, conta_origem_id, conta_destino_id, data_transferencia, valor, tarifa)
  values ('TRF-PROVA', v_conta, v_bb, date '2026-09-15', 50, 2);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  v_saldo := public.fn_conciliacao_saldo_app(v_conta, date '2026-09-12');
  if v_saldo <> 900 then raise exception 'FALHA 1: saldo em 12/09 = % (esperado 900)', v_saldo; end if;
  v_saldo := public.fn_conciliacao_saldo_app(v_conta, date '2026-09-30');
  if v_saldo <> 1148 then raise exception 'FALHA 1: saldo em 30/09 = % (esperado 1148)', v_saldo; end if;
  raise notice 'OK 1 saldo do app: 900 em 12/09, 1148 em 30/09';

  -- Antes do corte (31/08): para tras. Em 29/08 o pagamento de 999 de 30/08
  -- ainda nao tinha saido: 1000 + 999 = 1999. No proprio corte, 1000.
  v_saldo := public.fn_conciliacao_saldo_app(v_conta, date '2026-08-29');
  if v_saldo <> 1999 then raise exception 'FALHA 1b: saldo em 29/08 = % (esperado 1999)', v_saldo; end if;
  v_saldo := public.fn_conciliacao_saldo_app(v_conta, date '2026-08-31');
  if v_saldo <> 1000 then raise exception 'FALHA 1b: saldo no corte = % (esperado 1000)', v_saldo; end if;
  raise notice 'OK 1b antes do corte: 1999 em 29/08, 1000 no corte';

  -- importacao nova grava o saldo e o painel compara
  v_import := public.fn_conciliacao_importar(v_conta, 'PROVA.ofx', date '2026-09-01', date '2026-09-30',
    1148, date '2026-10-01',
    jsonb_build_array(jsonb_build_object('data', '2026-09-10', 'valor', -100, 'memo', 'PAGAMENTO', 'fitid', 'prova-1')));
  if (select saldo_final from public.extratos_ofx where id = (v_import->>'extrato_id')::uuid) <> 1148 then
    raise exception 'FALHA 2: saldo_final nao gravado';
  end if;
  v_painel := public.fn_conciliacao_painel(v_conta, date '2026-09-01', date '2026-09-30');
  if (v_painel->'saldo'->>'data') <> '2026-09-30'
     or (v_painel->'saldo'->>'banco')::numeric <> 1148
     or (v_painel->'saldo'->>'app')::numeric <> 1148
     or (v_painel->'saldo'->>'diferenca')::numeric <> 0
     or not (v_painel->'saldo'->>'bate')::boolean then
    raise exception 'FALHA 2: painel.saldo = %', v_painel->'saldo';
  end if;
  raise notice 'OK 2 painel: banco 1148 = app 1148 em 30/09 (DTASOF 01/10 limitado ao fim do periodo)';

  -- diferenca
  update public.extratos_ofx set saldo_final = 1100 where id = (v_import->>'extrato_id')::uuid;
  v_painel := public.fn_conciliacao_painel(v_conta, date '2026-09-01', date '2026-09-30');
  if (v_painel->'saldo'->>'diferenca')::numeric <> -48 or (v_painel->'saldo'->>'bate')::boolean then
    raise exception 'FALHA 3: diferenca = %', v_painel->'saldo';
  end if;
  raise notice 'OK 3 diferenca de -48 e nao bate';

  -- sem saldo no arquivo: bate = null, nunca declara fechado
  update public.extratos_ofx set saldo_final = null where id = (v_import->>'extrato_id')::uuid;
  v_painel := public.fn_conciliacao_painel(v_conta, date '2026-09-01', date '2026-09-30');
  if (v_painel->'saldo'->>'temSaldoNoArquivo')::boolean or (v_painel->'saldo'->'bate') <> 'null'::jsonb then
    raise exception 'FALHA 4: sem saldo = %', v_painel->'saldo';
  end if;
  raise notice 'OK 4 sem saldo no arquivo: bate null';
  update public.extratos_ofx set saldo_final = 1148 where id = (v_import->>'extrato_id')::uuid;

  -- quem nao ve saldo
  delete from public.usuario_permissoes where usuario_id = v_brenda and recurso <> 'financeiro.conciliacao';
  delete from public.usuario_conta_saldo where usuario_id = v_brenda;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_brenda, 'role', 'authenticated')::text, true);
  if public.fn_conciliacao_saldo_app(v_conta, date '2026-09-30') is not null then
    raise exception 'FALHA 5: sem permissao de saldo recebeu valor';
  end if;
  v_painel := public.fn_conciliacao_painel(v_conta, date '2026-09-01', date '2026-09-30');
  if (v_painel->'saldo'->'banco') <> 'null'::jsonb or (v_painel->'saldo'->'app') <> 'null'::jsonb
     or not (v_painel->'saldo'->>'bate')::boolean or (v_painel->'saldo'->>'podeVer')::boolean then
    raise exception 'FALHA 5: painel sem permissao = %', v_painel->'saldo';
  end if;
  raise notice 'OK 5 sem permissao de saldo: null nos valores, bate calculado no servidor';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
