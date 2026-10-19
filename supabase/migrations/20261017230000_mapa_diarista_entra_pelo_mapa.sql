-- Mapa: diarista entra e sai pelo Mapa (Tiago, 17/10/2026: "todos os diaristas do rh estao
-- aparecendo aqui, eu nao quero isso, diarista so entram e saim direto pelo modulo do mapa,
-- igual maquinas alugadas").
--
-- Antes o Mapa listava todo colaborador ativo do RH, diaristas inclusive (20 em 17/10). Agora:
--
-- 1. mapa_colaboradores.diarista_no_mapa: o diarista só aparece com ela ligada. CLT e terceiro
--    seguem como antes (todo ativo aparece); a coluna não vale para eles.
-- 2. fn_mapa_diarista_entrar: "Adicionar diarista", com um diarista já cadastrado no RH ou um
--    novo (o Mapa cria o colaborador como diarista; exige cadastros.colaboradores / criar).
--    fn_mapa_diarista_sair: "Tirar do mapa", sai da máquina e do local e some da tela.
-- 3. Quem está fora do mapa não aparece em fn_mapa_estado, não conta dia em
--    fn_colab_dias_calcular (Pessoal Sem Alocação) e não gera diária na foto (fn_mapa_pessoas_dia).
--    fn_mapa_assinalar_operador e fn_mapa_mover_colaboradores recusam diarista fora do mapa.
-- 4. Ficam no mapa os 6 diaristas que já tinham sido mexidos nele (5 posicionados e 1 marcado
--    parado); os outros 14 saem.
--
-- Funções alteradas a partir da definição viva; a única mudança é o filtro/guarda do diarista
-- (e as chaves diaristas_fora e funcoes no estado).
-- Rollback: reaplicar as 5 funções da migration 20261017220000 / anteriores, e
--   drop function public.fn_mapa_diarista_entrar(uuid, jsonb);
--   drop function public.fn_mapa_diarista_sair(uuid);
--   drop function public.fn_mapa_colaborador_no_mapa(uuid);
--   alter table public.mapa_colaboradores drop column diarista_no_mapa;

begin;

alter table public.mapa_colaboradores add column if not exists diarista_no_mapa boolean not null default false;
comment on column public.mapa_colaboradores.diarista_no_mapa is
  'Só para diarista: está no mapa (entrou por "Adicionar diarista"). CLT e terceiro aparecem sempre que ativos.';

update public.mapa_colaboradores mc set diarista_no_mapa = true
from public.colaboradores c
where c.id = mc.colaborador_id and c.vinculo = 'diarista' and c.ativo and c.data_demissao is null
  and not mc.diarista_no_mapa;

-- Ativo no RH e, se diarista, dentro do mapa.
create or replace function public.fn_mapa_colaborador_no_mapa(p_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.colaboradores c
    left join public.mapa_colaboradores mc on mc.colaborador_id = c.id
    where c.id = p_id and c.ativo and c.data_demissao is null
      and (c.vinculo is distinct from 'diarista' or coalesce(mc.diarista_no_mapa, false)))
$$;
revoke all on function public.fn_mapa_colaborador_no_mapa(uuid) from public, anon, authenticated;

-- fn_mapa_estado: definição viva + filtro do diarista + chaves diaristas_fora e funcoes.
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
  v_diaristas_fora jsonb; v_funcoes jsonb;
begin
  perform public.fn_mapa_exigir('ver');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.equipamento_id, 'codigo', v.codigo, 'descricao', v.descricao, 'tipo', v.tipo, 'marca', v.marca, 'modelo', v.modelo,
      'placa', v.placa, 'propriedade', v.propriedade, 'modelo_3d', coalesce(v.tipo_modelo_3d, 'generico'),
      'lng', v.lng, 'lat', v.lat, 'heading', v.heading, 'fonte_posicao', v.fonte_posicao,
      'estado', v.estado_efetivo, 'estado_mapa', v.estado_mapa,
      'carreta_emt', public.fn_mapa_carreta_emt(v.equipamento_id),
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
      'equipe_id', mc.equipe_id, 'equipe_nome', eq.nome, 'obra_id', coalesce(mc.obra_id, c.obra_id), 'frente_id', mc.frente_id, 'obra_mapa_id', mc.obra_id,
      'equipamento_id', mc.equipamento_id, 'area_id', mc.area_id, 'localidade_id', mc.localidade_id,
      'lng', extensions.st_x(p.pos), 'lat', extensions.st_y(p.pos), 'posicao_manual', mc.posicao_manual is not null,
      'centro_custo_id', mc.centro_custo_id,
      'centro_custo_nome', (select cc.nome from public.centros_custo cc where cc.id = mc.centro_custo_id)
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
  where c.ativo and c.data_demissao is null
    and (c.vinculo is distinct from 'diarista' or coalesce(mc.diarista_no_mapa, false));

  -- Diaristas ativos fora do mapa: candidatos a "Adicionar diarista" (só entram por lá).
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'funcao', f.nome) order by c.nome), '[]'::jsonb)
  into v_diaristas_fora
  from public.colaboradores c
  left join public.funcoes f on f.id = c.funcao_id
  left join public.mapa_colaboradores mc on mc.colaborador_id = c.id
  where c.ativo and c.data_demissao is null and c.vinculo = 'diarista' and not coalesce(mc.diarista_no_mapa, false);

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome) order by f.nome), '[]'::jsonb)
  into v_funcoes from public.funcoes f where f.ativo;

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
      'tipos_fora_do_mapa', (select valor from public.configuracoes where chave = 'mapa.tipos_fora_do_mapa'),
      'obra_carretas_emt', public.fn_mapa_obra_carretas_emt())
  into v_config;

  return jsonb_build_object(
    'gerado_em', now(), 'hoje', v_hoje, 'config', v_config, 'modelos', v_modelos,
    'equipamentos', v_equipamentos, 'fora_do_mapa', v_fora, 'pessoas', v_pessoas,
    'diaristas_fora', v_diaristas_fora, 'funcoes', v_funcoes,
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
        and f.transportadora_id = public.fn_mapa_transportadora_emt()
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
        where f.excluido_em is null and f.data >= v_hoje - 60
          and f.transportadora_id = public.fn_mapa_transportadora_emt()),
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

-- fn_colab_dias_calcular: definição viva + filtro do diarista.
CREATE OR REPLACE FUNCTION public.fn_colab_dias_calcular()
 RETURNS TABLE(colaborador_id uuid, centro_custo_id uuid, motivo text, estado text, obra_id uuid, equipamento_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with base as (
    select c.id, coalesce(mc.estado, 'trabalhando') as estado, ve.equipamento_id, mc.centro_custo_id as centro,
           coalesce(ve.obra_id, mc.obra_id, l.obra_id, fr.obra_id, eq.obra_id) as obra_id
    from public.colaboradores c
    left join public.mapa_colaboradores mc on mc.colaborador_id = c.id
    left join public.v_mapa_equipamentos ve on ve.equipamento_id = mc.equipamento_id and ve.no_mapa and ve.ativo
    left join public.localidades l on l.id = mc.localidade_id
    left join public.mapa_frentes fr on fr.id = mc.frente_id
    left join public.mapa_equipes eq on eq.id = mc.equipe_id
    where c.ativo and c.data_demissao is null
      and (c.vinculo is distinct from 'diarista' or coalesce(mc.diarista_no_mapa, false))
  )
  select b.id, r.centro_custo_id, r.motivo, b.estado, b.obra_id, b.equipamento_id
  from base b
  cross join lateral public.fn_colab_centro_regra(b.estado, b.obra_id, b.centro) r;
$function$;

-- fn_mapa_pessoas_dia: definição viva + filtro do diarista (a foto não gera diária de quem está fora).
CREATE OR REPLACE FUNCTION public.fn_mapa_pessoas_dia(p_data date DEFAULT NULL::date)
 RETURNS TABLE(colaborador_id uuid, nome text, vinculo text, funcao text, valor_diaria numeric, obra_id uuid, frente_id uuid, equipe_id uuid, equipamento_id uuid, status_dia text, observacao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with d as (select coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date) as dia)
  select c.id, c.nome, c.vinculo, f.nome, c.valor_diaria,
         coalesce(mc.obra_id, c.obra_id), mc.frente_id, mc.equipe_id, mc.equipamento_id,
         case
           when ex.tipo is not null then ex.tipo
           when exists (select 1 from public.rh_ferias fe where fe.colaborador_id = c.id and d.dia between fe.data_inicio and fe.data_fim
                        and coalesce(fe.status, '') not in ('cancelada','rejeitada')) then 'ferias'
           when exists (select 1 from public.rh_ocorrencias oc where oc.colaborador_id = c.id and oc.tipo in ('atestado','acidente','suspensao')
                        and d.dia between oc.data and coalesce(oc.data_fim, oc.data)) then 'afastado'
           when c.vinculo = 'diarista' and exists (select 1 from public.rh_diarias rd where rd.colaborador_id = c.id
                        and d.dia = any (rd.dias_falta)) then 'falta'
           else 'presente'
         end,
         ex.observacao
  from d
  cross join public.colaboradores c
  left join public.funcoes f on f.id = c.funcao_id
  left join public.mapa_colaboradores mc on mc.colaborador_id = c.id
  left join public.mapa_excecoes_dia ex on ex.colaborador_id = c.id and ex.data = d.dia
  where c.ativo and (c.data_demissao is null or c.data_demissao >= d.dia)
    and (c.vinculo is distinct from 'diarista' or coalesce(mc.diarista_no_mapa, false))
    and (auth.uid() is null or public.tem_permissao('mapa.mapa', 'ver'));
$function$;

-- Portas de escrita: definição viva + guarda do diarista fora do mapa.
CREATE OR REPLACE FUNCTION public.fn_mapa_assinalar_operador(p_equipamento uuid, p_colaborador uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_antes uuid;
begin
  perform public.fn_mapa_exigir('editar');
  if p_colaborador is not null and not public.fn_mapa_colaborador_ativo(p_colaborador) then
    raise exception 'Funcionário inativo no RH não entra no Mapa.' using errcode = 'P0001';
  end if;
  if p_colaborador is not null and not public.fn_mapa_colaborador_no_mapa(p_colaborador) then
    raise exception 'Diarista fora do mapa: entra por "Adicionar diarista".' using errcode = 'P0001';
  end if;
  insert into public.mapa_equipamentos (equipamento_id) values (p_equipamento) on conflict (equipamento_id) do nothing;
  select operador_colaborador_id into v_antes from public.mapa_equipamentos where equipamento_id = p_equipamento;
  update public.mapa_equipamentos set operador_colaborador_id = p_colaborador, updated_by = auth.uid() where equipamento_id = p_equipamento;
  if p_colaborador is not null then
    insert into public.mapa_colaboradores (colaborador_id) values (p_colaborador) on conflict (colaborador_id) do nothing;
    update public.mapa_equipamentos set operador_colaborador_id = null where operador_colaborador_id = p_colaborador and equipamento_id <> p_equipamento;
    update public.mapa_colaboradores c set equipamento_id = p_equipamento,
      obra_id = coalesce(m.obra_id, c.obra_id), frente_id = coalesce(m.frente_id, c.frente_id), updated_by = auth.uid()
    from public.mapa_equipamentos m where m.equipamento_id = p_equipamento and c.colaborador_id = p_colaborador;
  end if;
  if v_antes is not null and v_antes is distinct from p_colaborador then
    update public.mapa_colaboradores set equipamento_id = null where colaborador_id = v_antes and equipamento_id = p_equipamento;
  end if;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('operador', 'equipamento', p_equipamento, jsonb_build_object('colaborador_id', v_antes), jsonb_build_object('colaborador_id', p_colaborador), p_motivo);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_mapa_mover_colaboradores(p_ids uuid[], p_destino jsonb, p_data date, p_motivo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_n int := 0; v_antes jsonb; v_obra uuid; v_frente uuid; v_equipe uuid;
begin
  perform public.fn_mapa_exigir('editar');
  if exists (select 1 from unnest(p_ids) i where not public.fn_mapa_colaborador_ativo(i)) then
    raise exception 'Funcionário inativo no RH não entra no Mapa.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_ids) i where not public.fn_mapa_colaborador_no_mapa(i)) then
    raise exception 'Diarista fora do mapa: entra por "Adicionar diarista".' using errcode = 'P0001';
  end if;
  if p_destino ? 'equipamento_id' and (p_destino->>'equipamento_id') is not null then
    foreach v_id in array p_ids loop
      perform public.fn_mapa_assinalar_operador((p_destino->>'equipamento_id')::uuid, v_id, p_motivo);
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;
  v_frente := (p_destino->>'frente_id')::uuid;
  v_equipe := (p_destino->>'equipe_id')::uuid;
  v_obra   := (p_destino->>'obra_id')::uuid;
  if v_obra is null and v_frente is not null then select obra_id into v_obra from public.mapa_frentes where id = v_frente; end if;
  if v_obra is null and v_equipe is not null then select obra_id into v_obra from public.mapa_equipes where id = v_equipe; end if;
  if v_frente is null and v_equipe is not null then select frente_id into v_frente from public.mapa_equipes where id = v_equipe; end if;
  foreach v_id in array p_ids loop
    insert into public.mapa_colaboradores (colaborador_id) values (v_id) on conflict (colaborador_id) do nothing;
    select to_jsonb(c) into v_antes from public.mapa_colaboradores c where c.colaborador_id = v_id;
    update public.mapa_colaboradores c set
      obra_id = coalesce(v_obra, c.obra_id), frente_id = v_frente, equipe_id = coalesce(v_equipe, c.equipe_id),
      area_id = (p_destino->>'area_id')::uuid, localidade_id = (p_destino->>'localidade_id')::uuid,
      equipamento_id = null,
      posicao_manual = case when p_destino->>'lng' is not null
        then extensions.st_setsrid(extensions.st_makepoint((p_destino->>'lng')::double precision, (p_destino->>'lat')::double precision), 4326) end,
      updated_by = auth.uid()
    where c.colaborador_id = v_id;
    update public.mapa_equipamentos set operador_colaborador_id = null where operador_colaborador_id = v_id;
    insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
    values ('transferencia', 'colaborador', v_id,
            jsonb_build_object('obra_id', v_antes->'obra_id', 'frente_id', v_antes->'frente_id', 'equipe_id', v_antes->'equipe_id', 'equipamento_id', v_antes->'equipamento_id'),
            jsonb_build_object('obra_id', v_obra, 'frente_id', v_frente, 'equipe_id', v_equipe),
            p_motivo, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

-- "Adicionar diarista": um diarista ativo do RH (p_colaborador) ou um novo (p_novo = {nome, cpf?,
-- funcao_id?}). Entra sem lugar; a tela pede para posicionar. Devolve o id do colaborador.
create or replace function public.fn_mapa_diarista_entrar(p_colaborador uuid, p_novo jsonb default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid := p_colaborador; v_nome text;
begin
  perform public.fn_mapa_exigir('editar');
  if v_id is null then
    if not public.tem_permissao('cadastros.colaboradores', 'criar') then
      raise exception 'Sem permissão para cadastrar colaborador (cadastros.colaboradores / criar)' using errcode = '42501';
    end if;
    v_nome := nullif(btrim(p_novo->>'nome'), '');
    if v_nome is null then
      raise exception 'Informe o nome do diarista' using errcode = 'P0001';
    end if;
    insert into public.colaboradores (nome, cpf, funcao_id, vinculo)
    values (v_nome, nullif(btrim(p_novo->>'cpf'), ''), nullif(p_novo->>'funcao_id', '')::uuid, 'diarista')
    returning id into v_id;
  elsif not exists (select 1 from public.colaboradores c where c.id = v_id and c.vinculo = 'diarista') then
    raise exception 'Só diarista entra por "Adicionar diarista".' using errcode = 'P0001';
  elsif not public.fn_mapa_colaborador_ativo(v_id) then
    raise exception 'Funcionário inativo no RH não entra no Mapa.' using errcode = 'P0001';
  end if;
  insert into public.mapa_colaboradores (colaborador_id, diarista_no_mapa, updated_by)
  values (v_id, true, auth.uid())
  on conflict (colaborador_id) do update set diarista_no_mapa = true, updated_by = auth.uid();
  return v_id;
end $$;
revoke all on function public.fn_mapa_diarista_entrar(uuid, jsonb) from public, anon;
grant execute on function public.fn_mapa_diarista_entrar(uuid, jsonb) to authenticated;

-- "Tirar do mapa": o diarista sai da máquina, do local e da tela. O cadastro do RH não muda.
create or replace function public.fn_mapa_diarista_sair(p_colaborador uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.fn_mapa_exigir('editar');
  if not exists (select 1 from public.colaboradores c where c.id = p_colaborador and c.vinculo = 'diarista') then
    raise exception 'Só diarista sai do mapa; CLT e terceiro ativos aparecem sempre.' using errcode = 'P0001';
  end if;
  update public.mapa_equipamentos set operador_colaborador_id = null, updated_by = auth.uid()
  where operador_colaborador_id = p_colaborador;
  update public.mapa_colaboradores set
    diarista_no_mapa = false, equipamento_id = null, obra_id = null, frente_id = null, equipe_id = null,
    area_id = null, localidade_id = null, posicao_manual = null, centro_custo_id = null, estado = 'trabalhando',
    updated_by = auth.uid()
  where colaborador_id = p_colaborador;
end $$;
revoke all on function public.fn_mapa_diarista_sair(uuid) from public, anon;
grant execute on function public.fn_mapa_diarista_sair(uuid) to authenticated;

commit;
