-- Módulo Mapa v1.9: locais com vários tipos e obras desenhadas (trecho ou área)
--
-- Pedido do Tiago (15/10/2026):
-- - um local pode ser pátio, jazida e oficina ao mesmo tempo: localidades.tipos (lista). O
--   `tipo` de sempre continua existindo como o principal (= tipos[1]); um gatilho mantém os dois
--   juntos, então o Cadastros (que só conhece `tipo`) e o resolvedor de destino (que decide o
--   estado da máquina pelo tipo principal) seguem iguais.
-- - obra nova pergunta pavimentação (ponto inicial, curvas e final: vira trecho) ou edificação
--   (polígono fechado, 4 cantos ou mais: vira área 'edificacao'). Redesenhar pode acrescentar ou
--   substituir o desenho que a obra já tem; o ponto solto da obra sai quando ela ganha desenho.
-- - tocar numa obra ou local abre a edição: fn_mapa_local_editar (nome, tipos, posição) e
--   fn_mapa_obra_tirar (tira a obra do mapa).

alter table public.localidades add column if not exists tipos text[];
update public.localidades set tipos = array[tipo] where tipos is null;

create or replace function public.fn_localidades_trg_tipos()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    if new.tipos is null or cardinality(new.tipos) = 0 then
      new.tipos := array[new.tipo];
    end if;
  elsif new.tipos is distinct from old.tipos then
    if new.tipos is null or cardinality(new.tipos) = 0 then
      new.tipos := array[new.tipo];
    end if;
  elsif new.tipo is distinct from old.tipo then
    -- quem só conhece `tipo` (Cadastros) trocou o principal: ele vai para a frente da lista
    new.tipos := array_prepend(new.tipo, array_remove(array_remove(old.tipos, old.tipo), new.tipo));
  end if;
  -- sem repetidos, na ordem em que vieram
  new.tipos := (select array_agg(t order by o) from (
                  select t, min(o) as o from unnest(new.tipos) with ordinality u(t, o) group by t) x);
  new.tipo := new.tipos[1];
  return new;
end $$;
revoke all on function public.fn_localidades_trg_tipos() from public, anon, authenticated;

do $d$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_localidades_tipos') then
    create trigger trg_localidades_tipos before insert or update on public.localidades
      for each row execute function public.fn_localidades_trg_tipos();
  end if;
  if not exists (select 1 from pg_constraint where conname = 'localidades_tipos_check') then
    alter table public.localidades add constraint localidades_tipos_check check (
      tipos is not null and cardinality(tipos) >= 1
      and tipos <@ array['pedreira','usina','canteiro','patio','oficina','sede','jazida','terreno',
                         'alojamento','deposito','pulmao','outro']::text[]);
  end if;
end $d$;
comment on column public.localidades.tipos is
  'Tipos do local (pátio, jazida, oficina...). O primeiro é o principal e é espelhado em `tipo`.';

create or replace function public.fn_mapa_local_editar(
  p_id uuid, p_nome text, p_tipos text[], p_lng double precision, p_lat double precision)
returns uuid language plpgsql security definer set search_path to '' as $$
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
  if p_id is null then
    perform public.fn_mapa_exigir('criar');
    if coalesce(btrim(p_nome), '') = '' then raise exception 'Informe o nome do local'; end if;
    if p_tipos is null then raise exception 'Escolha ao menos um tipo'; end if;
    if p_lng is null then raise exception 'Toque no mapa onde fica o local'; end if;
    insert into public.localidades (nome, tipo, tipos, latitude, longitude, ativo)
    values (btrim(p_nome), p_tipos[1], p_tipos, round(p_lat::numeric, 7), round(p_lng::numeric, 7), true)
    returning id into v_id;
    return v_id;
  end if;
  perform public.fn_mapa_exigir('editar');
  update public.localidades set
    nome = coalesce(nullif(btrim(p_nome), ''), nome),
    tipos = coalesce(p_tipos, tipos),
    latitude = coalesce(round(p_lat::numeric, 7), latitude),
    longitude = coalesce(round(p_lng::numeric, 7), longitude)
  where id = p_id and ativo
  returning id into v_id;
  if v_id is null then raise exception 'Local não encontrado ou inativo'; end if;
  return v_id;
end $$;

create or replace function public.fn_mapa_obra_desenhar(
  p_obra uuid, p_forma text, p_geojson jsonb, p_rodovia text,
  p_km_inicial numeric, p_km_final numeric, p_substituir boolean)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_nome text; v_geom extensions.geometry; v_id uuid;
begin
  perform public.fn_mapa_exigir('editar');
  select nome into v_nome from public.obras where id = p_obra and ativo;
  if v_nome is null then raise exception 'Obra não encontrada ou inativa'; end if;
  v_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326);
  if p_forma = 'trecho' then
    if extensions.geometrytype(v_geom) <> 'LINESTRING' or extensions.st_npoints(v_geom) < 2 then
      raise exception 'A pavimentação precisa de ponto inicial e final';
    end if;
    if p_km_inicial is null or p_km_final is null then raise exception 'Informe o km inicial e o final'; end if;
    if coalesce(p_substituir, false) then
      update public.mapa_trechos set ativo = false where obra_id = p_obra and ativo;
    end if;
    insert into public.mapa_trechos (obra_id, nome, rodovia, km_inicial, km_final, tracado)
    values (p_obra, v_nome, nullif(btrim(p_rodovia), ''), p_km_inicial, p_km_final, v_geom)
    returning id into v_id;
    update public.obras set tipo_obra = 'rodovia', centro = null, no_mapa = true where id = p_obra;
  elsif p_forma = 'area' then
    if extensions.geometrytype(v_geom) <> 'POLYGON' or extensions.st_npoints(v_geom) < 5 then
      raise exception 'A edificação precisa de um polígono fechado com 4 cantos ou mais';
    end if;
    if not extensions.st_isvalid(v_geom) then
      raise exception 'O polígono se cruza: toque os cantos em volta, na ordem';
    end if;
    if coalesce(p_substituir, false) then
      update public.mapa_areas set ativo = false where obra_id = p_obra and tipo = 'edificacao' and ativo;
    end if;
    insert into public.mapa_areas (tipo, nome, obra_id, poligono)
    values ('edificacao', v_nome, p_obra, v_geom)
    returning id into v_id;
    update public.obras set tipo_obra = 'edificacao', centro = null, no_mapa = true where id = p_obra;
  else
    raise exception 'Forma inválida: %', p_forma;
  end if;
  return v_id;
end $$;

create or replace function public.fn_mapa_obra_tirar(p_obra uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_mapa_exigir('editar');
  update public.obras set centro = null, no_mapa = false where id = p_obra;
  if not found then raise exception 'Obra não encontrada'; end if;
  update public.mapa_trechos set ativo = false where obra_id = p_obra and ativo;
  update public.mapa_areas set ativo = false where obra_id = p_obra and tipo = 'edificacao' and ativo;
end $$;

revoke all on function public.fn_mapa_local_editar(uuid, text, text[], double precision, double precision) from public, anon;
revoke all on function public.fn_mapa_obra_desenhar(uuid, text, jsonb, text, numeric, numeric, boolean) from public, anon;
revoke all on function public.fn_mapa_obra_tirar(uuid) from public, anon;
grant execute on function public.fn_mapa_local_editar(uuid, text, text[], double precision, double precision) to authenticated;
grant execute on function public.fn_mapa_obra_desenhar(uuid, text, jsonb, text, numeric, numeric, boolean) to authenticated;
grant execute on function public.fn_mapa_obra_tirar(uuid) to authenticated;

-- fn_mapa_estado: tipos dos locais (com e sem ponto)
do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_velho text;
begin
  v_velho := $t$'fornecedor_id', l.fornecedor_id, 'raio_m', l.raio_m,$t$;
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado sem o raio_m esperado; nada alterado';
  end if;
  v_def := replace(v_def, v_velho, $t$'fornecedor_id', l.fornecedor_id, 'raio_m', l.raio_m, 'tipos', to_jsonb(l.tipos),$t$);
  v_velho := $t$'id', l.id, 'nome', l.nome, 'tipo', l.tipo) order by l.nome)$t$;
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado sem a lista de locais sem ponto esperada; nada alterado';
  end if;
  v_def := replace(v_def, v_velho, $t$'id', l.id, 'nome', l.nome, 'tipo', l.tipo, 'tipos', to_jsonb(l.tipos)) order by l.nome)$t$);
  execute v_def;
end
$migracao$;
