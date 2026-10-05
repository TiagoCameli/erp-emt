-- Prova de aceite, Bloco I (05/10/2026): apelido bancario do fornecedor.
-- Roda depois da migration 20261005160000 e termina em ROLLBACK.
-- Os historicos e os cedentes esperados sao os mesmos do casamento.test.ts.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_conta uuid; v_centro uuid; v_forn uuid; v_lanc uuid; v_parc1 uuid; v_parc2 uuid; v_parc3 uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_res jsonb; v_n int; v_caso record;
begin
  -- 1. cedente: os mesmos casos do Vitest
  for v_caso in select * from (values
    ('PIX - ENVIADO - 01/09 19:22 JOSE AUGUSTO DA SILVA PRA', 'JOSE AUGUSTO DA SILVA PRA'),
    ('PAGAMENTO DE BOLETO - FORTBRAS AUTOPECAS S.A.', 'FORTBRAS AUTOPECAS S A'),
    ('PAGAMENTO DE BOLETO - SHIRLEY O SILVA LTDA', 'SHIRLEY O SILVA LTDA'),
    ('PAGAMENTO DE BOLETO - PJBANK PAGAMENTOS S/A', 'PJBANK PAGAMENTOS S A'),
    ('PIX - RECEBIDO - 28/04 17:14 19892960000131 JOSIAS O DA', 'JOSIAS O DA'),
    ('TED TRANSF.ELETR.DISPONIV - 104 0803 03604733 FRANCISCO ALDENI', 'FRANCISCO ALDENI'),
    ('TRANSFERÊNCIA ENVIADA - 28/02 09:57 AMAZONIA AGROINDUSTRIA', 'AMAZONIA AGROINDUSTRIA'),
    ('TRANSFERIDO PARA POUPANÇA - 07/01 13:09 SEBASTIAO A OLIVEIRA', 'SEBASTIAO A OLIVEIRA'),
    ('PAGTO VIA AUTO-ATEND.BB - F PELEGRINELLI', 'F PELEGRINELLI'),
    ('IMPOSTOS - DETRAN-ACRE - TAXAS/MULTA', 'DETRAN ACRE TAXAS MULTA'),
    ('PAGTO CONTA TELEFONE - VIVO MOVEL', 'VIVO MOVEL'),
    ('PAGAMENTO CONTA LUZ - ENERGISA AC', 'ENERGISA AC'),
    ('TARIFA PACOTE DE SERVIÇOS - COBRANÇA REFERENTE 05/09/2025', null),
    ('BB RENDE FÁCIL - RENDE FACIL', null),
    ('PIX - ENVIADO - 01/09 19:22 12', null)
  ) as c(memo, esperado) loop
    if public.fn_conciliacao_cedente(v_caso.memo) is distinct from v_caso.esperado then
      raise exception 'FALHA 1: cedente(%) = % (esperado %)', v_caso.memo,
        public.fn_conciliacao_cedente(v_caso.memo), v_caso.esperado;
    end if;
  end loop;
  raise notice 'OK 1 cedente igual ao do TS nos 15 historicos';

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA APELIDO', 'outro', 'corrente', '666.666-6', true, 1000, date '2026-09-30') returning id into v_conta;
  select c.id into v_centro from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;
  insert into public.fornecedores (razao_social, nome_fantasia) values ('PROVA RONDOBRAS LTDA', 'PROVA RONDOBRAS') returning id into v_forn;

  -- tres parcelas pagas de R$ 100, 200 e 300 no mesmo fornecedor
  foreach v_n in array array[100, 200, 300] loop
    insert into public.lancamentos (tipo, origem, fornecedor_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
    values ('a_pagar', 'manual', v_forn, 'prova apelido ' || v_n, v_n, 'pago', date '2026-10-10', date '2026-10-01', date '2026-10-10', v_centro)
    returning id into v_lanc;
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
    values (v_lanc, 1, v_n, date '2026-10-10', 'pago', v_conta, date '2026-10-10');
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, v_n);
    if v_n = 100 then select id into v_parc1 from public.lancamento_parcelas where lancamento_id = v_lanc;
    elsif v_n = 200 then select id into v_parc2 from public.lancamento_parcelas where lancamento_id = v_lanc;
    else select id into v_parc3 from public.lancamento_parcelas where lancamento_id = v_lanc; end if;
  end loop;

  perform public.fn_conciliacao_importar(v_conta, 'PROVA.ofx', date '2026-10-01', date '2026-10-31', 400, date '2026-10-31', jsonb_build_array(
    jsonb_build_object('data', '2026-10-10', 'valor', -100, 'memo', 'PAGAMENTO DE BOLETO - FORTBRAS AUTOPECAS S.A.', 'fitid', 'pa-1'),
    jsonb_build_object('data', '2026-10-10', 'valor', -200, 'memo', 'PAGAMENTO DE BOLETO - FORTBRAS AUTOPECAS S.A.', 'fitid', 'pa-2'),
    jsonb_build_object('data', '2026-10-10', 'valor', -300, 'memo', 'PAGAMENTO DE BOLETO - OUTRO CEDENTE LTDA', 'fitid', 'pa-3')));
  select id into v_t1 from public.extrato_transacoes where conta_bancaria_id = v_conta and fitid = 'pa-1';
  select id into v_t2 from public.extrato_transacoes where conta_bancaria_id = v_conta and fitid = 'pa-2';
  select id into v_t3 from public.extrato_transacoes where conta_bancaria_id = v_conta and fitid = 'pa-3';

  -- 2. automatico sem confirmacao nao ensina
  perform public.fn_conciliacao_casar(v_t1, 'parcela', v_parc1, true, null::text);
  if public.fn_conciliacao_aprender_apelido(v_t1) then raise exception 'FALHA 2: aprendeu do automatico'; end if;
  if exists (select 1 from public.fornecedor_apelidos_bancarios where fornecedor_id = v_forn) then
    raise exception 'FALHA 2: gravou apelido do automatico';
  end if;
  raise notice 'OK 2 automatico sem confirmacao nao ensina';

  -- 3. fechar o mes confirma e aprende, tudo ou nada: aqui falta casar t2 e
  --    t3, entao o fechamento recusa e a confirmacao volta junto
  begin
    perform public.fn_conciliacao_fechar_mes_confirmando(v_conta, date '2026-10-01', array[v_t1]);
    raise exception 'FALHA 3: fechou com movimento faltando';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  if (select confira_confirmado_em from public.extrato_transacoes where id = v_t1) is not null then
    raise exception 'FALHA 3: confirmou sem fechar';
  end if;
  raise notice 'OK 3 fechamento recusado nao deixa confirmacao pela metade';

  -- 4. casar manual sem nome batendo ensina (gatilho 1)
  perform public.fn_conciliacao_casar(v_t3, 'parcela', v_parc3, false, null::text);
  if not public.fn_conciliacao_aprender_apelido(v_t3) then raise exception 'FALHA 4: nao aprendeu do manual'; end if;
  if not exists (select 1 from public.fornecedor_apelidos_bancarios
                 where fornecedor_id = v_forn and apelido = 'OUTRO CEDENTE LTDA' and origem = 'conciliacao') then
    raise exception 'FALHA 4: apelido do manual';
  end if;
  if public.fn_conciliacao_aprender_apelido(v_t3) then raise exception 'FALHA 4: aprendeu duas vezes'; end if;
  raise notice 'OK 4 casar manual ensina, uma vez so';

  -- 5. "Confirmar" dos Casados (gatilho 2) tira o selo e ensina
  v_res := public.fn_conciliacao_confirmar_conferencia(array[v_t1]);
  if (v_res->>'confirmadas')::int <> 1 or (v_res->>'aprendidos')::int <> 1 then
    raise exception 'FALHA 5: confirmar = %', v_res;
  end if;
  if (select confira_confirmado_por from public.extrato_transacoes where id = v_t1) <> v_tiago then
    raise exception 'FALHA 5: confirmado_por';
  end if;
  raise notice 'OK 5 confirmar tira o selo e aprende FORTBRAS -> RONDOBRAS';

  -- 6. uso: casar outro FORTBRAS conta o apelido
  perform public.fn_conciliacao_casar(v_t2, 'parcela', v_parc2, true, null::text);
  if (select vezes_usado from public.fornecedor_apelidos_bancarios
      where fornecedor_id = v_forn and apelido = 'FORTBRAS AUTOPECAS S A') <> 1 then
    raise exception 'FALHA 6: vezes_usado';
  end if;
  raise notice 'OK 6 uso contado';

  -- 7. fechar o mes (gatilho 3): agora tudo casado e saldo 400 = 1000 - 600
  perform public.fn_conciliacao_fechar_mes_confirmando(v_conta, date '2026-10-01', array[v_t2]);
  if (select confira_confirmado_em from public.extrato_transacoes where id = v_t2) is null then
    raise exception 'FALHA 7: fechar nao confirmou';
  end if;
  if not exists (select 1 from public.conciliacao_fechamentos where conta_bancaria_id = v_conta and reaberto_em is null) then
    raise exception 'FALHA 7: nao fechou';
  end if;
  raise notice 'OK 7 fechar o mes confirma os Confira';

  -- 8. unicidade e manual
  begin
    perform public.fn_fornecedor_apelido_salvar(v_forn, null, 'fortbras autopeças s.a.');
    raise exception 'FALHA 8: duplicou apelido';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  perform public.fn_fornecedor_apelido_salvar(v_forn, null, 'Rondo Bras Matriz');
  if not exists (select 1 from public.fornecedor_apelidos_bancarios where apelido = 'RONDO BRAS MATRIZ' and origem = 'manual') then
    raise exception 'FALHA 8: manual nao normalizou';
  end if;
  raise notice 'OK 8 unicidade e apelido manual normalizado';

  -- 9. painel traz os apelidos e a confirmacao
  v_res := public.fn_conciliacao_painel(v_conta, date '2026-10-01', date '2026-10-31');
  if not exists (select 1 from jsonb_array_elements(v_res->'transacoes') t
                 where t->>'id' = v_t1::text and (t->>'confiraConfirmado')::boolean
                   and (t->'parcela'->'apelidos') ? 'FORTBRAS AUTOPECAS S A') then
    raise exception 'FALHA 9: painel sem apelido ou confirmacao';
  end if;
  raise notice 'OK 9 painel com apelidos';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
