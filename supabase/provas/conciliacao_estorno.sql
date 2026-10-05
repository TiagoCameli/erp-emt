-- Prova de aceite (05/10/2026): estorno casa movimento com movimento.
-- Roda depois da migration 20261005120000 e termina em ROLLBACK.
-- Usa o PIX rejeitado real de R$ 360,00 de 07/02/2025 do BB 102.124-9.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_bb uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_dev uuid;
  v_env uuid;
  v_outro uuid;
  v_painel jsonb;
  v_t jsonb;
  v_lote jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  select id into v_dev from public.extrato_transacoes
   where conta_bancaria_id = v_bb and data_movimento = date '2025-02-07' and valor = 360 and memo ilike 'PIX - REJEITADO%';
  select id into v_env from public.extrato_transacoes
   where conta_bancaria_id = v_bb and data_movimento between date '2025-02-02' and date '2025-02-07'
     and valor = -360 and not conciliada order by data_movimento desc, memo limit 1;
  if v_dev is null or v_env is null then raise exception 'FALHA 0: nao achei o par real'; end if;

  -- recusas
  select id into v_outro from public.extrato_transacoes
   where conta_bancaria_id = v_bb and valor > 0 and valor <> 360 and not conciliada limit 1;
  begin
    perform public.fn_conciliacao_casar_estorno(v_dev, v_outro, false);
    raise exception 'FALHA 1: casou dois creditos';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  select id into v_outro from public.extrato_transacoes
   where conta_bancaria_id = v_bb and valor < 0 and valor <> -360 and not conciliada
     and data_movimento between date '2025-02-01' and date '2025-02-10' limit 1;
  begin
    perform public.fn_conciliacao_casar_estorno(v_dev, v_outro, false);
    raise exception 'FALHA 1: casou valores diferentes';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  raise notice 'OK 1 recusa mesmo sentido e valor diferente';

  -- casa pelo lote, especie estorno
  v_lote := public.fn_conciliacao_casar_lote(
    jsonb_build_array(jsonb_build_object('transacao', v_dev, 'especie', 'estorno', 'alvo', v_env)), true);
  if (v_lote->>'casadas')::int <> 1 then raise exception 'FALHA 2: lote = %', v_lote; end if;
  if not exists (select 1 from public.extrato_transacoes where id = v_dev and conciliada and estorno_par_id = v_env and conciliacao_automatica)
     or not exists (select 1 from public.extrato_transacoes where id = v_env and conciliada and estorno_par_id = v_dev) then
    raise exception 'FALHA 2: par nao gravado dos dois lados';
  end if;
  raise notice 'OK 2 lote casou o estorno dos dois lados';

  -- de novo: ja conciliado
  begin
    perform public.fn_conciliacao_casar_estorno(v_env, v_dev, false);
    raise exception 'FALHA 3: casou duas vezes';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- painel mostra o par
  v_painel := public.fn_conciliacao_painel(v_bb, date '2025-02-01', date '2025-02-28');
  select t into v_t from jsonb_array_elements(v_painel->'transacoes') t where t->>'id' = v_dev::text;
  if (v_t->'estorno'->>'id') <> v_env::text or not (v_t->>'conciliada')::boolean then
    raise exception 'FALHA 4: painel = %', v_t;
  end if;
  if jsonb_typeof(v_painel->'vizinhos') <> 'array' then raise exception 'FALHA 4: sem vizinhos'; end if;
  raise notice 'OK 4 painel com o par e % vizinhos', jsonb_array_length(v_painel->'vizinhos');

  -- desfazer solta os dois
  perform public.fn_desconciliar_transacao(v_env);
  if exists (select 1 from public.extrato_transacoes where id in (v_dev, v_env) and (conciliada or estorno_par_id is not null)) then
    raise exception 'FALHA 5: desfazer deixou um lado preso';
  end if;
  raise notice 'OK 5 desfazer soltou os dois lados';

  -- a trava de vinculo unico conta o estorno
  begin
    update public.extrato_transacoes set estorno_par_id = v_env,
      transferencia_id = (select id from public.transferencias_contas limit 1) where id = v_dev;
    raise exception 'FALHA 6: aceitou dois vinculos';
  exception when check_violation then null;
  end;
  raise notice 'OK 6 um vinculo so';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
