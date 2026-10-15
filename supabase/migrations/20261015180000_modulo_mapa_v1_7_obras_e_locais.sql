-- Módulo Mapa v1.7: obras e locais colocados pela tela
--
-- Pedido do Tiago (15/10/2026): botões no topo do Mapa para adicionar obras e localizações
-- (oficina, pátio da empresa, os tanques do Estoque e os depósitos).
--
-- - Obra: o Mapa NÃO cria obra (criar obra cria o centro de custo raiz pelo trigger
--   trg_obra_cria_centro_custo; isso fica no Cadastros). Ele põe uma obra ativa no mapa:
--   obras.centro + no_mapa.
-- - Local: cria uma localidade nova no ponto tocado, ou dá ponto a uma que não tinha.
--   localidades.posicao é gerada de latitude/longitude, então grava as duas.
-- - Tanque e depósito não têm coordenada própria: ficam no mapa pelo local
--   (tanques.localidade_id, almoxarifado_depositos.localidade_id).
-- - fn_mapa_estado passa a devolver obras, tanques, depósitos e locais sem ponto.
--
-- Todas checam mapa.mapa por dentro (fn_mapa_exigir); criar local pede 'criar'.

create or replace function public.fn_mapa_obra_posicionar(p_obra uuid, p_lng double precision, p_lat double precision)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_mapa_exigir('editar');
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -90 and 90 then
    raise exception 'Ponto inválido';
  end if;
  update public.obras
     set centro = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326), no_mapa = true
   where id = p_obra and ativo;
  if not found then raise exception 'Obra não encontrada ou inativa'; end if;
end $$;

create or replace function public.fn_mapa_local_salvar(p_id uuid, p_nome text, p_tipo text, p_lng double precision, p_lat double precision)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -90 and 90 then
    raise exception 'Ponto inválido';
  end if;
  if p_id is null then
    perform public.fn_mapa_exigir('criar');
    if coalesce(btrim(p_nome), '') = '' then raise exception 'Informe o nome do local'; end if;
    if p_tipo is null or p_tipo not in ('pedreira','usina','canteiro','patio','oficina','sede','jazida','terreno','alojamento','deposito','pulmao','outro') then
      raise exception 'Tipo de local inválido: %', p_tipo;
    end if;
    insert into public.localidades (nome, tipo, latitude, longitude, ativo)
    values (btrim(p_nome), p_tipo, round(p_lat::numeric, 7), round(p_lng::numeric, 7), true)
    returning id into v_id;
    return v_id;
  end if;
  perform public.fn_mapa_exigir('editar');
  update public.localidades
     set latitude = round(p_lat::numeric, 7), longitude = round(p_lng::numeric, 7)
   where id = p_id and ativo
  returning id into v_id;
  if v_id is null then raise exception 'Local não encontrado ou inativo'; end if;
  return v_id;
end $$;

create or replace function public.fn_mapa_vincular_local(p_alvo text, p_id uuid, p_localidade uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_mapa_exigir('editar');
  if not exists (select 1 from public.localidades l where l.id = p_localidade and l.ativo and l.posicao is not null) then
    raise exception 'Local não encontrado, inativo ou sem ponto no mapa';
  end if;
  if p_alvo = 'tanque' then
    update public.tanques set localidade_id = p_localidade where id = p_id and ativo;
  elsif p_alvo = 'deposito' then
    update public.almoxarifado_depositos set localidade_id = p_localidade where id = p_id and ativo;
  else
    raise exception 'Alvo inválido: %', p_alvo;
  end if;
  if not found then raise exception 'Cadastro não encontrado ou inativo'; end if;
end $$;

revoke all on function public.fn_mapa_obra_posicionar(uuid, double precision, double precision) from public, anon;
revoke all on function public.fn_mapa_local_salvar(uuid, text, text, double precision, double precision) from public, anon;
revoke all on function public.fn_mapa_vincular_local(text, uuid, uuid) from public, anon;
grant execute on function public.fn_mapa_obra_posicionar(uuid, double precision, double precision) to authenticated;
grant execute on function public.fn_mapa_local_salvar(uuid, text, text, double precision, double precision) to authenticated;
grant execute on function public.fn_mapa_vincular_local(text, uuid, uuid) to authenticated;

-- fn_mapa_estado: quatro listas novas, trocando só o fim do jsonb devolvido (definição viva).
do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_velho text := $t$    'fornecedores', v_fornecedores);$t$;
  v_novo text := $t$    'fornecedores', v_fornecedores,
    'obras', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'nome', o.nome, 'cor', o.cor, 'tipo_obra', o.tipo_obra, 'no_mapa', o.no_mapa,
        'lng', extensions.st_x(o.centro), 'lat', extensions.st_y(o.centro)) order by o.nome), '[]'::jsonb)
      from public.obras o where o.ativo),
    'tanques', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nome', t.nome, 'apelido', t.apelido, 'uso', t.uso, 'eh_externo', t.eh_externo,
        'localidade_id', t.localidade_id, 'equipamento_id', t.equipamento_id) order by t.nome), '[]'::jsonb)
      from public.tanques t where t.ativo),
    'depositos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'nome', d.nome, 'localidade_id', d.localidade_id) order by d.nome), '[]'::jsonb)
      from public.almoxarifado_depositos d where d.ativo),
    'localidades_sem_posicao', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'nome', l.nome, 'tipo', l.tipo) order by l.nome), '[]'::jsonb)
      from public.localidades l where l.ativo and l.posicao is null));$t$;
begin
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado não tem o fim esperado uma vez só; nada alterado';
  end if;
  execute replace(v_def, v_velho, v_novo);
end
$migracao$;
