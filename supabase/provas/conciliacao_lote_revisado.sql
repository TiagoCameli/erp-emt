-- Prova de aceite, Bloco E (03/10/2026): lote revisado (p_automatica = false)
-- casa paga em outra conta (troca a conta) e em aberto aprovada (da baixa),
-- e o lote automatico (so p_pares) continua recusando os dois. ROLLBACK.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_bb uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_caixa uuid := '3e8dd187-0684-40f0-8757-55608b9204ec';
  v_dia date := date '2026-10-02';
  v_centro uuid;
  v_extrato uuid;
  t_outra uuid; t_aberta uuid;
  v_lanc uuid; p_outra uuid; p_aberta uuid;
  v_r jsonb;
begin
  select c.id into v_centro from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim)
  values (v_bb, 'PROVA-E.ofx', v_dia, v_dia) returning id into v_extrato;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato, v_bb, v_dia, -321.00, 'debito', 'PIX OUTRA', 'prova-e-1') returning id into t_outra;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato, v_bb, v_dia, -654.00, 'debito', 'BOLETO ABERTA', 'prova-e-2') returning id into t_aberta;

  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_pagar', 'manual', 'prova E outra', 321, 'pago', v_dia, date '2026-10-01', v_dia, v_centro) returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
  values (v_lanc, 1, 321, v_dia, 'pago', v_caixa, v_dia) returning id into p_outra;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 321);

  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_pagar', 'manual', 'prova E aberta', 654, 'aprovado', v_dia, date '2026-10-01', v_dia, v_centro) returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_programada)
  values (v_lanc, 1, 654, v_dia, 'aprovado', v_caixa, v_dia) returning id into p_aberta;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 654);

  -- automatico: recusa os dois
  v_r := public.fn_conciliacao_casar_lote(jsonb_build_array(
    jsonb_build_object('transacao', t_outra, 'especie', 'parcela', 'alvo', p_outra),
    jsonb_build_object('transacao', t_aberta, 'especie', 'parcela', 'alvo', p_aberta)), true);
  if (v_r->>'casadas')::int <> 0 then raise exception 'FALHA 1: automatico casou %', v_r; end if;
  raise notice 'OK 1 automatico recusa outra conta e aberta';

  -- revisado: casa os dois, sem marcar automatico
  v_r := public.fn_conciliacao_casar_lote(jsonb_build_array(
    jsonb_build_object('transacao', t_outra, 'especie', 'parcela', 'alvo', p_outra),
    jsonb_build_object('transacao', t_aberta, 'especie', 'parcela', 'alvo', p_aberta)), false);
  if (v_r->>'casadas')::int <> 2
     or (select conta_bancaria_id from public.lancamento_parcelas where id = p_outra) <> v_bb
     or (select status from public.lancamento_parcelas where id = p_aberta) <> 'pago'
     or exists (select 1 from public.extrato_transacoes where id in (t_outra, t_aberta) and (conciliacao_automatica or not conciliada)) then
    raise exception 'FALHA 2: revisado %', v_r;
  end if;
  raise notice 'OK 2 revisado: troca a conta, da baixa, nao marca automatico';
end;
$prova$;

set constraints all immediate;

select 'PROVA OK' as resultado;

rollback;
