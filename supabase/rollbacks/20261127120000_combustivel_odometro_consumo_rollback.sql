-- Desfaz 20261127120000_combustivel_odometro_consumo.
--
-- NÃO aplicar sem o Tiago. Fica versionado para emergência.
--
-- O que se perde ao desfazer: as leituras de km e h lançadas depois da migration
-- (odometro_km, horimetro_h, virada). Antes de rodar, salve-as:
--   create table legado.leituras_odometro_salvas as
--   select id, odometro_km, horimetro_h, virada, motivo_virada from public.combustivel_saidas
--    where odometro_km is not null or horimetro_h is not null;
-- medicao/tipo_medicao continuam na tabela com a leitura do controle_por, como antes.
--
-- As funções voltam com a definição viva de 27/11/2026 (lida por pg_get_functiondef).

begin;

-- 1. Gatilho e funções novas.
drop trigger if exists trg_comb_saida_leitura on public.combustivel_saidas;
drop function if exists public.fn_comb_trg_saida_leitura();
drop function if exists public.fn_comb_consumo_trechos(timestamptz, timestamptz, text);
drop function if exists public.fn_comb_ultima_leitura(uuid, uuid, text, timestamptz, uuid);
delete from public.configuracoes where chave in (
  'combustivel.salto_km_dia_carreta', 'combustivel.salto_km_dia_veiculo_leve', 'combustivel.salto_h_dia',
  'combustivel.consumo_min_km_l', 'combustivel.consumo_max_l_h', 'combustivel.desvio_media_percentual',
  'combustivel.desvio_janela_meses', 'combustivel.desvio_min_trechos');

-- 2. Dados: carretas da EMT sem equipamento, placas e cadastro como estavam (modo carga:
--    sem recálculo nem conta corrente, que não dependem desses campos).
select set_config('app.carga_combustivel', '1', true);
update public.combustivel_saidas set equipamento_id = null where tipo_consumidor = 'carreta_transportadora';
update public.combustivel_saidas s set placa = b.valor_antigo
  from legado.bkp_odometro_20261127 b
 where b.tabela = 'combustivel_saidas' and b.coluna = 'placa' and b.id = s.id;
update public.equipamentos e set controle_por = b.valor_antigo
  from legado.bkp_odometro_20261127 b
 where b.tabela = 'equipamentos' and b.coluna = 'controle_por' and b.id = e.id;
update public.equipamentos e set placa = b.valor_antigo
  from legado.bkp_odometro_20261127 b
 where b.tabela = 'equipamentos' and b.coluna = 'placa' and b.id = e.id;
select set_config('app.carga_combustivel', '', true);

-- 3. Leitura do equipamento: uma por abastecimento, como antes. As leituras de origem
--    'abastecimento' são derivadas da saída: fica só a do tipo_medicao dela.
delete from public.equipamento_medicoes m
 using public.combustivel_saidas s
 where m.combustivel_saida_id = s.id and m.tipo is distinct from s.tipo_medicao;
drop index if exists public.uq_equip_medicoes_saida_tipo;
create unique index uq_equip_medicoes_saida on public.equipamento_medicoes (combustivel_saida_id) where combustivel_saida_id is not null;
alter table public.equipamento_medicoes drop column reinicia_contagem;

create or replace function public.fn_comb_trg_medicao()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_controle text;
begin
  if public.fn_comb_em_carga() then return null; end if;
  if tg_op = 'DELETE' then return null; end if;
  if new.excluido_em is not null or new.medicao is null or new.equipamento_id is null then
    update public.equipamento_medicoes set excluido_em = coalesce(excluido_em, now())
     where combustivel_saida_id = new.id and excluido_em is null;
    return null;
  end if;
  select controle_por into v_controle from public.equipamentos where id = new.equipamento_id;
  if v_controle not in ('horimetro', 'km') then return null; end if;
  insert into public.equipamento_medicoes (equipamento_id, data, tipo, valor, origem, combustivel_saida_id, observacoes, created_by)
  values (new.equipamento_id, (new.data at time zone 'America/Rio_Branco')::date, coalesce(new.tipo_medicao, v_controle),
          new.medicao, 'abastecimento', new.id, 'Lançada no abastecimento', new.created_by)
  on conflict (combustivel_saida_id) where combustivel_saida_id is not null do update
    set equipamento_id = excluded.equipamento_id, data = excluded.data, tipo = excluded.tipo, valor = excluded.valor, excluido_em = null;
  return null;
end $function$;
drop trigger if exists trg_comb_saidas_medicao on public.combustivel_saidas;
create trigger trg_comb_saidas_medicao
  after insert or update of medicao, tipo_medicao, equipamento_id, data, excluido_em
  on public.combustivel_saidas for each row execute function public.fn_comb_trg_medicao();

-- 4. RPC de gravação e atribuição em lote como estavam.
create or replace function public.fn_comb_salvar_saida(p_id uuid, p_dados jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid; v_origem text := p_dados ->> 'origem'; v_tipo text := p_dados ->> 'tipo_consumidor';
  v_tanque uuid := nullif(p_dados ->> 'tanque_id', '')::uuid; v_litros numeric := (p_dados ->> 'litros')::numeric;
  v_taxa numeric; v_preco numeric := (p_dados ->> 'preco_combustivel')::numeric;
  v_preco_dono numeric := (p_dados ->> 'preco_proprietario')::numeric; v_manual numeric := (p_dados ->> 'preco_unitario')::numeric;
  v_snapshot numeric := (p_dados ->> 'preco_medio_tanque')::numeric; v_externo boolean;
  v_insumo uuid; v_unit numeric; v_aloc jsonb := coalesce(p_dados -> 'alocacoes', '[]'::jsonb);
begin
  if p_id is null and not public.tem_permissao('combustivel.saidas', 'criar') then raise exception 'Sem permissão para lançar abastecimento'; end if;
  if p_id is not null and not public.tem_permissao('combustivel.saidas', 'editar') then raise exception 'Sem permissão para editar abastecimento'; end if;
  if v_litros is null or v_litros <= 0 then raise exception 'Informe os litros'; end if;
  if v_origem = 'tanque' and v_tanque is null then raise exception 'Escolha o tanque'; end if;
  if jsonb_array_length(v_aloc) = 0 then raise exception 'Informe a obra e a etapa do abastecimento'; end if;
  v_externo := v_tanque is not null and public.fn_comb_tanque_externo(v_tanque);
  v_taxa := case when v_tipo = 'carreta_transportadora' then coalesce((p_dados ->> 'taxa_litro')::numeric, 0) else 0 end;
  if v_taxa < 0 then raise exception 'Taxa inválida'; end if;

  if v_tipo = 'carreta_transportadora' and v_origem = 'tanque' then
    if v_preco is null or v_preco <= 0 then raise exception 'Informe o preço do combustível'; end if;
    v_unit := v_preco + v_taxa;
  elsif v_origem = 'tanque' then
    v_unit := coalesce(v_snapshot, 0) + v_taxa;
    v_preco := coalesce(v_snapshot, 0);
  else
    if v_manual is null or v_manual <= 0 then raise exception 'Informe o preço por litro'; end if;
    v_unit := v_manual;
    if v_tipo <> 'carreta_transportadora' then v_preco := v_manual; end if;
  end if;
  if not v_externo then v_preco_dono := null; end if;

  v_insumo := coalesce(nullif(p_dados ->> 'insumo_id', '')::uuid,
                       case when v_tanque is not null then (select combustivel_atual_id from public.tanques where id = v_tanque) end);
  if v_insumo is null then raise exception 'Informe o combustível'; end if;

  if p_id is null then
    insert into public.combustivel_saidas (origem, tipo_consumidor, tanque_id, equipamento_id, transportadora_id, placa, motorista, insumo_id,
      litros, preco_combustivel, preco_proprietario, taxa_litro, preco_unitario, preco_medio_tanque, valor_total, pago, pago_em, medicao,
      tipo_medicao, data, canal, observacoes, created_by)
    values (v_origem, v_tipo, case when v_origem = 'tanque' then v_tanque end,
      case when v_tipo = 'equipamento_proprio' then nullif(p_dados ->> 'equipamento_id', '')::uuid end,
      case when v_tipo = 'carreta_transportadora' then nullif(p_dados ->> 'transportadora_id', '')::uuid end,
      case when v_tipo = 'carreta_transportadora' then nullif(btrim(p_dados ->> 'placa'), '') end,
      nullif(btrim(p_dados ->> 'motorista'), ''), v_insumo, v_litros, v_preco, v_preco_dono, v_taxa, v_unit,
      case when v_origem = 'tanque' then v_snapshot end, v_litros * v_unit,
      case when v_origem = 'requisicao' then coalesce((p_dados ->> 'pago')::boolean, false) else false end,
      case when v_origem = 'requisicao' then nullif(p_dados ->> 'pago_em', '')::date end,
      case when v_tipo = 'equipamento_proprio' then (p_dados ->> 'medicao')::numeric end,
      case when v_tipo = 'equipamento_proprio' and p_dados ->> 'medicao' is not null then nullif(p_dados ->> 'tipo_medicao', '') end,
      (p_dados ->> 'data')::timestamptz, coalesce(nullif(p_dados ->> 'canal', ''), 'computador'),
      nullif(btrim(p_dados ->> 'observacoes'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.combustivel_saidas set origem = v_origem, tipo_consumidor = v_tipo,
      tanque_id = case when v_origem = 'tanque' then v_tanque end,
      equipamento_id = case when v_tipo = 'equipamento_proprio' then nullif(p_dados ->> 'equipamento_id', '')::uuid end,
      transportadora_id = case when v_tipo = 'carreta_transportadora' then nullif(p_dados ->> 'transportadora_id', '')::uuid end,
      placa = case when v_tipo = 'carreta_transportadora' then nullif(btrim(p_dados ->> 'placa'), '') end,
      motorista = nullif(btrim(p_dados ->> 'motorista'), ''), insumo_id = v_insumo, litros = v_litros,
      preco_combustivel = v_preco, preco_proprietario = v_preco_dono, taxa_litro = v_taxa, preco_unitario = v_unit,
      preco_medio_tanque = case when v_origem = 'tanque' then v_snapshot end, valor_total = v_litros * v_unit,
      pago = case when v_origem = 'requisicao' then coalesce((p_dados ->> 'pago')::boolean, false) else false end,
      pago_em = case when v_origem = 'requisicao' then nullif(p_dados ->> 'pago_em', '')::date end,
      medicao = case when v_tipo = 'equipamento_proprio' then (p_dados ->> 'medicao')::numeric end,
      tipo_medicao = case when v_tipo = 'equipamento_proprio' and p_dados ->> 'medicao' is not null then nullif(p_dados ->> 'tipo_medicao', '') end,
      data = (p_dados ->> 'data')::timestamptz, observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
     where id = p_id and excluido_em is null;
    if not found then raise exception 'Abastecimento não encontrado'; end if;
    v_id := p_id;
  end if;

  delete from public.abastecimento_alocacoes where saida_id = v_id;
  insert into public.abastecimento_alocacoes (saida_id, centro_custo_id, percentual, litros, etapa_legado)
  select v_id, (a ->> 'centro_custo_id')::uuid, (a ->> 'percentual')::numeric, v_litros * (a ->> 'percentual')::numeric / 100, a ->> 'etapa_legado'
    from jsonb_array_elements(v_aloc) a;
  if (select sum(percentual) from public.abastecimento_alocacoes where saida_id = v_id) <> 100 then
    raise exception 'As alocações precisam somar 100%%';
  end if;
  return v_id;
end $function$;

drop function if exists public.fn_comb_atribuir_equipamento(uuid[], uuid, jsonb);
create or replace function public.fn_comb_atribuir_equipamento(p_saidas uuid[], p_equipamento uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_n int;
begin
  if not public.tem_permissao('combustivel.anomalias', 'editar') then raise exception 'Sem permissão para corrigir anomalias'; end if;
  if p_equipamento is null then raise exception 'Escolha o equipamento'; end if;
  update public.combustivel_saidas set equipamento_id = p_equipamento
   where id = any (p_saidas) and tipo_consumidor = 'equipamento_proprio' and excluido_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;
revoke all on function public.fn_comb_atribuir_equipamento(uuid[], uuid) from public, anon;
grant execute on function public.fn_comb_atribuir_equipamento(uuid[], uuid) to authenticated;

-- 5. Colunas.
drop index if exists public.idx_comb_saidas_placa_norm;
alter table public.combustivel_saidas
  drop constraint if exists combustivel_saidas_virada_tem_motivo,
  drop constraint if exists combustivel_saidas_virada_tem_leitura,
  drop column odometro_km, drop column horimetro_h, drop column virada, drop column motivo_virada;
alter table public.equipamentos drop column classe_consumo;
drop function if exists public.fn_comb_placa_norm(text);

-- O backup (legado.bkp_odometro_20261127) fica: é a trilha do que foi desfeito.
commit;
