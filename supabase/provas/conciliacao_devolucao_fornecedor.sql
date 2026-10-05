-- Prova de aceite, Bloco L (05/10/2026): devolucao do fornecedor.
-- Roda depois da migration 20261005200000 e termina em ROLLBACK.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_conta uuid; v_centro uuid; v_forn uuid; v_lanc uuid; v_p1000 uuid; v_p800 uuid;
  v_d1000 uuid; v_d800 uuid; v_c1000 uuid; v_c300 uuid; v_c50 uuid; v_r jsonb; v_lista jsonb;
  v_novo public.lancamentos;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA L', 'outro', 'corrente', '444.444-4', true, 5000, date '2026-09-30') returning id into v_conta;
  select c.id into v_centro from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;
  insert into public.fornecedores (razao_social, nome_fantasia) values ('PROVA JOSIAS O DA SILVA', 'PROVA JOSIAS') returning id into v_forn;

  insert into public.lancamentos (tipo, origem, fornecedor_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_pagar', 'manual', v_forn, 'prova 1000', 1000, 'pago', date '2026-10-05', date '2026-10-01', date '2026-10-05', v_centro) returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
  values (v_lanc, 1, 1000, date '2026-10-05', 'pago', v_conta, date '2026-10-05') returning id into v_p1000;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 1000);
  insert into public.lancamentos (tipo, origem, fornecedor_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_pagar', 'manual', v_forn, 'prova 800', 800, 'pago', date '2026-10-06', date '2026-10-01', date '2026-10-06', v_centro) returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
  values (v_lanc, 1, 800, date '2026-10-06', 'pago', v_conta, date '2026-10-06') returning id into v_p800;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 800);

  perform public.fn_conciliacao_importar(v_conta, 'L.ofx', date '2026-10-01', date '2026-10-31', null, null, jsonb_build_array(
    jsonb_build_object('data', '2026-10-05', 'valor', -1000, 'memo', 'PIX - ENVIADO - 05/10 10:00 JOSIAS O DA SILVA', 'fitid', 'l-1'),
    jsonb_build_object('data', '2026-10-06', 'valor', -800, 'memo', 'PIX - ENVIADO - 06/10 10:00 JOSIAS O DA SILVA', 'fitid', 'l-2'),
    jsonb_build_object('data', '2026-10-08', 'valor', 1000, 'memo', 'PIX - RECEBIDO - 08/10 17:14 12345678000199 JOSIAS O DA', 'fitid', 'l-3'),
    jsonb_build_object('data', '2026-10-09', 'valor', 300, 'memo', 'PIX - RECEBIDO - 09/10 17:14 12345678000199 JOSIAS O DA', 'fitid', 'l-4'),
    jsonb_build_object('data', '2026-10-10', 'valor', 50, 'memo', 'PIX - RECEBIDO - 10/10 17:14 12345678000199 JOSIAS O DA', 'fitid', 'l-5')));
  select id into v_d1000 from public.extrato_transacoes where conta_bancaria_id = v_conta and fitid = 'l-1';
  select id into v_d800 from public.extrato_transacoes where conta_bancaria_id = v_conta and fitid = 'l-2';
  select id into v_c1000 from public.extrato_transacoes where conta_bancaria_id = v_conta and fitid = 'l-3';
  select id into v_c300 from public.extrato_transacoes where conta_bancaria_id = v_conta and fitid = 'l-4';
  select id into v_c50 from public.extrato_transacoes where conta_bancaria_id = v_conta and fitid = 'l-5';
  perform public.fn_conciliacao_casar(v_d1000, 'parcela', v_p1000, false, null::text);
  perform public.fn_conciliacao_casar(v_d800, 'parcela', v_p800, false, null::text);

  -- 1. lista: para o credito de 1000, so o debito de 1000 (800 e menor)
  v_lista := public.fn_conciliacao_debitos_para_devolucao(v_c1000);
  if jsonb_array_length(v_lista) <> 1 or v_lista->0->>'id' <> v_d1000::text then
    raise exception 'FALHA 1: lista = %', v_lista;
  end if;
  raise notice 'OK 1 lista os debitos casados de mesmo valor ou maior';

  -- 2. total: estorna a parcela e casa debito e credito como estorno
  v_r := public.fn_conciliacao_devolucao_fornecedor(v_c1000, v_d1000, 'PIX devolvido pelo fornecedor');
  if v_r->>'modo' <> 'total' then raise exception 'FALHA 2: modo = %', v_r; end if;
  if (select status from public.lancamento_parcelas where id = v_p1000) <> 'aprovado'
     or (select conta_bancaria_id from public.lancamento_parcelas where id = v_p1000) is not null then
    raise exception 'FALHA 2: parcela nao voltou a aberta';
  end if;
  if not exists (select 1 from public.parcela_eventos where parcela_id = v_p1000 and tipo = 'estornou' and motivo like '%PIX devolvido%') then
    raise exception 'FALHA 2: sem evento estornou';
  end if;
  if not exists (select 1 from public.extrato_transacoes where id = v_c1000 and conciliada and estorno_par_id = v_d1000)
     or not exists (select 1 from public.extrato_transacoes where id = v_d1000 and conciliada and estorno_par_id = v_c1000 and parcela_id is null) then
    raise exception 'FALHA 2: par de estorno';
  end if;
  raise notice 'OK 2 devolucao total: parcela aberta de novo e envio + devolucao como estorno';

  -- 3. parcial: a parcela fica; a receber do fornecedor reduzindo o custo
  v_r := public.fn_conciliacao_devolucao_fornecedor(v_c300, v_d800, 'devolveu parte da mercadoria');
  if v_r->>'modo' <> 'parcial' then raise exception 'FALHA 3: modo = %', v_r; end if;
  select * into v_novo from public.lancamentos where id = (v_r->>'lancamentoId')::uuid;
  if v_novo.tipo <> 'a_receber' or v_novo.valor <> 300 or v_novo.fornecedor_id <> v_forn or v_novo.centro_custo_id <> v_centro
     or v_novo.status <> 'pago'
     or (select nome from public.categorias_financeiras where id = v_novo.categoria_id) <> 'Devolução de fornecedor' then
    raise exception 'FALHA 3: lancamento = %', to_jsonb(v_novo);
  end if;
  if (select status from public.lancamento_parcelas where id = v_p800) <> 'pago' then raise exception 'FALHA 3: mexeu na parcela'; end if;
  if not exists (select 1 from public.extrato_transacoes t join public.lancamento_parcelas p on p.id = t.parcela_id
                 where t.id = v_c300 and t.conciliada and p.lancamento_id = v_novo.id) then
    raise exception 'FALHA 3: credito nao casou';
  end if;
  raise notice 'OK 3 devolucao parcial: a receber de devolucao no CC original, casado';

  -- 4. mes fechado recusa
  insert into public.conciliacao_fechamentos (conta_bancaria_id, mes, saldo_banco, saldo_app, fechado_por)
  values (v_conta, date '2026-10-01', 0, 0, v_tiago);
  begin
    perform public.fn_conciliacao_devolucao_fornecedor(v_c50, v_d800, 'outra parte');
    raise exception 'FALHA 4: aceitou mes fechado';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  raise notice 'OK 4 mes fechado recusa';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
