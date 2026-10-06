-- Prova (06/10/2026): fatura do cartao na conciliacao. Roda depois da
-- migration 20261006090000 e termina em ROLLBACK.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_conta uuid; v_outra uuid; v_centro uuid; v_cat uuid; v_forma uuid; v_cartao uuid;
  v_l1 uuid; v_l2 uuid; v_f1 uuid; v_f2 uuid; v_p1 uuid; v_p2 uuid; v_t uuid; v_fat uuid; v_lista jsonb; v_painel jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA FATURA', 'outro', 'corrente', '333.333-3', true, 1000, date '2026-09-30') returning id into v_conta;
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA OUTRA', 'outro', 'corrente', '333.334-4', true, 1000, date '2026-09-30') returning id into v_outra;
  select c.id into v_centro from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;
  select c.id into v_cat from public.categorias_financeiras c where c.ativo and c.tipo = 'despesa' order by c.nome limit 1;
  select id into v_forma from public.formas_pagamento where tipo = 'cartao_credito' and ativo limit 1;
  insert into public.cartoes_credito (nome, ultimos_digitos, ativo) values ('PROVA CARTAO', '9999', true) returning id into v_cartao;

  -- compra 1: 100, aprovada (ainda nao paga); compra 2: 50, paga em outra conta
  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id, forma_pagamento_id)
  values ('a_pagar', 'manual', 'prova compra 1', 100, 'aprovado', date '2026-10-01', date '2026-10-01', date '2026-10-28', v_centro, v_forma) returning id into v_l1;
  insert into public.lancamento_formas (lancamento_id, forma_pagamento_id, cartao_id, valor) values (v_l1, v_forma, v_cartao, 100) returning id into v_f1;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, lancamento_forma_id, data_programada, data_programada_origem)
  values (v_l1, 1, 100, date '2026-10-28', 'aprovado', v_conta, v_f1, date '2026-10-28', 'vencimento') returning id into v_p1;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_l1, v_centro, 100);
  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id, forma_pagamento_id)
  values ('a_pagar', 'manual', 'prova compra 2', 50, 'pago', date '2026-10-02', date '2026-10-01', date '2026-10-28', v_centro, v_forma) returning id into v_l2;
  insert into public.lancamento_formas (lancamento_id, forma_pagamento_id, cartao_id, valor) values (v_l2, v_forma, v_cartao, 50) returning id into v_f2;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, lancamento_forma_id, data_pagamento)
  values (v_l2, 1, 50, date '2026-10-28', 'pago', v_outra, v_f2, date '2026-10-27') returning id into v_p2;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_l2, v_centro, 50);

  perform public.fn_conciliacao_importar(v_conta, 'F.ofx', date '2026-10-01', date '2026-10-31', null, null,
    jsonb_build_array(jsonb_build_object('data', '2026-10-28', 'valor', -160, 'memo', 'CARTAO CX', 'fitid', 'f-1')));
  select id into v_t from public.extrato_transacoes where conta_bancaria_id = v_conta and fitid = 'f-1';

  -- 1. lista as duas compras
  v_lista := public.fn_conciliacao_compras_do_cartao(v_t, v_cartao);
  if jsonb_array_length(v_lista) <> 2 then raise exception 'FALHA 1: lista = %', v_lista; end if;
  raise notice 'OK 1 compras do cartao';

  -- 2. soma que nao fecha recusa
  begin
    perform public.fn_conciliacao_casar_fatura(v_t, v_cartao, array[v_p1, v_p2], null);
    raise exception 'FALHA 2: casou sem fechar';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  raise notice 'OK 2 recusa quando nao fecha';

  -- 3. 100 + 50 + 10 de encargos = 160
  v_fat := public.fn_conciliacao_casar_fatura(v_t, v_cartao, array[v_p1, v_p2],
    jsonb_build_object('valor', 10, 'categoriaId', v_cat, 'centroCustoId', v_centro));
  if exists (select 1 from public.lancamento_parcelas where id in (v_p1, v_p2)
             and (status <> 'pago' or conta_bancaria_id <> v_conta or data_pagamento <> date '2026-10-28')) then
    raise exception 'FALHA 3: compras nao ficaram pagas na conta e data do debito';
  end if;
  if not exists (select 1 from public.extrato_transacoes where id = v_t and conciliada and cartao_fatura_id = v_fat) then
    raise exception 'FALHA 3: movimento nao casou';
  end if;
  if (select l.valor from public.cartao_faturas f join public.lancamentos l on l.id = f.encargos_lancamento_id where f.id = v_fat) <> 10 then
    raise exception 'FALHA 3: encargos';
  end if;
  v_painel := public.fn_conciliacao_painel(v_conta, date '2026-10-01', date '2026-10-31');
  if jsonb_array_length(v_painel->'pagasNaConta') <> 0 then raise exception 'FALHA 3: compras ainda fora do banco: %', v_painel->'pagasNaConta'; end if;
  if (select (t->'fatura'->>'qtdCompras')::int from jsonb_array_elements(v_painel->'transacoes') t where t->>'id' = v_t::text) <> 3 then
    raise exception 'FALHA 3: painel sem a fatura';
  end if;
  raise notice 'OK 3 fatura casada: compras pagas na conta do debito, encargos lancados, painel limpo';

  -- 4. desfazer devolve tudo
  perform public.fn_desconciliar_transacao(v_t);
  if (select status from public.lancamento_parcelas where id = v_p1) <> 'aprovado'
     or (select conta_bancaria_id from public.lancamento_parcelas where id = v_p2) <> v_outra
     or (select data_pagamento from public.lancamento_parcelas where id = v_p2) <> date '2026-10-27'
     or exists (select 1 from public.cartao_faturas where id = v_fat)
     or exists (select 1 from public.lancamentos where descricao like 'Encargos do cartao PROVA CARTAO%') then
    raise exception 'FALHA 4: desfazer nao devolveu';
  end if;
  raise notice 'OK 4 desfazer devolve as compras como estavam e apaga os encargos';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
