-- =============================================================
-- Fase 4 / Migration: funções PEPS do estoque
-- Núcleo interno (sem checagem, só chamável por outras funções definer)
-- + funções públicas (checam permissão da aba). Saída consome as camadas
-- mais antigas; o custo da saída é a soma de (qtd x custo da camada).
-- =============================================================

create or replace function public.fn_recalcular_saldo_estoque(p_insumo uuid, p_deposito uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.estoque_saldos (insumo_id, deposito_id, quantidade, valor_total, atualizado_em)
  select p_insumo, p_deposito,
    coalesce(sum(quantidade_restante), 0),
    coalesce(sum(round(quantidade_restante * custo_unitario, 2)), 0), now()
  from public.estoque_camadas where insumo_id = p_insumo and deposito_id = p_deposito
  on conflict (insumo_id, deposito_id) do update
    set quantidade = excluded.quantidade, valor_total = excluded.valor_total, atualizado_em = now();
end $$;
revoke all on function public.fn_recalcular_saldo_estoque(uuid, uuid) from public, anon, authenticated;

-- Entrada interna: movimento + camada PEPS + saldo. Sem checagem.
create or replace function public.fn_estoque_entrada_interna(
  p_insumo uuid, p_deposito uuid, p_quantidade numeric, p_custo_unitario numeric,
  p_origem text, p_origem_id uuid, p_data date, p_obs text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mov uuid; v_data date := coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date);
begin
  insert into public.estoque_movimentos (tipo, insumo_id, deposito_id, quantidade, custo_unitario, custo_total, origem, origem_id, observacao, data_movimento, created_by)
  values ('entrada', p_insumo, p_deposito, p_quantidade, p_custo_unitario, round(p_quantidade * p_custo_unitario, 2), p_origem, p_origem_id, p_obs, v_data, (select auth.uid()))
  returning id into v_mov;
  insert into public.estoque_camadas (insumo_id, deposito_id, movimento_id, quantidade_inicial, quantidade_restante, custo_unitario, data_entrada)
  values (p_insumo, p_deposito, v_mov, p_quantidade, p_quantidade, p_custo_unitario, v_data);
  perform public.fn_recalcular_saldo_estoque(p_insumo, p_deposito);
  return v_mov;
end $$;
revoke all on function public.fn_estoque_entrada_interna(uuid, uuid, numeric, numeric, text, uuid, date, text) from public, anon, authenticated;

-- Saída interna: consome camadas FIFO, custa por elas, cria movimento. Sem checagem.
create or replace function public.fn_estoque_saida_interna(
  p_insumo uuid, p_deposito uuid, p_quantidade numeric, p_tipo text,
  p_centro_custo uuid, p_origem text, p_origem_id uuid, p_data date, p_obs text, p_equipamento uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_restante numeric := p_quantidade; v_custo_total numeric := 0; v_mov uuid;
  v_camada record; v_consome numeric; v_saldo numeric;
begin
  select coalesce(sum(quantidade_restante), 0) into v_saldo
  from public.estoque_camadas where insumo_id = p_insumo and deposito_id = p_deposito;
  if v_saldo < p_quantidade then
    raise exception 'Saldo insuficiente no deposito: % disponivel, % solicitado', v_saldo, p_quantidade;
  end if;

  for v_camada in
    select * from public.estoque_camadas
    where insumo_id = p_insumo and deposito_id = p_deposito and quantidade_restante > 0
    order by data_entrada, sequencia
  loop
    exit when v_restante <= 0;
    v_consome := least(v_restante, v_camada.quantidade_restante);
    update public.estoque_camadas set quantidade_restante = quantidade_restante - v_consome where id = v_camada.id;
    v_custo_total := v_custo_total + v_consome * v_camada.custo_unitario;
    v_restante := v_restante - v_consome;
  end loop;

  insert into public.estoque_movimentos (tipo, insumo_id, deposito_id, quantidade, custo_total, centro_custo_id, equipamento_id, origem, origem_id, observacao, data_movimento, created_by)
  values (p_tipo, p_insumo, p_deposito, p_quantidade, round(v_custo_total, 2), p_centro_custo, p_equipamento, p_origem, p_origem_id, p_obs, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date), (select auth.uid()))
  returning id into v_mov;
  perform public.fn_recalcular_saldo_estoque(p_insumo, p_deposito);
  return v_mov;
end $$;
revoke all on function public.fn_estoque_saida_interna(uuid, uuid, numeric, text, uuid, text, uuid, date, text, uuid) from public, anon, authenticated;

-- ---------- Funções públicas (checam permissão) ----------
create or replace function public.fn_estoque_entrada(p_insumo uuid, p_deposito uuid, p_quantidade numeric, p_custo_unitario numeric, p_data date, p_obs text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.tem_permissao('estoque.entradas', 'criar') then raise exception 'Sem permissao para lancar entradas'; end if;
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  if p_custo_unitario < 0 then raise exception 'Custo invalido'; end if;
  return public.fn_estoque_entrada_interna(p_insumo, p_deposito, p_quantidade, p_custo_unitario, 'manual', null, p_data, p_obs);
end $$;
revoke all on function public.fn_estoque_entrada(uuid, uuid, numeric, numeric, date, text) from public, anon;
grant execute on function public.fn_estoque_entrada(uuid, uuid, numeric, numeric, date, text) to authenticated;

create or replace function public.fn_estoque_saida(p_insumo uuid, p_deposito uuid, p_quantidade numeric, p_centro_custo uuid, p_data date, p_obs text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.tem_permissao('estoque.saidas', 'criar') then raise exception 'Sem permissao para lancar saidas'; end if;
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  if p_centro_custo is null then raise exception 'Informe o centro de custo do consumo'; end if;
  return public.fn_estoque_saida_interna(p_insumo, p_deposito, p_quantidade, 'consumo', p_centro_custo, 'manual', null, p_data, p_obs, null);
end $$;
revoke all on function public.fn_estoque_saida(uuid, uuid, numeric, uuid, date, text) from public, anon;
grant execute on function public.fn_estoque_saida(uuid, uuid, numeric, uuid, date, text) to authenticated;

create or replace function public.fn_estoque_transferencia(p_insumo uuid, p_origem uuid, p_destino uuid, p_quantidade numeric, p_data date, p_obs text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_saida uuid; v_custo numeric;
begin
  if not public.tem_permissao('estoque.transferencias', 'criar') then raise exception 'Sem permissao para transferir'; end if;
  if p_origem = p_destino then raise exception 'Origem e destino devem ser diferentes'; end if;
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  v_saida := public.fn_estoque_saida_interna(p_insumo, p_origem, p_quantidade, 'transferencia', null, 'transferencia', null, p_data, p_obs, null);
  update public.estoque_movimentos set deposito_destino_id = p_destino where id = v_saida;
  select custo_total into v_custo from public.estoque_movimentos where id = v_saida;
  -- entrada no destino com o custo medio das camadas consumidas (preserva o valor)
  perform public.fn_estoque_entrada_interna(p_insumo, p_destino, p_quantidade, round(v_custo / p_quantidade, 4), 'transferencia', v_saida, p_data, p_obs);
  return v_saida;
end $$;
revoke all on function public.fn_estoque_transferencia(uuid, uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.fn_estoque_transferencia(uuid, uuid, uuid, numeric, date, text) to authenticated;

create or replace function public.fn_estoque_ajuste(p_insumo uuid, p_deposito uuid, p_quantidade_nova numeric, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_saldo numeric; v_valor numeric; v_custo_medio numeric; v_diff numeric; v_mov uuid;
begin
  if not public.tem_permissao('estoque.inventario', 'criar') then raise exception 'Sem permissao para ajustar inventario'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do ajuste'; end if;
  if p_quantidade_nova < 0 then raise exception 'Quantidade nova invalida'; end if;

  select coalesce(sum(quantidade_restante), 0), coalesce(sum(quantidade_restante * custo_unitario), 0)
  into v_saldo, v_valor from public.estoque_camadas where insumo_id = p_insumo and deposito_id = p_deposito;
  v_diff := p_quantidade_nova - v_saldo;
  if v_diff = 0 then raise exception 'A quantidade nova e igual ao saldo atual'; end if;

  if v_diff > 0 then
    v_custo_medio := case when v_saldo > 0 then v_valor / v_saldo else 0 end;
    insert into public.estoque_movimentos (tipo, insumo_id, deposito_id, quantidade, custo_unitario, custo_total, origem, observacao, created_by)
    values ('ajuste_positivo', p_insumo, p_deposito, v_diff, v_custo_medio, round(v_diff * v_custo_medio, 2), 'inventario', p_motivo, (select auth.uid()))
    returning id into v_mov;
    insert into public.estoque_camadas (insumo_id, deposito_id, movimento_id, quantidade_inicial, quantidade_restante, custo_unitario, data_entrada)
    values (p_insumo, p_deposito, v_mov, v_diff, v_diff, v_custo_medio, (now() at time zone 'America/Rio_Branco')::date);
  else
    v_mov := public.fn_estoque_saida_interna(p_insumo, p_deposito, abs(v_diff), 'ajuste_negativo', null, 'inventario', null, null, p_motivo, null);
  end if;
  perform public.fn_recalcular_saldo_estoque(p_insumo, p_deposito);
  return v_mov;
end $$;
revoke all on function public.fn_estoque_ajuste(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.fn_estoque_ajuste(uuid, uuid, numeric, text) to authenticated;

-- Abastecimento: saída do tanque (consumo) para o centro de custo do equipamento.
create or replace function public.fn_abastecer(
  p_tanque uuid, p_equipamento uuid, p_quantidade numeric, p_horimetro numeric, p_km numeric, p_operador uuid, p_data date, p_obs text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_insumo uuid; v_cc uuid; v_mov uuid; v_custo numeric; v_abast uuid;
begin
  if not public.tem_permissao('estoque.tanques', 'criar') then raise exception 'Sem permissao para registrar abastecimento'; end if;
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;

  select insumo_id into v_insumo from public.depositos where id = p_tanque;
  if v_insumo is null then raise exception 'O deposito informado nao e um tanque com insumo'; end if;

  select id into v_cc from public.centros_custo where equipamento_id = p_equipamento limit 1;

  v_mov := public.fn_estoque_saida_interna(v_insumo, p_tanque, p_quantidade, 'consumo', v_cc, 'abastecimento', null, p_data, p_obs, p_equipamento);
  select custo_total into v_custo from public.estoque_movimentos where id = v_mov;

  insert into public.abastecimentos (movimento_id, equipamento_id, deposito_id, insumo_id, quantidade, custo_total, horimetro, km, operador_id, data_abastecimento, observacao, created_by)
  values (v_mov, p_equipamento, p_tanque, v_insumo, p_quantidade, v_custo, p_horimetro, p_km, p_operador, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date), p_obs, (select auth.uid()))
  returning id into v_abast;
  return v_abast;
end $$;
revoke all on function public.fn_abastecer(uuid, uuid, numeric, numeric, numeric, uuid, date, text) from public, anon;
grant execute on function public.fn_abastecer(uuid, uuid, numeric, numeric, numeric, uuid, date, text) to authenticated;
