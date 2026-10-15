-- Módulo Mapa v1.3 (15/10/2026): o que a tela precisa ler numa chamada só.
-- Idempotente. Só acrescenta: uma função de leitura e o caminho dos GLB em mapa_modelos_3d.
--
-- fn_mapa_estado(): tudo que o mapa desenha ao abrir (equipamentos no mapa, candidatos a locação,
-- pessoas, trechos com o traçado em GeoJSON, áreas, localidades, frentes do dia, modelos 3D e as
-- configurações de snap). Security definer com a mesma guarda das outras RPCs do módulo
-- (fn_mapa_exigir, que recusa quem não tem mapa.mapa/ver): o front chama uma RPC em vez de ler
-- as views uma a uma, e o PostGIS fica no banco (st_asgeojson).

create or replace function public.fn_mapa_estado()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_equipamentos jsonb; v_fora jsonb; v_pessoas jsonb; v_trechos jsonb; v_areas jsonb;
  v_localidades jsonb; v_frentes jsonb; v_modelos jsonb; v_fornecedores jsonb; v_config jsonb;
begin
  perform public.fn_mapa_exigir('ver');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.equipamento_id, 'codigo', v.codigo, 'descricao', v.descricao, 'tipo', v.tipo, 'marca', v.marca, 'modelo', v.modelo,
      'placa', v.placa, 'propriedade', v.propriedade, 'modelo_3d', coalesce(v.tipo_modelo_3d, 'generico'),
      'lng', v.lng, 'lat', v.lat, 'heading', coalesce(v.heading, 0), 'fonte_posicao', v.fonte_posicao,
      'estado', v.estado_efetivo, 'estado_desde', v.estado_desde, 'dias_no_estado', v.dias_no_estado,
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

  -- Candidatos a "Adicionar máquina alugada": Colorado e alugadas que estão fora do mapa.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.equipamento_id, 'codigo', v.codigo, 'descricao', v.descricao, 'tipo', v.tipo, 'marca', v.marca, 'modelo', v.modelo,
      'propriedade', v.propriedade, 'modelo_3d', coalesce(v.tipo_modelo_3d, 'generico')
    ) order by v.propriedade, v.codigo), '[]'::jsonb)
  into v_fora
  from public.v_mapa_equipamentos v
  where not v.no_mapa and v.ativo and v.propriedade in ('colorado', 'alugada');

  -- Pessoas: posição manual, senão a da máquina que operam, senão a da área/localidade, senão a frente do dia.
  -- Quem não tem posição nenhuma vem com lng/lat nulos: não aparece no mapa, mas entra na lista
  -- de operadores (assinalar operador precisa de todo mundo ativo, não só de quem já foi posto no mapa).
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
      'id', l.id, 'nome', l.nome, 'tipo', l.tipo, 'obra_id', l.obra_id, 'fornecedor_id', l.fornecedor_id,
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

  -- Fornecedores para a locação (todos os ativos; a lista é curta e o campo é um combobox).
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
    'fornecedores', v_fornecedores);
end $$;
comment on function public.fn_mapa_estado() is 'Estado completo do mapa para a tela abrir numa chamada (mapa.mapa/ver).';
revoke all on function public.fn_mapa_estado() from public;
grant execute on function public.fn_mapa_estado() to authenticated;

-- Caminho dos GLB (servidos pelo próprio app em /mapa-modelos/<chave>.glb; decisão de 15/10:
-- arquivos versionados no repositório em vez do bucket, 22 modelos somam 8 MB).
update public.mapa_modelos_3d set arquivo = '/mapa-modelos/' || chave || '.glb', updated_at = now()
where chave in ('boneco','caminhao_basculante','caminhao_betoneira','caminhao_carroceria','caminhao_espargidor','caminhao_munck',
  'caminhao_pipa','caminhao_prancha','caminhonete','carreta_cavalo','escavadeira','generico','manipulador_telescopico','meloza',
  'minicarregadeira','motoniveladora','pa_carregadeira','retroescavadeira','rolo_liso','rolo_pe_carneiro','rolo_pneu',
  'trator_esteira','trator_pneu','usina_asfalto','vibroacabadora')
  and arquivo is distinct from '/mapa-modelos/' || chave || '.glb';

-- Cor dos dois lotes no mapa (os trechos entraram sem cor e caíam no cinza do asfalto):
-- Lote 10 no verde EMT, Lote 09 no amarelo do eixo da pista. Idempotente (só quem está sem cor).
update public.mapa_trechos set cor = case when nome like 'BR-364 Lote 10%' then '#3E7744' when nome like 'BR-364 Lote 09%' then '#CF943A' end, updated_at = now()
 where cor is null and (nome like 'BR-364 Lote 10%' or nome like 'BR-364 Lote 09%');
