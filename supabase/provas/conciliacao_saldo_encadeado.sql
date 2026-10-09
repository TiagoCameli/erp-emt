-- Prova de aceite, Bloco K (05/10/2026): saldo encadeado e ancoras.
-- Roda depois da migration 20261005180000 e termina em ROLLBACK.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_aplic uuid := 'd914abf2-77a4-4c4d-b356-8038740aae81';
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_sub uuid; v_t uuid; v_r jsonb; v_painel jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  -- 1. ancora no dia 10, extrato de 1 a 31
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA K1', 'outro', 'corrente', '555.551-1', true, 0, date '2026-09-30') returning id into v_c1;
  perform public.fn_conciliacao_importar(v_c1, 'K1.ofx', date '2026-10-01', date '2026-10-31', 0, date '2026-11-05', jsonb_build_array(
    jsonb_build_object('data', '2026-10-03', 'valor', -50, 'memo', 'A', 'fitid', 'k1-1'),
    jsonb_build_object('data', '2026-10-10', 'valor', 20, 'memo', 'B', 'fitid', 'k1-2'),
    jsonb_build_object('data', '2026-10-15', 'valor', -100, 'memo', 'C', 'fitid', 'k1-3'),
    jsonb_build_object('data', '2026-10-31', 'valor', 30, 'memo', 'D', 'fitid', 'k1-4')));
  if exists (select 1 from public.conciliacao_saldos_ancora where conta_bancaria_id = v_c1) then
    raise exception 'FALHA 1: LEDGERBAL com DTASOF depois do fim virou ancora';
  end if;
  if (public.fn_conciliacao_saldo_banco(v_c1, date '2026-10-31')->>'cobertura') <> 'sem_ancora' then
    raise exception 'FALHA 1: sem ancora';
  end if;
  perform public.fn_conciliacao_registrar_ancora(v_c1, date '2026-10-10', 1000, 'extrato_pdf', 'pdf');
  v_r := public.fn_conciliacao_saldo_banco(v_c1, date '2026-10-31');
  if (v_r->>'saldo')::numeric <> 930 or v_r->>'cobertura' <> 'ok' or v_r->>'ancoraData' <> '2026-10-10' then
    raise exception 'FALHA 1: saldo em 31 = %', v_r;
  end if;
  v_r := public.fn_conciliacao_saldo_banco(v_c1, date '2026-10-05');
  if (v_r->>'saldo')::numeric <> 980 then raise exception 'FALHA 1: saldo em 05 = %', v_r; end if;
  v_r := public.fn_conciliacao_saldo_banco(v_c1, date '2026-10-02');
  if (v_r->>'saldo')::numeric <> 1030 then raise exception 'FALHA 1: saldo em 02 = %', v_r; end if;
  raise notice 'OK 1 encadeado: 930 em 31, 980 em 05, 1030 em 02; LEDGERBAL do download nao vira ancora';

  -- 2. buraco de cobertura
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA K2', 'outro', 'corrente', '555.552-2', true, 0, date '2026-09-30') returning id into v_c2;
  perform public.fn_conciliacao_importar(v_c2, 'K2a.ofx', date '2026-10-01', date '2026-10-10', null, null,
    jsonb_build_array(jsonb_build_object('data', '2026-10-02', 'valor', -1, 'memo', 'A', 'fitid', 'k2-1')));
  perform public.fn_conciliacao_importar(v_c2, 'K2b.ofx', date '2026-10-20', date '2026-10-31', null, null,
    jsonb_build_array(jsonb_build_object('data', '2026-10-25', 'valor', -1, 'memo', 'B', 'fitid', 'k2-2')));
  perform public.fn_conciliacao_registrar_ancora(v_c2, date '2026-10-05', 500, 'extrato_pdf', null);
  v_r := public.fn_conciliacao_saldo_banco(v_c2, date '2026-10-25');
  if v_r->>'saldo' is not null or v_r->>'cobertura' <> 'sem_cobertura' then
    raise exception 'FALHA 2: buraco = %', v_r;
  end if;
  raise notice 'OK 2 buraco de cobertura devolve null';

  -- 3. LEDGERBAL com DTASOF = fim vira ancora; subconta divergente recusa
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA K3', 'outro', 'corrente', '555.553-3', true, 1000, date '2026-09-30') returning id into v_c3;
  select id into v_sub from public.contas_bancarias where conta_pai_id = v_c3;
  perform public.fn_conciliacao_importar(v_c3, 'K3.ofx', date '2026-10-01', date '2026-10-31', 1000, date '2026-10-31',
    jsonb_build_array(jsonb_build_object('data', '2026-10-10', 'valor', -100, 'memo', 'BB RENDE FACIL', 'fitid', 'k3-1')));
  if not exists (select 1 from public.conciliacao_saldos_ancora
                 where conta_bancaria_id = v_c3 and data = date '2026-10-31' and fonte = 'ledgerbal_fim_periodo') then
    raise exception 'FALHA 3: LEDGERBAL do fim nao virou ancora';
  end if;
  -- o arquivo diz 1000, mas saiu 100: o banco fecha em 1000, o app em 900
  -- depois da transferencia. Corrige a ancora para 900 (o PDF).
  perform public.fn_conciliacao_registrar_ancora(v_c3, date '2026-10-31', 900, 'extrato_pdf', 'pdf');
  select id into v_t from public.extrato_transacoes where conta_bancaria_id = v_c3 and fitid = 'k3-1';
  perform public.fn_conciliacao_lancar_transferencia(v_t, v_sub, v_aplic, 'Rende');

  v_painel := public.fn_conciliacao_painel(v_c3, date '2026-10-01', date '2026-10-31');
  if (v_painel->'saldo'->>'banco')::numeric <> 900 or v_painel->'saldo'->>'bancoFonte' <> 'encadeado'
     or not (v_painel->'saldo'->>'bate')::boolean or (v_painel->'saldo'->'subconta'->>'app')::numeric <> 100
     or (v_painel->'saldo'->'subconta'->>'temAncora')::boolean then
    raise exception 'FALHA 3: painel = %', v_painel->'saldo';
  end if;

  -- 09/10/2026: a subconta nao trava mais o fechamento (sem saldo dela, ou
  -- divergente). Vale o saldo da conta.
  perform public.fn_conciliacao_registrar_ancora(v_sub, date '2026-10-31', 90, 'extrato_pdf', 'pdf investimentos');
  perform public.fn_conciliacao_fechar_mes(v_c3, date '2026-10-01');
  if not exists (select 1 from public.conciliacao_fechamentos where conta_bancaria_id = v_c3 and mes = date '2026-10-01') then
    raise exception 'FALHA 3: nao fechou com a subconta divergente';
  end if;
  raise notice 'OK 3 LEDGERBAL do fim vira ancora; subconta divergente nao trava o fechamento';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
