-- Mapa v1.28 (17/10/2026): mudar o estado da máquina com data efetiva.
--
-- Pedido do Tiago: "quando eu altero o status de um equipamento eu posso escolher a data em que
-- aquele status entra em vigor". Até a v1.27 só a transferência tinha data; o estado valia sempre
-- a partir de agora.
--
-- 1. fn_mapa_marcar_estado_na_data: a fn_mapa_marcar_estado com p_data. A data não pode ser
--    depois de hoje nem antes do dia em que a máquina entrou no estado atual (os dias entre um e
--    outro ficariam com dois estados). estado_desde, conserto_entrada e a data_efetiva da
--    movimentação seguem a data escolhida.
--    Função nova e não parâmetro novo na antiga: um sétimo parâmetro com default deixaria a
--    chamada de seis argumentos ambígua entre as duas, e trocar a assinatura pede DROP.
-- 2. fn_mapa_marcar_estado (cliente antigo) passa a chamar a nova com a data de hoje.
-- 3. fn_equip_dias_refazer: data no passado refaz os dias já fechados da máquina em
--    equipamento_dias_centro, de p_de até ontem, com o estado efetivo novo. O desenho de 16/10
--    (docs/superpowers/specs/2026-10-16-equipamento-dias-por-centro-design.md) manda a correção
--    seguir a data efetiva e deixa reescrever qualquer mês enquanto não houver rateio em reais.
--    Obra de cada dia: a gravada no próprio dia; dia sem linha (a máquina estava fora de
--    funcionamento) usa a obra de agora. Implemento acoplado segue a hospedeira.
--    Devolve as linhas que substituiu; a movimentação as guarda em de->'dias_fechados'.
-- 4. fn_mapa_desfazer_movimentacao: desfazer um estado retroativo devolve essas linhas como
--    eram. Recalcular com o estado que voltou não serve: o dia que era sem_posicao voltaria
--    como operando sem obra.

-- 3. Refazer os dias fechados --------------------------------------------------------------
create or replace function public.fn_equip_dias_refazer(p_id uuid, p_de date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ontem date := (now() at time zone 'America/Rio_Branco')::date - 1;
  v_inicio date;
  v_estado text;
  v_obra uuid;
  v_varios boolean;
  v_carreta boolean;
  v_antes jsonb;
begin
  select min(d.dia) into v_inicio from public.equipamento_dias_centro d;
  v_inicio := greatest(p_de, v_inicio);
  if v_inicio is null or v_inicio > v_ontem then return null; end if;

  select v.estado_efetivo, v.obra_id, coalesce(m.varios_centros, false)
    into v_estado, v_obra, v_varios
  from public.v_mapa_equipamentos v
  left join public.mapa_equipamentos m on m.equipamento_id = v.equipamento_id
  where v.equipamento_id = p_id;
  if not found then return null; end if;
  v_carreta := public.fn_mapa_carreta_emt(p_id);

  select coalesce(jsonb_agg(to_jsonb(d) order by d.dia, d.equipamento_id), '[]'::jsonb) into v_antes
  from public.equipamento_dias_centro d
  where d.dia between v_inicio and v_ontem
    and (d.equipamento_id = p_id or d.acoplado_em = p_id);

  create temp table if not exists pg_temp.tmp_equip_dias_refazer (
    dia date, implemento uuid, obra_id uuid, tinha boolean
  ) on commit drop;
  truncate pg_temp.tmp_equip_dias_refazer;

  -- O que havia: a obra da máquina em cada dia e os implementos acoplados nela.
  insert into pg_temp.tmp_equip_dias_refazer (dia, implemento, obra_id, tinha)
  select g.dia, null, coalesce(d.obra_id, case when d.dia is null then v_obra end), d.dia is not null
  from (select x::date as dia from generate_series(v_inicio, v_ontem, interval '1 day') x) g
  left join public.equipamento_dias_centro d on d.dia = g.dia and d.equipamento_id = p_id;
  insert into pg_temp.tmp_equip_dias_refazer (dia, implemento, tinha)
  select d.dia, d.equipamento_id, true
  from public.equipamento_dias_centro d
  where d.acoplado_em = p_id and d.dia between v_inicio and v_ontem;
  -- Dia sem linha da máquina: os implementos acoplados agora.
  insert into pg_temp.tmp_equip_dias_refazer (dia, implemento, tinha)
  select t.dia, i.id, false
  from pg_temp.tmp_equip_dias_refazer t
  join public.equipamentos i on i.acoplado_em = p_id and i.ativo and i.tipo = 'Implementos'
  where t.implemento is null and not t.tinha;

  delete from public.equipamento_dias_centro d
  where d.dia between v_inicio and v_ontem
    and (d.equipamento_id = p_id or d.acoplado_em = p_id);

  insert into public.equipamento_dias_centro (dia, equipamento_id, centro_custo_id, motivo, estado, obra_id)
  select t.dia, p_id, r.centro_custo_id, r.motivo, v_estado, t.obra_id
  from pg_temp.tmp_equip_dias_refazer t
  cross join lateral public.fn_equip_centro_regra(v_estado, t.obra_id, v_varios, v_carreta) r
  where t.implemento is null;

  insert into public.equipamento_dias_centro (dia, equipamento_id, centro_custo_id, motivo, estado, obra_id, acoplado_em)
  select distinct on (t.dia, t.implemento) t.dia, t.implemento, h.centro_custo_id, 'acoplado', h.estado, h.obra_id, p_id
  from pg_temp.tmp_equip_dias_refazer t
  join public.equipamento_dias_centro h on h.dia = t.dia and h.equipamento_id = p_id
  where t.implemento is not null
    and not exists (select 1 from public.equipamento_dias_centro x
                    where x.dia = t.dia and x.equipamento_id = t.implemento)
  order by t.dia, t.implemento;

  return jsonb_build_object('de', v_inicio, 'ate', v_ontem, 'linhas', v_antes);
end $function$;

revoke all on function public.fn_equip_dias_refazer(uuid, date) from public, anon, authenticated;

comment on function public.fn_equip_dias_refazer(uuid, date) is
  'Refaz os dias fechados (p_de até ontem) de uma máquina e dos implementos acoplados com o estado efetivo de agora e devolve {de, ate, linhas} com as linhas substituídas. Chamada pela mudança de estado com data passada.';

-- 1. Estado com data -----------------------------------------------------------------------
create or replace function public.fn_mapa_marcar_estado_na_data(
  p_id uuid, p_estado text, p_motivo text, p_data date,
  p_descricao text default null, p_deslocamento jsonb default null, p_previsao date default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_antes jsonb;
  v_bloqueio text;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_data date := coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date);
  v_desde_dia date;
  v_estado_antes text;
  v_muda boolean;
  v_dias jsonb;
begin
  perform public.fn_mapa_exigir('editar');
  if p_estado not in ('operando','parado','em_rota','quebrado_obra','esperando_conserto','conserto','fora_funcionamento') then
    raise exception 'Estado inválido: %', p_estado;
  end if;
  if v_data > v_hoje then
    raise exception 'A data efetiva não pode ser depois de hoje';
  end if;
  v_bloqueio := public.fn_mapa_motivo_fora_do_mapa(p_id);
  if v_bloqueio is not null then raise exception '%', v_bloqueio; end if;
  select to_jsonb(m) into v_antes from public.mapa_equipamentos m where m.equipamento_id = p_id;
  if v_antes is null then
    insert into public.mapa_equipamentos (equipamento_id) values (p_id);
    v_antes := '{}'::jsonb;
  end if;
  v_estado_antes := v_antes->>'estado';
  v_muda := v_estado_antes is distinct from p_estado;
  -- Antes do dia em que entrou no estado atual, a máquina teria dois estados no mesmo dia. Vale
  -- também para remarcar o mesmo estado: a data não pode contar um passado que não houve.
  if v_data < v_hoje then
    v_desde_dia := ((v_antes->>'estado_desde')::timestamptz at time zone 'America/Rio_Branco')::date;
    if v_desde_dia is not null and v_data < v_desde_dia then
      raise exception 'A máquina está no estado atual desde %: a data efetiva não pode ser antes disso',
        to_char(v_desde_dia, 'DD/MM/YYYY');
    end if;
  end if;
  -- Fora de funcionamento pelo cadastro: sair dele pelo mapa reativa o cadastro.
  if p_estado <> 'fora_funcionamento'
     and exists (select 1 from public.equipamentos e where e.id = p_id and e.status = 'fora_funcionamento') then
    perform set_config('app.status_motivo', 'Voltou pelo Mapa: ' || coalesce(nullif(btrim(p_motivo), ''), p_estado), true);
    update public.equipamentos set status = 'ativa' where id = p_id;
    perform set_config('app.status_motivo', '', true);
    v_antes := v_antes || jsonb_build_object('estado', 'fora_funcionamento');
  end if;
  update public.mapa_equipamentos m set
    estado = p_estado,
    estado_desde = case
      when m.estado is not distinct from p_estado then m.estado_desde
      when v_data = v_hoje then now()
      else v_data::timestamp at time zone 'America/Rio_Branco'
    end,
    quebra_descricao = case when p_estado in ('quebrado_obra','esperando_conserto') then p_descricao end,
    deslocamento = case when p_estado = 'em_rota' then coalesce(p_deslocamento, m.deslocamento) end,
    conserto_motivo   = case when p_estado = 'conserto' then coalesce(p_descricao, p_motivo) end,
    conserto_entrada  = case when p_estado = 'conserto' then coalesce(case when m.estado = 'conserto' then m.conserto_entrada end, v_data) end,
    conserto_previsao = case when p_estado = 'conserto' then coalesce(p_previsao, case when m.estado = 'conserto' then m.conserto_previsao end) end,
    updated_by = auth.uid()
  where m.equipamento_id = p_id;
  if v_muda and v_data < v_hoje then
    v_dias := public.fn_equip_dias_refazer(p_id, v_data);
  end if;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
  values ('estado', 'equipamento', p_id,
          jsonb_build_object('estado', v_antes->'estado')
            || case when v_dias is not null then jsonb_build_object('dias_fechados', v_dias) else '{}'::jsonb end,
          jsonb_build_object('estado', p_estado, 'descricao', p_descricao, 'previsao', p_previsao, 'deslocamento', p_deslocamento),
          p_motivo, v_data);
end $function$;

revoke all on function public.fn_mapa_marcar_estado_na_data(uuid, text, text, date, text, jsonb, date) from public, anon;
grant execute on function public.fn_mapa_marcar_estado_na_data(uuid, text, text, date, text, jsonb, date) to authenticated;

-- 2. O cliente antigo continua valendo "a partir de agora" --------------------------------
create or replace function public.fn_mapa_marcar_estado(p_id uuid, p_estado text, p_motivo text, p_descricao text DEFAULT NULL::text, p_deslocamento jsonb DEFAULT NULL::jsonb, p_previsao date DEFAULT NULL::date)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform public.fn_mapa_marcar_estado_na_data(
    p_id, p_estado, p_motivo, (now() at time zone 'America/Rio_Branco')::date,
    p_descricao, p_deslocamento, p_previsao);
end $function$;

-- 4. Desfazer estado retroativo refaz os dias ----------------------------------------------
-- Partindo da definição viva (v1.27); só o bloco do fim é novo.
CREATE OR REPLACE FUNCTION public.fn_mapa_desfazer_movimentacao(p_id bigint, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.mapa_movimentacoes;
  v_antes jsonb;
  v_depois jsonb;
  v_atual jsonb;
  v_campos text[];
  v_mudou text[];
  v_patch jsonb;
  v_cols text;
  v_ajuste_depois boolean;
begin
  perform public.fn_mapa_exigir('editar');
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo para desfazer a movimentação';
  end if;

  select * into r from public.mapa_movimentacoes m where m.id = p_id for update;
  if not found then raise exception 'Movimentação não encontrada'; end if;
  if r.desfeita_em is not null then raise exception 'Esta movimentação já foi desfeita'; end if;
  if r.alvo <> 'equipamento' or r.tipo not in ('transferencia', 'posicao', 'estado') then
    raise exception 'Só dá para desfazer transferência, posição e estado de máquina';
  end if;
  if exists (
    select 1 from public.mapa_movimentacoes m
    where m.alvo = r.alvo and m.alvo_id = r.alvo_id and m.desfeita_em is null
      and (m.criado_em, m.id) > (r.criado_em, r.id)
      and not (m.tipo = 'posicao' and m.para ? 'lng' and not m.para ? 'estado')
  ) then
    raise exception 'Só dá para desfazer a última movimentação da máquina: desfaça antes as mais novas';
  end if;

  -- O antes da primeira atualização e o depois da última, na transação da movimentação.
  select a.dados_antes into v_antes from public.audit_log a
  where a.tabela = 'mapa_equipamentos' and a.acao = 'UPDATE' and a.criado_em = r.criado_em
    and a.dados_antes->>'equipamento_id' = r.alvo_id::text
  order by a.id limit 1;
  select a.dados_depois into v_depois from public.audit_log a
  where a.tabela = 'mapa_equipamentos' and a.acao = 'UPDATE' and a.criado_em = r.criado_em
    and a.dados_depois->>'equipamento_id' = r.alvo_id::text
  order by a.id desc limit 1;
  if v_antes is null or v_depois is null then
    raise exception 'Não achei na auditoria como a máquina estava antes desta movimentação';
  end if;

  select array_agg(k order by k) into v_campos
  from jsonb_object_keys(v_depois) k
  where k not in ('id', 'equipamento_id', 'updated_at', 'updated_by')
    and (v_antes->k) is distinct from (v_depois->k);

  -- v1.27: ajustes de posição depois desta linha. Desfazer devolve o ponto de antes dela, então
  -- o que eles mexeram não é "mudança por outro caminho", e eles caem juntos.
  select exists (
    select 1 from public.mapa_movimentacoes m
    where m.alvo = r.alvo and m.alvo_id = r.alvo_id and m.desfeita_em is null
      and (m.criado_em, m.id) > (r.criado_em, r.id)
      and m.tipo = 'posicao' and m.para ? 'lng' and not m.para ? 'estado'
  ) into v_ajuste_depois;

  if v_campos is not null then
    select to_jsonb(m) into v_atual from public.mapa_equipamentos m where m.equipamento_id = r.alvo_id;
    select array_agg(k order by k) into v_mudou
    from unnest(v_campos) k
    where (v_atual->k) is distinct from (v_depois->k)
      and not (v_ajuste_depois and 'posicao' = any (v_campos)
               and k in ('posicao', 'trecho_id', 'area_id', 'localidade_id', 'km_atual'));
    if v_mudou is not null then
      raise exception 'A máquina mudou depois desta movimentação por outro caminho (%): desfazer apagaria essa mudança',
        array_to_string(v_mudou, ', ');
    end if;

    -- Colunas comuns pelo jsonb_populate_record; a posição (GeoJSON) à parte.
    select jsonb_object_agg(k, v_antes->k) into v_patch
    from unnest(v_campos) k where k <> 'posicao';
    if v_patch is not null then
      select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(v_patch) k;
      execute format(
        'update public.mapa_equipamentos m set (%1$s) = (select %1$s from jsonb_populate_record(null::public.mapa_equipamentos, $1)) where m.equipamento_id = $2',
        v_cols)
      using v_patch, r.alvo_id;
    end if;
    if 'posicao' = any (v_campos) then
      update public.mapa_equipamentos m set
        posicao = case
          when v_antes->'posicao' is null or jsonb_typeof(v_antes->'posicao') = 'null' then null
          else extensions.st_setsrid(extensions.st_geomfromgeojson((v_antes->'posicao')::text), 4326)
        end
      where m.equipamento_id = r.alvo_id;
    end if;
    update public.mapa_equipamentos m set updated_by = auth.uid() where m.equipamento_id = r.alvo_id;
  end if;

  -- v1.24: a volta de uma máquina fora de funcionamento pelo cadastro reativou o cadastro, que
  -- a auditoria de mapa_equipamentos não devolve; ela volta como fora marcado no mapa.
  if r.tipo = 'estado' and r.de->>'estado' = 'fora_funcionamento' then
    update public.mapa_equipamentos m set estado = 'fora_funcionamento', updated_by = auth.uid()
    where m.equipamento_id = r.alvo_id and m.estado is distinct from 'fora_funcionamento';
  end if;

  update public.mapa_movimentacoes m set
    desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo)
  where m.id = p_id;

  -- v1.27: o ponto voltou para antes desta linha; os ajustes posteriores caem com ela.
  if v_ajuste_depois and 'posicao' = any (coalesce(v_campos, '{}')) then
    update public.mapa_movimentacoes m set
      desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo)
    where m.alvo = r.alvo and m.alvo_id = r.alvo_id and m.desfeita_em is null
      and (m.criado_em, m.id) > (r.criado_em, r.id)
      and m.tipo = 'posicao' and m.para ? 'lng' and not m.para ? 'estado';
  end if;

  -- v1.28: estado com data passada refez os dias fechados; desfazer devolve as linhas de antes.
  if r.tipo = 'estado' and r.de ? 'dias_fechados' then
    delete from public.equipamento_dias_centro d
    where d.dia between (r.de #>> '{dias_fechados,de}')::date and (r.de #>> '{dias_fechados,ate}')::date
      and (d.equipamento_id = r.alvo_id or d.acoplado_em = r.alvo_id);
    insert into public.equipamento_dias_centro
    select * from jsonb_populate_recordset(null::public.equipamento_dias_centro, r.de #> '{dias_fechados,linhas}')
    on conflict (dia, equipamento_id) do nothing;
  end if;
end
$function$;
