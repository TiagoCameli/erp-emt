-- Mapa v1.20: jazida é de uma obra (Tiago, 16/10/2026).
-- "As jazidas têm que ser atreladas a uma obra, podem mudar de uma obra para outra e também
-- podem ser inativadas depois. Se uma máquina estiver operando em uma jazida, ela está
-- trabalhando para a obra que aquela jazida está atrelada."
--
-- 1. Jazida ativa (local com o tipo jazida, ou área tipo jazida) sem obra é recusada. A
--    inativação passa sempre. A única jazida existente (sem obra) só é cobrada quando for
--    editada.
-- 2. Máquina ou pessoa gravada num local/área de jazida leva a obra da jazida (trigger: vale
--    para o arraste, o ajuste fino e qualquer RPC futura).
-- 3. A jazida que muda de obra leva junto quem está nela agora, com movimentação registrada.
--    O passado fica nas fotos diárias (mapa_snapshots), que já guardam a obra de cada dia.
-- 4. Ao soltar a máquina, a jazida ganha do trecho que passa perto (antes: trecho primeiro).
-- 5. fn_mapa_local_gravar: a fn_mapa_local_editar com obra e ativo. A antiga fica para a aba
--    que ainda estiver aberta com o cliente velho.
-- Partindo das definições vivas de 16/10 (fn_mapa_resolver_destino, fn_mapa_local_editar).

-- 1. Jazida exige obra -----------------------------------------------------------------
create or replace function public.fn_mapa_trg_jazida_exige_obra()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare v_jazida boolean;
begin
  if tg_table_name = 'localidades' then
    v_jazida := 'jazida' = any(coalesce(new.tipos, array[new.tipo]));
  else
    v_jazida := new.tipo = 'jazida';
  end if;
  if v_jazida and new.ativo and new.obra_id is null then
    raise exception 'Jazida "%" precisa estar atrelada a uma obra', new.nome
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

-- O nome ordena depois de trg_localidades_tipos, que normaliza `tipos` antes.
drop trigger if exists trg_localidades_tipos_z_jazida_obra on public.localidades;
create trigger trg_localidades_tipos_z_jazida_obra
  before insert or update on public.localidades
  for each row execute function public.fn_mapa_trg_jazida_exige_obra();

drop trigger if exists trg_mapa_areas_jazida_obra on public.mapa_areas;
create trigger trg_mapa_areas_jazida_obra
  before insert or update on public.mapa_areas
  for each row execute function public.fn_mapa_trg_jazida_exige_obra();

-- 2. Quem está na jazida trabalha para a obra dela -------------------------------------
create or replace function public.fn_mapa_obra_da_jazida(p_localidade uuid, p_area uuid)
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(
    (select l.obra_id from public.localidades l
      where l.id = p_localidade and 'jazida' = any(l.tipos) and l.obra_id is not null),
    (select a.obra_id from public.mapa_areas a
      where a.id = p_area and a.tipo = 'jazida' and a.obra_id is not null));
$function$;

create or replace function public.fn_mapa_trg_obra_da_jazida()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare v_obra uuid;
begin
  if new.localidade_id is null and new.area_id is null then return new; end if;
  v_obra := public.fn_mapa_obra_da_jazida(new.localidade_id, new.area_id);
  if v_obra is not null then new.obra_id := v_obra; end if;
  return new;
end $function$;

drop trigger if exists trg_mapa_equipamentos_obra_da_jazida on public.mapa_equipamentos;
create trigger trg_mapa_equipamentos_obra_da_jazida
  before insert or update of localidade_id, area_id, obra_id on public.mapa_equipamentos
  for each row execute function public.fn_mapa_trg_obra_da_jazida();

drop trigger if exists trg_mapa_colaboradores_obra_da_jazida on public.mapa_colaboradores;
create trigger trg_mapa_colaboradores_obra_da_jazida
  before insert or update of localidade_id, area_id, obra_id on public.mapa_colaboradores
  for each row execute function public.fn_mapa_trg_obra_da_jazida();

-- 3. Jazida que muda de obra leva quem está nela ---------------------------------------
create or replace function public.fn_mapa_trg_jazida_muda_obra()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_motivo text := format('Jazida %s mudou de obra', new.nome);
  r record;
begin
  if new.obra_id is not distinct from old.obra_id or new.obra_id is null then return new; end if;
  if tg_table_name = 'localidades' then
    if not ('jazida' = any(new.tipos)) then return new; end if;
  elsif new.tipo <> 'jazida' then
    return new;
  end if;

  for r in
    update public.mapa_equipamentos m set obra_id = new.obra_id, updated_by = auth.uid()
     where m.obra_id is distinct from new.obra_id
       and (case when tg_table_name = 'localidades' then m.localidade_id else m.area_id end) = new.id
    returning m.equipamento_id
  loop
    insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
    values ('transferencia', 'equipamento', r.equipamento_id,
            jsonb_build_object('obra_id', old.obra_id), jsonb_build_object('obra_id', new.obra_id),
            v_motivo, v_hoje);
  end loop;

  for r in
    update public.mapa_colaboradores c set obra_id = new.obra_id
     where c.obra_id is distinct from new.obra_id
       and (case when tg_table_name = 'localidades' then c.localidade_id else c.area_id end) = new.id
    returning c.colaborador_id
  loop
    insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
    values ('transferencia', 'colaborador', r.colaborador_id,
            jsonb_build_object('obra_id', old.obra_id), jsonb_build_object('obra_id', new.obra_id),
            v_motivo, v_hoje);
  end loop;
  return new;
end $function$;

drop trigger if exists trg_localidades_jazida_muda_obra on public.localidades;
create trigger trg_localidades_jazida_muda_obra
  after update of obra_id on public.localidades
  for each row execute function public.fn_mapa_trg_jazida_muda_obra();

drop trigger if exists trg_mapa_areas_jazida_muda_obra on public.mapa_areas;
create trigger trg_mapa_areas_jazida_muda_obra
  after update of obra_id on public.mapa_areas
  for each row execute function public.fn_mapa_trg_jazida_muda_obra();

revoke all on function public.fn_mapa_trg_jazida_muda_obra() from public, anon, authenticated;
revoke all on function public.fn_mapa_trg_jazida_exige_obra() from public, anon, authenticated;
revoke all on function public.fn_mapa_trg_obra_da_jazida() from public, anon, authenticated;
revoke all on function public.fn_mapa_obra_da_jazida(uuid, uuid) from public, anon;
grant execute on function public.fn_mapa_obra_da_jazida(uuid, uuid) to authenticated;

-- 4. Jazida ganha do trecho ao soltar a máquina ----------------------------------------
create or replace function public.fn_mapa_resolver_destino(p_lng double precision, p_lat double precision)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_p extensions.geometry := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);
  v_snap_tracado double precision := coalesce((select (valor #>> '{}')::double precision from public.configuracoes where chave = 'mapa.snap_tracado_m'), 300);
  v_snap_local   double precision := coalesce((select (valor #>> '{}')::double precision from public.configuracoes where chave = 'mapa.snap_local_m'), 300);
  r record;
begin
  select a.id, a.tipo, a.obra_id, a.localidade_id, a.nome into r
  from public.v_mapa_areas a
  where a.ativo_efetivo and extensions.st_contains(a.poligono, v_p)
  order by extensions.st_area(a.poligono) limit 1;
  if found then
    return jsonb_build_object('tipo', 'area', 'area_id', r.id, 'area_tipo', r.tipo, 'obra_id', r.obra_id,
      'localidade_id', r.localidade_id, 'nome', r.nome,
      'estado', case when r.tipo = 'zona_oficina' then 'conserto'
                     when r.tipo in ('patio_obra','zona_patio_central','terreno') then 'parado' else 'operando' end,
      'lng', p_lng, 'lat', p_lat);
  end if;
  -- Jazida antes do trecho: a máquina na jazida trabalha para a obra da jazida, mesmo com a
  -- rodovia passando a menos do snap.
  select l.id, l.tipo, l.nome, l.obra_id, extensions.st_distance(l.posicao::extensions.geography, v_p::extensions.geography) as d into r
  from public.localidades l
  where l.ativo and l.posicao is not null and 'jazida' = any(l.tipos)
    and extensions.st_dwithin(l.posicao::extensions.geography, v_p::extensions.geography, coalesce(l.raio_m, v_snap_local))
  order by d limit 1;
  if found then
    return jsonb_build_object('tipo', 'localidade', 'localidade_id', r.id, 'localidade_tipo', r.tipo, 'nome', r.nome, 'obra_id', r.obra_id,
      'estado', case when r.tipo = 'oficina' then 'conserto' when r.tipo in ('patio','terreno') then 'parado' else 'operando' end,
      'lng', p_lng, 'lat', p_lat, 'distancia_m', r.d);
  end if;
  select t.id, t.obra_id, t.nome, k.km, k.distancia_m, k.snap_lng, k.snap_lat into r
  from public.mapa_trechos t
  cross join lateral public.fn_mapa_km_no_trecho(t.id, p_lng, p_lat) k
  where t.ativo and extensions.st_dwithin(t.tracado::extensions.geography, v_p::extensions.geography, v_snap_tracado)
  order by k.distancia_m limit 1;
  if found then
    return jsonb_build_object('tipo', 'trecho', 'trecho_id', r.id, 'obra_id', r.obra_id, 'nome', r.nome,
      'km', r.km, 'distancia_m', r.distancia_m, 'estado', 'operando', 'lng', r.snap_lng, 'lat', r.snap_lat);
  end if;
  select l.id, l.tipo, l.nome, l.obra_id, extensions.st_distance(l.posicao::extensions.geography, v_p::extensions.geography) as d into r
  from public.localidades l
  where l.ativo and l.posicao is not null
    and extensions.st_dwithin(l.posicao::extensions.geography, v_p::extensions.geography, coalesce(l.raio_m, v_snap_local))
  order by d limit 1;
  if found then
    return jsonb_build_object('tipo', 'localidade', 'localidade_id', r.id, 'localidade_tipo', r.tipo, 'nome', r.nome, 'obra_id', r.obra_id,
      'estado', case when r.tipo = 'oficina' then 'conserto' when r.tipo in ('patio','terreno') then 'parado' else 'operando' end,
      'lng', p_lng, 'lat', p_lat, 'distancia_m', r.d);
  end if;
  return jsonb_build_object('tipo', 'livre', 'estado', null, 'lng', p_lng, 'lat', p_lat);
end $function$;

-- 5. Salvar local com obra e ativo -----------------------------------------------------
-- p_obra null = não mexe na obra (na edição); p_ativo null = não mexe; false = inativa.
create or replace function public.fn_mapa_local_gravar(p_id uuid, p_nome text, p_tipos text[], p_lng double precision, p_lat double precision, p_obra uuid, p_ativo boolean)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_id uuid;
begin
  if (p_lng is null) <> (p_lat is null)
     or (p_lng is not null and (p_lng not between -180 and 180 or p_lat not between -90 and 90)) then
    raise exception 'Ponto inválido';
  end if;
  if p_tipos is not null and (cardinality(p_tipos) = 0 or not p_tipos <@ array['pedreira','usina','canteiro',
       'patio','oficina','sede','jazida','terreno','alojamento','deposito','pulmao','outro']::text[]) then
    raise exception 'Tipo de local inválido';
  end if;
  if p_obra is not null and not exists (select 1 from public.obras o where o.id = p_obra) then
    raise exception 'Obra não encontrada';
  end if;
  if p_id is null then
    perform public.fn_mapa_exigir('criar');
    if coalesce(btrim(p_nome), '') = '' then raise exception 'Informe o nome do local'; end if;
    if p_tipos is null then raise exception 'Escolha ao menos um tipo'; end if;
    if p_lng is null then raise exception 'Toque no mapa onde fica o local'; end if;
    insert into public.localidades (nome, tipo, tipos, latitude, longitude, obra_id, ativo)
    values (btrim(p_nome), p_tipos[1], p_tipos, round(p_lat::numeric, 7), round(p_lng::numeric, 7), p_obra, true)
    returning id into v_id;
    return v_id;
  end if;
  perform public.fn_mapa_exigir('editar');
  update public.localidades set
    nome = coalesce(nullif(btrim(p_nome), ''), nome),
    tipos = coalesce(p_tipos, tipos),
    latitude = coalesce(round(p_lat::numeric, 7), latitude),
    longitude = coalesce(round(p_lng::numeric, 7), longitude),
    obra_id = coalesce(p_obra, obra_id),
    ativo = coalesce(p_ativo, ativo)
  where id = p_id and ativo
  returning id into v_id;
  if v_id is null then raise exception 'Local não encontrado ou inativo'; end if;
  return v_id;
end $function$;

revoke all on function public.fn_mapa_local_gravar(uuid, text, text[], double precision, double precision, uuid, boolean) from public, anon;
grant execute on function public.fn_mapa_local_gravar(uuid, text, text[], double precision, double precision, uuid, boolean) to authenticated;
