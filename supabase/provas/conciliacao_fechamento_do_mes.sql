-- Prova de aceite, Bloco F (03/10/2026): fechamento do mes gravado.
-- Roda em transacao e ROLLBACK, numa conta de controle criada aqui
-- (saldo inicial 0 em 31/08; um pagamento de R$ 100,00 em 10/09; extrato de
-- setembro com o mesmo movimento e saldo final -100,00).
--
--   1. fecha o mes (tudo casado e saldo batendo); fechar de novo recusa
--   2. desconciliar e estornar o pagamento conciliado: recusados (mes fechado)
--   3. reabrir sem motivo recusa; com motivo reabre; desconciliar passa
--   4. fechar com movimento pendente recusa
--   5. com o mes fechado de novo, importar um movimento novo de setembro
--      reabre o mes sozinho com "novo movimento importado"

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_conta uuid;
  v_centro uuid;
  v_lanc uuid;
  v_parc uuid;
  v_t uuid;
  v_r jsonb;
  v_erro text;
begin
  select c.id into v_centro from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;

  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA FECHAMENTO', 'outro', 'corrente', '777.777-7', true, 0, date '2026-08-31')
  returning id into v_conta;

  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_pagar', 'manual', 'prova F', 100, 'pago', date '2026-09-10', date '2026-09-01', date '2026-09-10', v_centro) returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
  values (v_lanc, 1, 100, date '2026-09-10', 'pago', v_conta, date '2026-09-10') returning id into v_parc;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 100);

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  perform public.fn_conciliacao_importar(v_conta, 'PROVA-F.ofx', date '2026-09-01', date '2026-09-30', -100, date '2026-09-30',
    jsonb_build_array(jsonb_build_object('data', '2026-09-10', 'valor', -100, 'memo', 'PAGAMENTO', 'fitid', 'prova-f-1')));
  select id into v_t from public.extrato_transacoes where conta_bancaria_id = v_conta;
  perform public.fn_conciliacao_casar(v_t, 'parcela', v_parc, false, null::text);

  -- 1
  perform public.fn_conciliacao_fechar_mes(v_conta, date '2026-09-15');
  if not exists (select 1 from public.conciliacao_fechamentos where conta_bancaria_id = v_conta and mes = '2026-09-01'
                 and reaberto_em is null and saldo_banco = -100 and saldo_app = -100 and fechado_por = v_tiago) then
    raise exception 'FALHA 1: fechamento nao gravado';
  end if;
  begin
    perform public.fn_conciliacao_fechar_mes(v_conta, date '2026-09-01');
    raise exception 'FALHA 1: fechou duas vezes';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  raise notice 'OK 1 fechou com saldos -100/-100; segundo fechamento recusado';

  -- 2
  begin
    perform public.fn_desconciliar_transacao(v_t);
    raise exception 'FALHA 2: desconciliou em mes fechado';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    v_erro := sqlerrm;
    if v_erro not like 'Mes de setembro/2026 da conta PROVA FECHAMENTO esta conciliado e fechado. Reabra primeiro.' then
      raise exception 'FALHA 2: mensagem %', v_erro;
    end if;
  end;
  begin
    perform public.fn_estornar_pagamento(v_parc);
    raise exception 'FALHA 2: estornou em mes fechado';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    if sqlerrm not like 'Mes de setembro/2026%' then raise exception 'FALHA 2: estorno com mensagem %', sqlerrm; end if;
  end;
  raise notice 'OK 2 desconciliar e estornar recusados: %', v_erro;

  -- 3
  begin
    perform public.fn_conciliacao_reabrir_mes(v_conta, date '2026-09-01', '  ');
    raise exception 'FALHA 3: reabriu sem motivo';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  perform public.fn_conciliacao_reabrir_mes(v_conta, date '2026-09-01', 'prova: conferir de novo');
  perform public.fn_desconciliar_transacao(v_t);
  raise notice 'OK 3 reabertura exige motivo; reaberto, desconciliar passa';

  -- 4
  begin
    perform public.fn_conciliacao_fechar_mes(v_conta, date '2026-09-01');
    raise exception 'FALHA 4: fechou com movimento pendente';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  raise notice 'OK 4 fechar com pendente recusado';

  -- 5
  perform public.fn_conciliacao_casar(v_t, 'parcela', v_parc, false, null::text);
  perform public.fn_conciliacao_fechar_mes(v_conta, date '2026-09-01');
  v_r := public.fn_conciliacao_importar(v_conta, 'PROVA-F2.ofx', date '2026-09-01', date '2026-09-30', -105, date '2026-09-30',
    jsonb_build_array(jsonb_build_object('data', '2026-09-20', 'valor', -5, 'memo', 'TARIFA', 'fitid', 'prova-f-2')));
  if (v_r->>'meses_reabertos')::int <> 1
     or not exists (select 1 from public.conciliacao_fechamentos where conta_bancaria_id = v_conta
                    and motivo_reabertura = 'novo movimento importado')
     or exists (select 1 from public.conciliacao_fechamentos where conta_bancaria_id = v_conta and reaberto_em is null) then
    raise exception 'FALHA 5: importacao nao reabriu: %', v_r;
  end if;
  raise notice 'OK 5 movimento novo importado reabriu setembro';
end;
$prova$;

set constraints all immediate;

select 'PROVA OK' as resultado;

rollback;
