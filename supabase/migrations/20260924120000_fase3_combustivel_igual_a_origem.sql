-- Fase 3: o Combustível do ERP exatamente igual ao Gestão Obras.
--
-- Tiago, 24/09/2026: "tudo do combustivel tem que ser exatamente igual no app gestao obras, so
-- mude o que for necessario, mas todos os calculos e regras devem continuar". A 20260924100000
-- tinha regras a mais e cálculos que a tela da origem faz de outro jeito. Esta volta cada um ao
-- que a origem grava (levantamento do código das telas e do banco vivo, 24/09):
--
-- 1. Valor da entrada e da transferência sem arredondar a 4 casas: a origem guarda até 12 casas
--    (5 entradas passam de 4), e o preço da camada do PEPS é valor / litros.
-- 2. Entrada: a pessoa digita o preço por litro; total = quantidade x preço, exato. Fornecedor
--    obrigatório (a tela da origem exige).
-- 3. Transferência: valor = litros x preço médio de TODAS as entradas e transferências recebidas
--    da origem (sem corte de data), arredondado a 4 casas, só na criação; na edição fica o valor.
--    Continua a trava da tela da origem: não passa do espaço livre do destino NA DATA.
-- 4. Esvaziamento: litros = o nível atual e data = agora, como a tela da origem. Sem as travas
--    que eu tinha acrescentado (ciclo, saldo, tanque externo): a origem não tem nenhuma.
-- 5. Data no futuro: a origem compara o relógio de Rio Branco com São Paulo + 24 h, o que é
--    "mais de 26 h à frente" em tempo real.
-- 6. Movimento de valor zero volta a ser erro (na origem o CHECK valor > 0 barra a saída).
-- 7. Abastecimento: a regra de preço e de campos da tela da origem vai para a RPC. Carreta em
--    tanque pede o preço (a tela sugere o PEPS do TS da origem, ver src); a obra (alocação) é
--    sempre obrigatória; taxa só na carreta; nada de recusar tanque externo para equipamento
--    próprio no banco (na origem quem esconde é a tela).
-- 8. Atribuir equipamento em lote às saídas do "equipamento desconhecido" e restaurar excluído:
--    duas ações da origem que faltavam.

alter table public.combustivel_entradas alter column valor_total type numeric;
alter table public.combustivel_transferencias alter column valor_total type numeric;

create or replace function public.fn_comb_exigir_data_valida(p_quando timestamptz)
returns void language plpgsql stable set search_path to '' as $$
begin
  if p_quando is null then raise exception 'Informe a data'; end if;
  -- A origem: relógio de Rio Branco > (agora em São Paulo) + 24 h. Rio Branco é UTC-5 e São
  -- Paulo UTC-3, então é o instante passar de agora + 26 h.
  if p_quando > now() + interval '26 hours' then raise exception 'Data no futuro'; end if;
end $$;

create or replace function public.fn_comb_trg_esvaziamento_antes()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if public.fn_comb_em_carga() then return new; end if;
  -- A origem só confere a data (anti-futuro). Sem trava de ciclo, de saldo ou de tanque externo.
  if tg_op = 'INSERT' then perform public.fn_comb_exigir_data_valida(new.data_hora); end if;
  return new;
end $$;

create or replace function public.fn_comb_trg_recalcular()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_tanques uuid[];
begin
  if public.fn_comb_em_carga() or coalesce(current_setting('app.peps_recalculando', true), '') = '1' then return null; end if;
  -- IF e não CASE: o PL/pgSQL resolve o campo do registro ao executar, e a entrada não tem
  -- tanque_origem_id.
  if tg_table_name = 'combustivel_transferencias' then
    if tg_op <> 'INSERT' then v_tanques := array[old.tanque_origem_id, old.tanque_destino_id]; end if;
    if tg_op <> 'DELETE' then v_tanques := coalesce(v_tanques, '{}') || array[new.tanque_origem_id, new.tanque_destino_id]; end if;
  else
    if tg_op <> 'INSERT' then v_tanques := array[old.tanque_id]; end if;
    if tg_op <> 'DELETE' then v_tanques := coalesce(v_tanques, '{}') || array[new.tanque_id]; end if;
  end if;
  perform public.fn_comb_recalcular_nivel(t) from (select distinct unnest(v_tanques) t) x where t is not null;
  -- Esvaziamento na origem só recalcula o nível: nem PEPS, nem trava de saldo.
  if tg_table_name <> 'combustivel_esvaziamentos' then
    perform public.fn_comb_recalcular_peps(t) from (select distinct unnest(v_tanques) t) x where t is not null;
    perform public.fn_comb_exigir_saldo(t) from (select distinct unnest(v_tanques) t) x where t is not null;
  end if;
  return null;
end $$;

-- Movimento de valor zero é erro, como na origem (o CHECK valor > 0 barra a saída inteira).
create or replace function public.fn_comb_gerar_movimentos(p_saida uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare s record; v_dono uuid; v_tanque text;
begin
  delete from public.transportadora_movimentos where origem_tabela = 'combustivel_saidas' and origem_id = p_saida;
  select * into s from public.combustivel_saidas where id = p_saida;
  if s.id is null or s.excluido_em is not null or s.tipo_consumidor <> 'carreta_transportadora'
     or s.transportadora_id is null or s.tanque_id is null then
    return;
  end if;
  select proprietario_id, nome into v_dono, v_tanque from public.tanques where id = s.tanque_id;
  if v_dono is not null then
    insert into public.transportadora_movimentos (transportadora_id, data, tipo, valor, origem_tabela, origem_id, descricao, mes_referencia)
    values (v_dono, s.data, 'credito_abastecimento_transterra',
            s.litros * (coalesce(s.preco_proprietario, s.preco_combustivel, 0) + coalesce(s.taxa_litro, 0)),
            'combustivel_saidas', s.id, 'Abastecimento de carreta no tanque ' || v_tanque,
            date_trunc('month', s.data at time zone 'America/Rio_Branco')::date);
    insert into public.transportadora_movimentos (transportadora_id, data, tipo, valor, origem_tabela, origem_id, descricao, mes_referencia)
    values (s.transportadora_id, s.data, 'debito_abastecimento_transterra', s.valor_total, 'combustivel_saidas', s.id,
            'Abastecimento no tanque ' || v_tanque || ' (' || coalesce((select razao_social from public.fornecedores where id = v_dono), '?') || ')',
            date_trunc('month', s.data at time zone 'America/Rio_Branco')::date);
  else
    insert into public.transportadora_movimentos (transportadora_id, data, tipo, valor, origem_tabela, origem_id, descricao, mes_referencia)
    values (s.transportadora_id, s.data, 'debito_abastecimento_emt', s.valor_total, 'combustivel_saidas', s.id,
            'Abastecimento no tanque EMT ' || v_tanque, date_trunc('month', s.data at time zone 'America/Rio_Branco')::date);
  end if;
end $$;

-- ---------------------------------------------------------------- entrada
drop function if exists public.fn_comb_salvar_entrada(uuid, uuid, uuid, numeric, numeric, uuid, text, timestamptz, text);
create or replace function public.fn_comb_salvar_entrada(p_id uuid, p_tanque uuid, p_insumo uuid, p_quantidade numeric,
  p_valor_unitario numeric, p_fornecedor uuid, p_nota_fiscal text, p_data_hora timestamptz, p_observacoes text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  if p_id is null and not public.tem_permissao('combustivel.entradas', 'criar') then raise exception 'Sem permissão para lançar entrada'; end if;
  if p_id is not null and not public.tem_permissao('combustivel.entradas', 'editar') then raise exception 'Sem permissão para editar entrada'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade'; end if;
  if p_valor_unitario is null or p_valor_unitario <= 0 then raise exception 'Informe o preço por litro'; end if;
  if p_fornecedor is null then raise exception 'Informe o fornecedor'; end if;
  if p_insumo is null then raise exception 'Informe o combustível'; end if;
  if p_id is null then
    insert into public.combustivel_entradas (tanque_id, insumo_id, quantidade, litros, valor_total, fornecedor_id, nota_fiscal, data_hora, observacoes, created_by)
    values (p_tanque, p_insumo, p_quantidade, public.fn_comb_litros_da_entrada(p_insumo, p_quantidade), p_quantidade * p_valor_unitario,
            p_fornecedor, nullif(btrim(p_nota_fiscal), ''), p_data_hora, nullif(btrim(p_observacoes), ''), (select auth.uid()))
    returning id into v_id;
    return v_id;
  end if;
  update public.combustivel_entradas set tanque_id = p_tanque, insumo_id = p_insumo, quantidade = p_quantidade,
         litros = public.fn_comb_litros_da_entrada(p_insumo, p_quantidade), valor_total = p_quantidade * p_valor_unitario,
         fornecedor_id = p_fornecedor, nota_fiscal = nullif(btrim(p_nota_fiscal), ''), data_hora = p_data_hora,
         observacoes = nullif(btrim(p_observacoes), '')
   where id = p_id and excluido_em is null;
  if not found then raise exception 'Entrada não encontrada'; end if;
  return p_id;
end $$;

-- ---------------------------------------------------------------- transferência
drop function if exists public.fn_comb_salvar_transferencia(uuid, uuid, uuid, numeric, timestamptz, text);

-- Preço médio da vida inteira do tanque (todas as entradas e transferências recebidas, sem corte
-- de data), igual a calcularPrecoMedioTanque da origem.
create or replace function public.fn_comb_preco_medio_tanque(p_tanque uuid)
returns numeric language sql stable security invoker set search_path to '' as $$
  select coalesce(sum(v) / nullif(sum(l), 0), 0) from (
    select valor_total v, litros l from public.combustivel_entradas where tanque_id = p_tanque and excluido_em is null
    union all select valor_total, litros from public.combustivel_transferencias where tanque_destino_id = p_tanque and excluido_em is null) x;
$$;

create or replace function public.fn_comb_salvar_transferencia(p_id uuid, p_origem uuid, p_destino uuid, p_litros numeric,
  p_data_hora timestamptz, p_observacoes text, p_valor_total numeric default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_valor numeric; v_cap numeric;
begin
  if p_id is null and not public.tem_permissao('combustivel.transferencias', 'criar') then raise exception 'Sem permissão para lançar transferência'; end if;
  if p_id is not null and not public.tem_permissao('combustivel.transferencias', 'editar') then raise exception 'Sem permissão para editar transferência'; end if;
  if p_litros is null or p_litros <= 0 then raise exception 'Informe os litros'; end if;
  if p_origem = p_destino then raise exception 'Origem e destino precisam ser tanques diferentes'; end if;
  if p_valor_total is not null and p_valor_total < 0 then raise exception 'Valor inválido'; end if;
  -- Trava da tela da origem: não passa do espaço livre do destino NA DATA.
  select capacidade_litros into v_cap from public.tanques where id = p_destino;
  if v_cap > 0 and p_litros > v_cap - public.fn_comb_estoque_na_data(p_destino, p_data_hora, p_id) then
    raise exception 'Não cabe no tanque de destino nessa data: % L livres',
      round(v_cap - public.fn_comb_estoque_na_data(p_destino, p_data_hora, p_id), 2);
  end if;
  if p_id is null then
    v_valor := coalesce(p_valor_total, round(p_litros * public.fn_comb_preco_medio_tanque(p_origem), 4));
    insert into public.combustivel_transferencias (tanque_origem_id, tanque_destino_id, litros, valor_total, data_hora, observacoes, created_by)
    values (p_origem, p_destino, p_litros, v_valor, p_data_hora, nullif(btrim(p_observacoes), ''), (select auth.uid()))
    returning id into v_id;
    return v_id;
  end if;
  -- Na edição o valor fica como estava, a não ser que venha um valor novo (a tela da origem não recalcula).
  update public.combustivel_transferencias set tanque_origem_id = p_origem, tanque_destino_id = p_destino, litros = p_litros,
         valor_total = coalesce(p_valor_total, valor_total), data_hora = p_data_hora, observacoes = nullif(btrim(p_observacoes), '')
   where id = p_id and excluido_em is null;
  if not found then raise exception 'Transferência não encontrada'; end if;
  return p_id;
end $$;

-- ---------------------------------------------------------------- esvaziamento
drop function if exists public.fn_comb_registrar_esvaziamento(uuid, numeric, text, timestamptz);
create or replace function public.fn_comb_registrar_esvaziamento(p_tanque uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_nivel numeric;
begin
  if not public.tem_permissao('combustivel.esvaziamentos', 'criar') then raise exception 'Sem permissão para esvaziar tanque'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Informe o motivo (pelo menos 3 letras)'; end if;
  -- Como a tela da origem: descarta o nível inteiro, agora.
  select nivel_atual_litros into v_nivel from public.tanques where id = p_tanque;
  if coalesce(v_nivel, 0) <= 0 then raise exception 'O tanque já está vazio'; end if;
  insert into public.combustivel_esvaziamentos (tanque_id, litros, motivo, data_hora, created_by)
  values (p_tanque, v_nivel, btrim(p_motivo), now(), (select auth.uid())) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- abastecimento
-- A regra de preço e de campos da tela da origem (SaidaCombustivelForm, submit):
--   carreta + tanque:          preço = digitado (obrigatório, > 0); unitário = preço + taxa; total = litros x unitário
--   próprio + tanque:          preço = o PEPS que a tela manda; o banco regrava pelo PEPS dele (gatilho)
--   dinheiro ou requisição:    unitário = digitado (> 0); total = litros x unitário
--   taxa só entra na carreta; obra (alocação) sempre obrigatória; pago só na requisição.
create or replace function public.fn_comb_salvar_saida(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
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
end $$;

-- ---------------------------------------------------------------- ações que faltavam
-- Atribuir equipamento às saídas do "equipamento desconhecido" (AtribuirSentinelModal da origem,
-- permissão corrigir_anomalias_combustivel = combustivel.anomalias/editar). Só troca o equipamento.
create or replace function public.fn_comb_atribuir_equipamento(p_saidas uuid[], p_equipamento uuid)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_n int;
begin
  if not public.tem_permissao('combustivel.anomalias', 'editar') then raise exception 'Sem permissão para corrigir anomalias'; end if;
  if p_equipamento is null then raise exception 'Escolha o equipamento'; end if;
  update public.combustivel_saidas set equipamento_id = p_equipamento
   where id = any (p_saidas) and tipo_consumidor = 'equipamento_proprio' and excluido_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Restaurar o excluído (Lixeira da origem, restaurar_lixeira_combustivel): pede a lixeira e a
-- exclusão do recurso. Os gatilhos refazem nível, PEPS, saldo e conta corrente.
create or replace function public.fn_comb_restaurar(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text; v_n int;
begin
  v_recurso := case p_tabela when 'combustivel_entradas' then 'combustivel.entradas' when 'combustivel_saidas' then 'combustivel.saidas'
    when 'combustivel_transferencias' then 'combustivel.transferencias' when 'combustivel_esvaziamentos' then 'combustivel.esvaziamentos' end;
  if v_recurso is null then raise exception 'Tabela inválida'; end if;
  if not (public.tem_permissao('administracao.lixeira', 'editar') and public.tem_permissao(v_recurso, 'excluir')) then
    raise exception 'Sem permissão para restaurar';
  end if;
  execute format('update public.%I set excluido_em = null, excluido_por = null, motivo_exclusao = null where id = $1 and excluido_em is not null', p_tabela)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado ou não está excluído'; end if;
end $$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'fn_comb_salvar_entrada(uuid,uuid,uuid,numeric,numeric,uuid,text,timestamptz,text)',
    'fn_comb_salvar_transferencia(uuid,uuid,uuid,numeric,timestamptz,text,numeric)',
    'fn_comb_registrar_esvaziamento(uuid,text)', 'fn_comb_salvar_saida(uuid,jsonb)',
    'fn_comb_atribuir_equipamento(uuid[],uuid)', 'fn_comb_restaurar(text,uuid)', 'fn_comb_preco_medio_tanque(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $grants$;
