-- Combustível na data sem contar o próprio movimento.
--
-- O gatilho da transferência recalcula o combustível em TODO update
-- (`fn_comb_combustivel_na_data(origem, data)`). A conta de estoque dessa função
-- incluía a própria transferência: quando ela leva o tanque de origem inteiro,
-- o estoque na data dá zero e a função devolve null. Resultado (30/10/2026,
-- Patio Colorado > Meloza Colorado 2, 2.747 L de Diesel S10): editar só o valor
-- apagou o combustível da transferência, e o destino ficou com 2.747 L "sem
-- combustível", sem saída possível.
--
-- Correção: a função ganha `p_excluir` (o mesmo de `fn_comb_estoque_na_data`) e
-- os gatilhos de transferência e de saída passam o id da linha. A assinatura
-- muda, então a de 2 argumentos sai (os dois conviveriam e a chamada com 2
-- argumentos ficaria ambígua).

drop function if exists public.fn_comb_combustivel_na_data(uuid, timestamptz);

create or replace function public.fn_comb_combustivel_na_data(p_tanque uuid, p_data timestamptz, p_excluir uuid default null)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v_ult_esv timestamptz; v_tipo uuid;
begin
  if public.fn_comb_estoque_na_data(p_tanque, p_data, p_excluir) <= 0 then return null; end if;
  select max(data_hora) into v_ult_esv from public.combustivel_esvaziamentos
   where tanque_id = p_tanque and excluido_em is null and data_hora <= p_data and id is distinct from p_excluir;
  select insumo_id into v_tipo from public.combustivel_entradas
   where tanque_id = p_tanque and excluido_em is null and data_hora <= p_data
     and (v_ult_esv is null or data_hora >= v_ult_esv) and id is distinct from p_excluir
   order by data_hora desc, created_at desc limit 1;
  if v_tipo is null then
    select insumo_id into v_tipo from public.combustivel_transferencias
     where tanque_destino_id = p_tanque and excluido_em is null and data_hora <= p_data and insumo_id is not null
       and id is distinct from p_excluir
     order by data_hora desc, created_at desc limit 1;
  end if;
  return v_tipo;
end $$;

revoke all on function public.fn_comb_combustivel_na_data(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.fn_comb_combustivel_na_data(uuid, timestamptz, uuid) to authenticated;

create or replace function public.fn_comb_trg_transferencia_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_origem record; v_destino record; v_delta numeric;
begin
  if public.fn_comb_em_carga() then return new; end if;
  if tg_op = 'UPDATE' then
    if old.excluido_em is null and (new.excluido_em is not null or new.tanque_origem_id is distinct from old.tanque_origem_id
       or new.tanque_destino_id is distinct from old.tanque_destino_id or new.litros is distinct from old.litros
       or new.data_hora is distinct from old.data_hora or new.insumo_id is distinct from old.insumo_id) then
      perform public.fn_comb_exigir_ciclo_aberto(old.tanque_origem_id, old.data_hora);
      perform public.fn_comb_exigir_ciclo_aberto(old.tanque_destino_id, old.data_hora);
    end if;
    if new.excluido_em is not null then return new; end if;
  end if;
  perform public.fn_comb_exigir_data_valida(new.data_hora);
  select * into v_origem from public.tanques where id = new.tanque_origem_id;
  select * into v_destino from public.tanques where id = new.tanque_destino_id;
  if v_origem.eh_externo or v_destino.eh_externo then raise exception 'Transferência não envolve tanque externo'; end if;
  -- Sem a própria linha: na edição ela já está no banco e tiraria os litros dela da origem.
  new.insumo_id := public.fn_comb_combustivel_na_data(new.tanque_origem_id, new.data_hora, new.id);
  if v_origem.combustivel_atual_id is null then raise exception 'O tanque de origem está vazio'; end if;
  if v_destino.combustivel_atual_id is not null and v_destino.nivel_atual_litros > 0
     and v_destino.combustivel_atual_id <> v_origem.combustivel_atual_id then
    raise exception 'O tanque de destino tem outro combustível';
  end if;
  v_delta := new.litros - case when tg_op = 'UPDATE' and old.tanque_destino_id = new.tanque_destino_id and old.excluido_em is null then old.litros else 0 end;
  if v_destino.capacidade_litros > 0 and v_destino.nivel_atual_litros + v_delta > v_destino.capacidade_litros then
    raise exception 'A transferência passa da capacidade do tanque de destino (% L)', v_destino.capacidade_litros;
  end if;
  return new;
end $$;

create or replace function public.fn_comb_trg_saida_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_estoque numeric;
begin
  if public.fn_comb_em_carga() then return new; end if;
  if tg_op = 'UPDATE' then
    if old.excluido_em is null and old.origem = 'tanque' and (new.excluido_em is not null or new.tanque_id is distinct from old.tanque_id
       or new.litros is distinct from old.litros or new.data is distinct from old.data) then
      perform public.fn_comb_exigir_ciclo_aberto(old.tanque_id, old.data);
    end if;
    if new.excluido_em is not null then return new; end if;
  end if;
  perform public.fn_comb_exigir_data_valida(new.data);
  if new.origem = 'tanque' and not public.fn_comb_tanque_externo(new.tanque_id) then
    new.insumo_id := coalesce(public.fn_comb_combustivel_na_data(new.tanque_id, new.data, new.id), new.insumo_id);
    if tg_op = 'INSERT' or new.litros is distinct from old.litros or new.data is distinct from old.data
       or new.tanque_id is distinct from old.tanque_id or new.origem is distinct from old.origem then
      v_estoque := public.fn_comb_estoque_na_data(new.tanque_id, new.data, new.id);
      if new.litros > v_estoque then
        raise exception 'Saldo insuficiente no tanque nessa data: % L disponíveis', round(v_estoque, 2);
      end if;
    end if;
  end if;
  -- Centro de custo do equipamento próprio: a etapa dele (alugado não tem; o custo vai na alocação).
  if new.tipo_consumidor = 'equipamento_proprio' then
    new.centro_custo_id := (select id from public.centros_custo where equipamento_id = new.equipamento_id limit 1);
  else
    new.centro_custo_id := null;
  end if;
  return new;
end $$;

-- Conserta o que o bug já apagou: transferência ativa sem combustível cuja
-- origem tinha combustível rastreável na data. A de 30/10 está em ciclo
-- fechado (a origem foi reabastecida às 17:33), e a trava de ciclo barra mudar
-- o insumo pelo gatilho. Não é movimento físico, é devolver o valor que estava
-- lá até o bug: grava em modo carga (gatilhos de regra calados, auditoria
-- grava) e refaz nível, PEPS e saldo dos tanques envolvidos à mão.
do $$
declare v_tanques uuid[];
begin
  perform set_config('app.carga_combustivel', '1', true);
  with corrigidas as (
    update public.combustivel_transferencias t
       set insumo_id = public.fn_comb_combustivel_na_data(t.tanque_origem_id, t.data_hora, t.id)
     where t.excluido_em is null
       and t.insumo_id is null
       and public.fn_comb_combustivel_na_data(t.tanque_origem_id, t.data_hora, t.id) is not null
    returning t.tanque_origem_id, t.tanque_destino_id
  )
  select array_agg(distinct x) into v_tanques
    from corrigidas, unnest(array[tanque_origem_id, tanque_destino_id]) x;
  perform set_config('app.carga_combustivel', '', true);

  perform public.fn_comb_recalcular_nivel(t) from unnest(coalesce(v_tanques, '{}')) t;
  perform public.fn_comb_recalcular_peps(t) from unnest(coalesce(v_tanques, '{}')) t;
  perform public.fn_comb_exigir_saldo(t) from unnest(coalesce(v_tanques, '{}')) t;
end $$;

-- Trava fail-closed: grant certo na função nova e nada consertável sobrando.
do $$
declare f constant text := 'public.fn_comb_combustivel_na_data(uuid, timestamptz, uuid)';
begin
  if has_function_privilege('anon', f, 'execute') then raise exception 'anon executa %', f; end if;
  if not has_function_privilege('authenticated', f, 'execute') then raise exception 'authenticated não executa %', f; end if;
  if exists (select 1 from public.combustivel_transferencias t
              where t.excluido_em is null and t.insumo_id is null
                and public.fn_comb_combustivel_na_data(t.tanque_origem_id, t.data_hora, t.id) is not null) then
    raise exception 'Sobrou transferência sem combustível';
  end if;
end $$;
