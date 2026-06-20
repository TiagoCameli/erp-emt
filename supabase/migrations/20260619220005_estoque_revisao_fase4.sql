-- =============================================================
-- Fase 4 / Migration: correções da revisão adversarial
-- 1. fn_estoque_saida_interna: trava as camadas (FOR UPDATE) e checa o
--    saldo APÓS consumir, serializando saídas concorrentes do mesmo
--    insumo+depósito e devolvendo a mensagem amigável de saldo insuficiente
--    em vez de violar o CHECK cru.
-- 2. fn_estoque_transferencia: replica as camadas consumidas no destino
--    com o MESMO custo unitário (PEPS puro), eliminando o drift de
--    centavos de round(custo/qtd, 4) em transferências de grande volume.
-- 3. fn_abastecer: exige centro de custo do equipamento (não lança consumo
--    de combustível sem CC, que é o objetivo da apuração por equipamento).
-- =============================================================

-- 1. Saída interna com lock pessimista das camadas.
create or replace function public.fn_estoque_saida_interna(
  p_insumo uuid, p_deposito uuid, p_quantidade numeric, p_tipo text,
  p_centro_custo uuid, p_origem text, p_origem_id uuid, p_data date, p_obs text, p_equipamento uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_restante numeric := p_quantidade; v_custo_total numeric := 0; v_mov uuid;
  v_camada record; v_consome numeric;
begin
  -- Consome FIFO travando cada camada (for update serializa concorrentes).
  for v_camada in
    select * from public.estoque_camadas
    where insumo_id = p_insumo and deposito_id = p_deposito and quantidade_restante > 0
    order by data_entrada, sequencia
    for update
  loop
    exit when v_restante <= 0;
    v_consome := least(v_restante, v_camada.quantidade_restante);
    update public.estoque_camadas set quantidade_restante = quantidade_restante - v_consome where id = v_camada.id;
    v_custo_total := v_custo_total + v_consome * v_camada.custo_unitario;
    v_restante := v_restante - v_consome;
  end loop;

  -- Checagem definitiva sob o lock: se não deu, reverte (raise) com mensagem clara.
  if v_restante > 0 then
    raise exception 'Saldo insuficiente no deposito: faltam % para atender % solicitado', v_restante, p_quantidade;
  end if;

  insert into public.estoque_movimentos (tipo, insumo_id, deposito_id, quantidade, custo_total, centro_custo_id, equipamento_id, origem, origem_id, observacao, data_movimento, created_by)
  values (p_tipo, p_insumo, p_deposito, p_quantidade, round(v_custo_total, 2), p_centro_custo, p_equipamento, p_origem, p_origem_id, p_obs, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date), (select auth.uid()))
  returning id into v_mov;
  perform public.fn_recalcular_saldo_estoque(p_insumo, p_deposito);
  return v_mov;
end $$;
revoke all on function public.fn_estoque_saida_interna(uuid, uuid, numeric, text, uuid, text, uuid, date, text, uuid) from public, anon, authenticated;

-- 2. Transferência por replicação de camadas (sem drift de arredondamento).
create or replace function public.fn_estoque_transferencia(p_insumo uuid, p_origem uuid, p_destino uuid, p_quantidade numeric, p_data date, p_obs text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_restante numeric := p_quantidade; v_custo_total numeric := 0;
  v_saida uuid; v_entrada uuid; v_camada record; v_consome numeric;
  v_data date := coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date);
begin
  if not public.tem_permissao('estoque.transferencias', 'criar') then raise exception 'Sem permissao para transferir'; end if;
  if p_origem = p_destino then raise exception 'Origem e destino devem ser diferentes'; end if;
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;

  -- Movimentos do livro: saída na origem (com destino) e entrada no destino.
  insert into public.estoque_movimentos (tipo, insumo_id, deposito_id, deposito_destino_id, quantidade, origem, observacao, data_movimento, created_by)
  values ('transferencia', p_insumo, p_origem, p_destino, p_quantidade, 'transferencia', p_obs, v_data, (select auth.uid()))
  returning id into v_saida;
  insert into public.estoque_movimentos (tipo, insumo_id, deposito_id, quantidade, origem, origem_id, observacao, data_movimento, created_by)
  values ('entrada', p_insumo, p_destino, p_quantidade, 'transferencia', v_saida, p_obs, v_data, (select auth.uid()))
  returning id into v_entrada;

  -- Consome camadas da origem (FIFO, travadas) e cria no destino camadas com
  -- o MESMO custo unitário e a MESMA data de entrada (preserva idade e valor).
  for v_camada in
    select * from public.estoque_camadas
    where insumo_id = p_insumo and deposito_id = p_origem and quantidade_restante > 0
    order by data_entrada, sequencia
    for update
  loop
    exit when v_restante <= 0;
    v_consome := least(v_restante, v_camada.quantidade_restante);
    update public.estoque_camadas set quantidade_restante = quantidade_restante - v_consome where id = v_camada.id;
    insert into public.estoque_camadas (insumo_id, deposito_id, movimento_id, quantidade_inicial, quantidade_restante, custo_unitario, data_entrada)
    values (p_insumo, p_destino, v_entrada, v_consome, v_consome, v_camada.custo_unitario, v_camada.data_entrada);
    v_custo_total := v_custo_total + v_consome * v_camada.custo_unitario;
    v_restante := v_restante - v_consome;
  end loop;

  if v_restante > 0 then
    raise exception 'Saldo insuficiente no deposito de origem: faltam % para transferir % solicitado', v_restante, p_quantidade;
  end if;

  update public.estoque_movimentos set custo_total = round(v_custo_total, 2) where id in (v_saida, v_entrada);
  perform public.fn_recalcular_saldo_estoque(p_insumo, p_origem);
  perform public.fn_recalcular_saldo_estoque(p_insumo, p_destino);
  return v_saida;
end $$;
revoke all on function public.fn_estoque_transferencia(uuid, uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.fn_estoque_transferencia(uuid, uuid, uuid, numeric, date, text) to authenticated;

-- 3. Abastecimento exige centro de custo do equipamento.
create or replace function public.fn_abastecer(
  p_tanque uuid, p_equipamento uuid, p_quantidade numeric,
  p_horimetro numeric default null, p_km numeric default null,
  p_operador uuid default null, p_data date default null, p_obs text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_insumo uuid; v_cc uuid; v_mov uuid; v_custo numeric; v_abast uuid;
begin
  if not public.tem_permissao('estoque.tanques', 'criar') then raise exception 'Sem permissao para registrar abastecimento'; end if;
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;

  select insumo_id into v_insumo from public.depositos where id = p_tanque;
  if v_insumo is null then raise exception 'O deposito informado nao e um tanque com insumo'; end if;

  select id into v_cc from public.centros_custo where equipamento_id = p_equipamento limit 1;
  if v_cc is null then raise exception 'Equipamento sem centro de custo de manutencao. Cadastre o centro de custo do equipamento antes de abastecer'; end if;

  v_mov := public.fn_estoque_saida_interna(v_insumo, p_tanque, p_quantidade, 'consumo', v_cc, 'abastecimento', null, p_data, p_obs, p_equipamento);
  select custo_total into v_custo from public.estoque_movimentos where id = v_mov;

  insert into public.abastecimentos (movimento_id, equipamento_id, deposito_id, insumo_id, quantidade, custo_total, horimetro, km, operador_id, data_abastecimento, observacao, created_by)
  values (v_mov, p_equipamento, p_tanque, v_insumo, p_quantidade, v_custo, p_horimetro, p_km, p_operador, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date), p_obs, (select auth.uid()))
  returning id into v_abast;
  return v_abast;
end $$;
revoke all on function public.fn_abastecer(uuid, uuid, numeric, numeric, numeric, uuid, date, text) from public, anon;
grant execute on function public.fn_abastecer(uuid, uuid, numeric, numeric, numeric, uuid, date, text) to authenticated;
