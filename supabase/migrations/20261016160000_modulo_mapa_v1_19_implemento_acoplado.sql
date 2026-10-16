-- Módulo Mapa v1.19: implemento acoplado num equipamento, marcado no card
--
-- Pedido do Tiago (16/10/2026): "os implementos podem ser acoplados a um equipamento, por exemplo a
-- IMP-005 plataforma roll on está acoplada ao CS-006 ... só marcar no card do equipamento".
-- O implemento (equipamento de tipo 'Implementos') guarda em qual equipamento está
-- (equipamentos.acoplado_em). Um implemento fica num equipamento por vez; um equipamento pode
-- levar mais de um. Acoplar e desacoplar vão para mapa_movimentacoes (tipo 'acoplamento').
-- Só o card: o implemento segue fora do mapa, sem efeito em custo, abastecimento ou frete.

alter table public.equipamentos
  add column if not exists acoplado_em uuid references public.equipamentos(id) on delete set null
    constraint equipamentos_acoplado_em_nao_si_mesmo check (acoplado_em is distinct from id);

comment on column public.equipamentos.acoplado_em is 'Implemento: equipamento em que está acoplado (Mapa, card do equipamento). Nulo = solto.';

create index if not exists equipamentos_acoplado_em_idx on public.equipamentos (acoplado_em) where acoplado_em is not null;

alter table public.mapa_movimentacoes drop constraint mapa_movimentacoes_tipo_check;
alter table public.mapa_movimentacoes add constraint mapa_movimentacoes_tipo_check
  check (tipo = any (array['transferencia', 'estado', 'operador', 'frente', 'equipe', 'posicao', 'locacao', 'acoplamento']));

-- p_equipamento nulo desacopla.
create or replace function public.fn_mapa_acoplar_implemento(p_implemento uuid, p_equipamento uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_antes uuid; v_tipo text;
begin
  perform public.fn_mapa_exigir('editar');
  select acoplado_em, tipo into v_antes, v_tipo from public.equipamentos where id = p_implemento and ativo for update;
  if not found then raise exception 'Implemento não encontrado ou inativo'; end if;
  if v_tipo is distinct from 'Implementos' then raise exception 'Só implemento pode ser acoplado'; end if;
  if p_equipamento is not null then
    if p_equipamento = p_implemento then raise exception 'O implemento não pode ser acoplado nele mesmo'; end if;
    select tipo into v_tipo from public.equipamentos where id = p_equipamento and ativo;
    if not found then raise exception 'Equipamento não encontrado ou inativo'; end if;
    if v_tipo = 'Implementos' then raise exception 'Implemento se acopla num equipamento, não em outro implemento'; end if;
  end if;
  if v_antes is not distinct from p_equipamento then return; end if;
  update public.equipamentos set acoplado_em = p_equipamento where id = p_implemento;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('acoplamento', 'equipamento', p_implemento,
          jsonb_build_object('acoplado_em', v_antes), jsonb_build_object('acoplado_em', p_equipamento),
          case when p_equipamento is null then 'Desacoplado no card' else 'Acoplado no card' end);
end $$;

revoke all on function public.fn_mapa_acoplar_implemento(uuid, uuid) from public, anon;
grant execute on function public.fn_mapa_acoplar_implemento(uuid, uuid) to authenticated;

-- fn_mapa_estado refeita a partir da definição viva (v1.18): leva os implementos ativos.
CREATE OR REPLACE FUNCTION public.fn_mapa_estado()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_equipamentos jsonb; v_fora jsonb; v_pessoas jsonb; v_trechos jsonb; v_areas jsonb;
  v_localidades jsonb; v_frentes jsonb; v_modelos jsonb; v_fornecedores jsonb; v_config jsonb;
begin
  perform public.fn_mapa_exigir('ver');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.equipamento_id, 'codigo', v.codigo, 'descricao', v.descricao, 'tipo', v.tipo, 'marca', v.marca, 'modelo', v.modelo,
      'placa', v.placa, 'propriedade', v.propriedade, 'modelo_3d', coalesce(v.tipo_modelo_3d, 'generico'),
      'lng', v.lng, 'lat', v.lat, 'heading', v.heading, 'fonte_posicao', v.fonte_posicao,
      'estado', v.estado_efetivo, 'estado_mapa', v.estado_mapa,
      'marcado_em', (select max(mv.criado_em) from public.mapa_movimentacoes mv
                     where mv.alvo = 'equipamento' and mv.alvo_id = v.equipamento_id and mv.tipo = 'estado'), 'estado_desde', v.estado_desde, 'dias_no_estado', v.dias_no_estado,
      'obra_id', v.obra_id, 'obra_nome', v.obra_nome, 'trecho_id', v.trecho_id, 'trecho_nome', v.trecho_nome,
      'frente_id', v.frente_id, 'frente_nome', v.frente_nome, 'area_id', v.area_id, 'area_nome', v.area_nome,
      'localidade_id', v.localidade_id, 'localidade_nome', v.localidade_nome, 'km', v.km_atual,
      'operador_id', v.operador_colaborador_id, 'operador_nome', v.operador_nome,
      'deslocamento', v.deslocamento, 'quebra_descricao', v.quebra_descricao, 'observacao', v.observacao,
      'conserto_motivo', v.conserto_motivo, 'conserto_previsao', v.conserto_previsao, 'conserto_desde', v.conserto_desde,
      'os_abertas', v.os_abertas, 'ultimo_abastecimento', v.ultimo_abastecimento, 'ultima_medicao', v.ultima_medicao,
      'locacao', case when v.locacao_id is null then null else jsonb_build_object(
        'id', v.locacao_id, 'locador_id', v.locador_id, 'locador_nome', v.locador_nome, 'tipo_aluguel', v.tipo_aluguel,
        'valor_unitario', v.locacao_valor_unitario, 'inicio', v.locacao_inicio, 'fim_previsto', v.locacao_fim_previsto,
        'custo_estimado', v.locacao_custo_estimado) end
    ) order by v.codigo), '[]'::jsonb)
  into v_equipamentos
  from public.v_mapa_equipamentos v
  where v.no_mapa and v.ativo;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.equipamento_id, 'codigo', v.codigo, 'descricao', v.descricao, 'tipo', v.tipo, 'marca', v.marca, 'modelo', v.modelo,
      'propriedade', v.propriedade, 'modelo_3d', coalesce(v.tipo_modelo_3d, 'generico')
    ) order by v.propriedade, v.codigo), '[]'::jsonb)
  into v_fora
  from public.v_mapa_equipamentos v
  where not v.no_mapa and v.ativo and v.propriedade in ('colorado', 'alugada');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'funcao', f.nome, 'vinculo', c.vinculo,
      'equipe_id', mc.equipe_id, 'equipe_nome', eq.nome, 'obra_id', coalesce(mc.obra_id, c.obra_id), 'frente_id', mc.frente_id,
      'equipamento_id', mc.equipamento_id, 'area_id', mc.area_id, 'localidade_id', mc.localidade_id,
      'lng', extensions.st_x(p.pos), 'lat', extensions.st_y(p.pos), 'posicao_manual', mc.posicao_manual is not null
    ) order by c.nome), '[]'::jsonb)
  into v_pessoas
  from public.colaboradores c
  left join public.funcoes f on f.id = c.funcao_id
  left join public.mapa_colaboradores mc on mc.colaborador_id = c.id
  left join public.mapa_equipes eq on eq.id = mc.equipe_id
  left join public.mapa_equipamentos me on me.equipamento_id = mc.equipamento_id
  left join public.mapa_areas a on a.id = mc.area_id
  left join public.localidades l on l.id = mc.localidade_id
  left join public.mapa_frentes fr on fr.id = mc.frente_id
  cross join lateral (select coalesce(mc.posicao_manual, me.posicao, extensions.st_centroid(a.poligono), l.posicao, extensions.st_centroid(fr.geometria)) as pos) p
  where c.ativo and c.data_demissao is null;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'obra_id', t.obra_id, 'obra_nome', o.nome, 'trecho_pai_id', t.trecho_pai_id, 'nome', t.nome, 'rodovia', t.rodovia,
      'km_inicial', t.km_inicial, 'km_final', t.km_final, 'cor', coalesce(t.cor, o.cor), 'ordem', t.ordem,
      'tracado', extensions.st_asgeojson(t.tracado, 6)::jsonb
    ) order by t.ordem, t.nome), '[]'::jsonb)
  into v_trechos
  from public.mapa_trechos t
  join public.obras o on o.id = t.obra_id
  where t.ativo;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'nome', a.nome, 'tipo', a.tipo, 'obra_id', a.obra_id, 'obra_nome', a.obra_nome, 'localidade_id', a.localidade_id,
      'atributos', a.atributos, 'poligono', extensions.st_asgeojson(a.poligono, 6)::jsonb,
      'centro_lng', extensions.st_x(extensions.st_centroid(a.poligono)), 'centro_lat', extensions.st_y(extensions.st_centroid(a.poligono))
    ) order by a.nome), '[]'::jsonb)
  into v_areas
  from public.v_mapa_areas a
  where a.ativo_efetivo;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'nome', l.nome, 'tipo', l.tipo, 'obra_id', l.obra_id, 'fornecedor_id', l.fornecedor_id, 'raio_m', l.raio_m, 'tipos', to_jsonb(l.tipos),
      'lng', extensions.st_x(l.posicao), 'lat', extensions.st_y(l.posicao)
    ) order by l.nome), '[]'::jsonb)
  into v_localidades
  from public.localidades l
  where l.ativo and l.posicao is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', fr.id, 'obra_id', fr.obra_id, 'trecho_id', fr.trecho_id, 'area_id', fr.area_id, 'data', fr.data, 'nome', fr.nome,
      'servico', fr.servico, 'km_inicial', fr.km_inicial, 'km_final', fr.km_final, 'observacao', fr.observacao,
      'geometria', case when fr.geometria is null then null else extensions.st_asgeojson(fr.geometria, 6)::jsonb end
    ) order by fr.nome), '[]'::jsonb)
  into v_frentes
  from public.mapa_frentes fr
  where fr.data = v_hoje;

  select coalesce(jsonb_agg(jsonb_build_object('chave', m.chave, 'nome', m.nome, 'arquivo', m.arquivo, 'escala', m.escala, 'versao', m.versao) order by m.chave), '[]'::jsonb)
  into v_modelos from public.mapa_modelos_3d m;

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'nome', coalesce(f.nome_fantasia, f.razao_social)) order by coalesce(f.nome_fantasia, f.razao_social)), '[]'::jsonb)
  into v_fornecedores from public.fornecedores f where f.ativo;

  select jsonb_build_object(
      'snap_tracado_m', coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'mapa.snap_tracado_m'), 300),
      'snap_local_m',   coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'mapa.snap_local_m'), 300),
      'fornecedor_colorado', (select valor #>> '{}' from public.configuracoes where chave = 'mapa.fornecedor_colorado'),
      'tipos_fora_do_mapa', (select valor from public.configuracoes where chave = 'mapa.tipos_fora_do_mapa'))
  into v_config;

  return jsonb_build_object(
    'gerado_em', now(), 'hoje', v_hoje, 'config', v_config, 'modelos', v_modelos,
    'equipamentos', v_equipamentos, 'fora_do_mapa', v_fora, 'pessoas', v_pessoas,
    'trechos', v_trechos, 'areas', v_areas, 'localidades', v_localidades, 'frentes_hoje', v_frentes,
    'fornecedores', v_fornecedores,
    'obras', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'nome', o.nome, 'cor', o.cor, 'tipo_obra', o.tipo_obra, 'no_mapa', o.no_mapa,
        'lng', extensions.st_x(o.centro), 'lat', extensions.st_y(o.centro)) order by o.nome), '[]'::jsonb)
      from public.obras o where o.ativo),
    'tanques', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nome', t.nome, 'apelido', t.apelido, 'uso', t.uso, 'eh_externo', t.eh_externo,
        'localidade_id', t.localidade_id, 'equipamento_id', t.equipamento_id,
        'lng', extensions.st_x(t.posicao), 'lat', extensions.st_y(t.posicao),
        'capacidade', t.capacidade_litros, 'nivel', t.nivel_atual_litros, 'unidade', t.capacidade_unidade,
        'insumo', (select i.nome from public.insumos i where i.id = t.combustivel_atual_id)) order by t.nome), '[]'::jsonb)
      from public.tanques t where t.ativo),
    'pilhas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'saldo', p.saldo,
        'total_entrada', p.total_entrada, 'localidade_id', p.localidade_id,
        'insumo', (select i.nome from public.insumos i where i.id = p.insumo_id),
        'unidade', (select u.sigla from public.insumos i join public.unidades_medida u on u.id = i.unidade_id
                    where i.id = p.insumo_id),
        'lng', extensions.st_x(p.posicao), 'lat', extensions.st_y(p.posicao)) order by p.nome), '[]'::jsonb)
      from public.estoque_pilhas p where p.ativo),
    'implementos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'codigo', i.codigo, 'descricao', i.descricao, 'acoplado_em', i.acoplado_em) order by i.codigo), '[]'::jsonb)
      from public.equipamentos i where i.ativo and i.tipo = 'Implementos'),
    'depositos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'nome', d.nome, 'localidade_id', d.localidade_id,
        'lng', extensions.st_x(d.posicao), 'lat', extensions.st_y(d.posicao),
        'largura_m', d.mapa_largura_m, 'comprimento_m', d.mapa_comprimento_m, 'altura_m', d.mapa_altura_m, 'rumo', d.mapa_rumo) order by d.nome), '[]'::jsonb)
      from public.almoxarifado_depositos d where d.ativo),
    'fretes_em_rota', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'tipo', f.tipo, 'data', f.data, 'criado_em', f.created_at,
        'placa', f.placa_carreta, 'motorista', f.motorista,
        'equipamento_id', (
          select case when count(*) = 1 then min(e.id::text)::uuid end
          from public.equipamentos e
          where e.ativo
            and length(regexp_replace(upper(coalesce(f.placa_carreta, '')), '[^A-Z0-9]', '', 'g')) >= 7
            and regexp_replace(upper(coalesce(e.placa, '') || ' ' || coalesce(e.descricao, '')), '[^A-Z0-9]', '', 'g')
                like '%' || regexp_replace(upper(f.placa_carreta), '[^A-Z0-9]', '', 'g') || '%'),
        'transportadora', (select coalesce(x.nome_fantasia, x.razao_social) from public.fornecedores x
                           where x.id = f.transportadora_id),
        'origem', lo.nome, 'origem_lng', extensions.st_x(lo.posicao), 'origem_lat', extensions.st_y(lo.posicao),
        'destino', ld.nome, 'destino_lng', extensions.st_x(ld.posicao), 'destino_lat', extensions.st_y(ld.posicao),
        'material', (select i.nome from public.insumos i where i.id = f.insumo_id),
        'peso', f.peso_toneladas, 'km', f.km_rodados,
        'valor_tkm', case when public.tem_permissao('frete.fretes', 'ver') then f.valor_tkm end,
        'valor_total', case when public.tem_permissao('frete.fretes', 'ver') then f.valor_total end,
        'valor_material', case when public.tem_permissao('frete.fretes', 'ver') then f.valor_material end,
        'horas', rt.horas_mapa, 'tracado', rt.tracado) order by f.data, f.created_at), '[]'::jsonb)
      from public.fretes f
      left join public.localidades lo on lo.id = f.origem_localidade_id
      left join public.localidades ld on ld.id = f.destino_localidade_id
      left join public.frete_rotas_tracado rt
        on rt.origem_localidade_id = f.origem_localidade_id and rt.destino_localidade_id = f.destino_localidade_id
      where f.excluido_em is null and f.data_chegada is null
        and f.data >= (now() at time zone 'America/Rio_Branco')::date - 7),
    'carretas_retorno', (
      with fe as (
        select f.id, f.data, f.created_at, f.updated_at, f.data_chegada,
               f.origem_localidade_id, f.destino_localidade_id,
               (
          select case when count(*) = 1 then min(e.id::text)::uuid end
          from public.equipamentos e
          where e.ativo
            and length(regexp_replace(upper(coalesce(f.placa_carreta, '')), '[^A-Z0-9]', '', 'g')) >= 7
            and regexp_replace(upper(coalesce(e.placa, '') || ' ' || coalesce(e.descricao, '')), '[^A-Z0-9]', '', 'g')
                like '%' || regexp_replace(upper(f.placa_carreta), '[^A-Z0-9]', '', 'g') || '%') as equipamento_id
        from public.fretes f
        where f.excluido_em is null and f.data >= v_hoje - 60),
      ultimo as (
        select distinct on (fe.equipamento_id) fe.*
        from fe where fe.equipamento_id is not null
        order by fe.equipamento_id, fe.data desc, fe.created_at desc),
      volta as (
        select u.*, me.retorno_localidade_id is not null as escolhida,
               coalesce(me.retorno_localidade_id,
                 (select g.origem_localidade_id from fe g
                  join public.localidades lg on lg.id = g.origem_localidade_id
                  where g.equipamento_id = u.equipamento_id and 'pedreira' = any(lg.tipos)
                  order by g.data desc, g.created_at desc limit 1)) as pedreira_id
        from ultimo u
        left join public.mapa_equipamentos me
          on me.equipamento_id = u.equipamento_id and me.retorno_frete_id = u.id
        where u.data_chegada is not null and u.data_chegada >= v_hoje - 7)
      select coalesce(jsonb_agg(jsonb_build_object(
          'equipamento_id', r.equipamento_id, 'frete_id', r.id, 'chegada', r.data_chegada,
          'chegada_em', greatest(r.data_chegada::timestamp at time zone 'America/Rio_Branco',
                                 least(r.updated_at, (r.data_chegada + 1)::timestamp at time zone 'America/Rio_Branco')),
          'de', ld.nome, 'de_lng', extensions.st_x(ld.posicao), 'de_lat', extensions.st_y(ld.posicao),
          'pedreira_id', lp.id, 'pedreira', lp.nome,
          'pedreira_lng', extensions.st_x(lp.posicao), 'pedreira_lat', extensions.st_y(lp.posicao),
          'pedreira_escolhida', r.escolhida,
          'horas', coalesce(rv.horas_mapa, ri.horas_mapa), 'km', coalesce(rv.km_mapa, ri.km_mapa),
          'tracado_volta', rv.tracado, 'tracado_ida', ri.tracado) order by r.equipamento_id), '[]'::jsonb)
      from volta r
      join public.localidades ld on ld.id = r.destino_localidade_id and ld.posicao is not null
      join public.localidades lp on lp.id = r.pedreira_id and lp.posicao is not null
      left join public.frete_rotas_tracado ri
        on ri.origem_localidade_id = r.pedreira_id and ri.destino_localidade_id = r.destino_localidade_id
      left join public.frete_rotas_tracado rv
        on rv.origem_localidade_id = r.destino_localidade_id and rv.destino_localidade_id = r.pedreira_id
      where r.pedreira_id is distinct from r.destino_localidade_id),
    'localidades_sem_posicao', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'nome', l.nome, 'tipo', l.tipo, 'tipos', to_jsonb(l.tipos)) order by l.nome), '[]'::jsonb)
      from public.localidades l where l.ativo and l.posicao is null));
end $function$;

revoke all on function public.fn_mapa_estado() from public, anon;
grant execute on function public.fn_mapa_estado() to authenticated;
