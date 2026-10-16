-- Módulo Mapa v1.15: abastecimento pela placa e aquisição num número só
--
-- Pedido do Tiago (16/10/2026):
--
-- 1. A CS-004 aparecia "nenhum abastecimento", mas abasteceu às 10h20 desse dia. O Combustível lança
--    a carreta como carreta_transportadora, pela placa, sem equipamento_id: 516 saídas das CS-002 a
--    CS-005 (cada uma casa com uma máquina só; as outras 668 sem máquina são carretas de terceiros
--    fora do cadastro). A ficha junta as saídas ligadas à máquina e as lançadas só pela placa que
--    casa com ela e com nenhuma outra máquina ativa (placa ou descrição, só letras e números, 7+).
-- 2. "Valor da aquisição mais resumido, só o número total": a compra pelo Financeiro (categoria
--    Aquisição de Equipamento, config mapa.categorias_aquisicao) sai dos quatro períodos de
--    despesas e vira um total à parte ('gasto_manutencao'.'aquisicao'); a divisão por categoria
--    sai da ficha. O valor do cadastro ('aquisicao', v1.14b) continua.
--
-- Refeita a partir da função no banco (v1.14b, com valor_aquisicao). O arquivo v1.14b foi
-- renomeado de 20261016110000 para 20261016113000: a versão colidia com a v1.14 das carretas e
-- ficou sem registro em schema_migrations; é registrado aqui.

insert into public.configuracoes (chave, valor, descricao)
values ('mapa.categorias_aquisicao',
        '["efa92316-8d8e-28f0-bec6-adf14bb6e438"]'::jsonb,
        'Categorias financeiras que a ficha da máquina no Mapa mostra como aquisição (um total), fora das despesas.')
on conflict (chave) do nothing;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261016113000', 'modulo_mapa_v1_14b_valor_aquisicao')
on conflict (version) do nothing;

create or replace function public.fn_mapa_ficha_equipamento(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
  v_abast jsonb; v_consumo jsonb; v_os jsonb; v_gasto jsonb; v_custo_os jsonb; v_aquisicao jsonb;
  v_txt text;
  v_cats_aquisicao uuid[];
  v_saidas uuid[];
begin
  perform public.fn_mapa_exigir('ver');
  select jsonb_build_object('valor', e.valor_aquisicao, 'data', e.data_aquisicao)
  into v_aquisicao
  from public.equipamentos e where e.id = p_id;
  if v_aquisicao is null then
    raise exception 'Equipamento não encontrado';
  end if;

  -- Placa e descrição da máquina, só letras e números: o Combustível lança a carreta pela placa.
  select regexp_replace(upper(coalesce(e.placa, '') || ' ' || coalesce(e.descricao, '')), '[^A-Z0-9]', '', 'g')
  into v_txt from public.equipamentos e where e.id = p_id;

  select coalesce(array_agg(x::uuid), '{}') into v_cats_aquisicao
  from jsonb_array_elements_text(coalesce(
    (select valor from public.configuracoes where chave = 'mapa.categorias_aquisicao'), '[]'::jsonb)) x;

  -- Abastecimentos da máquina: ligados a ela, ou lançados só pela placa (carreta da
  -- transportadora) quando a placa casa com esta máquina e com nenhuma outra ativa.
  select coalesce(array_agg(s.id), '{}') into v_saidas
  from public.combustivel_saidas s
  where s.excluido_em is null
    and (s.equipamento_id = p_id
      or (s.equipamento_id is null
          and length(regexp_replace(upper(coalesce(s.placa, '')), '[^A-Z0-9]', '', 'g')) >= 7
          and v_txt like '%' || regexp_replace(upper(s.placa), '[^A-Z0-9]', '', 'g') || '%'
          and not exists (
            select 1 from public.equipamentos o
            where o.ativo and o.id <> p_id
              and regexp_replace(upper(coalesce(o.placa, '') || ' ' || coalesce(o.descricao, '')), '[^A-Z0-9]', '', 'g')
                  like '%' || regexp_replace(upper(s.placa), '[^A-Z0-9]', '', 'g') || '%')));

  select jsonb_build_object('data', s.data, 'litros', s.litros, 'valor', s.valor_total,
                            'tanque', t.nome, 'medicao', s.medicao, 'tipo_medicao', s.tipo_medicao)
  into v_abast
  from public.combustivel_saidas s
  left join public.tanques t on t.id = s.tanque_id
  where s.id = any (v_saidas)
  order by s.data desc limit 1;

  select jsonb_build_object('litros', coalesce(sum(s.litros), 0), 'valor', coalesce(sum(s.valor_total), 0),
                            'abastecimentos', count(*))
  into v_consumo
  from public.combustivel_saidas s
  where s.id = any (v_saidas)
    and (s.data at time zone 'America/Rio_Branco')::date > v_hoje - 30;

  select jsonb_build_object('numero', o.numero, 'tipo', o.tipo, 'status', o.status,
                            'abertura', o.data_abertura, 'conclusao', o.data_conclusao,
                            'descricao', coalesce(nullif(btrim(o.descricao), ''), o.defeito_reportado),
                            'custo', o.custo_total)
  into v_os
  from public.ordens_servico o
  where o.equipamento_id = p_id and o.excluido_em is null and o.status <> 'cancelada'
  order by coalesce(o.data_conclusao, o.data_abertura) desc nulls last limit 1;

  select jsonb_build_object(
    'total', coalesce(sum(o.custo_total), 0),
    'ultimos_12_meses', coalesce(sum(o.custo_total) filter (where o.data_conclusao >= (v_mes - interval '11 months')::date), 0),
    'ano', coalesce(sum(o.custo_total) filter (where extract(year from o.data_conclusao) = extract(year from v_hoje)), 0),
    'mes_passado', coalesce(sum(o.custo_total) filter (where date_trunc('month', o.data_conclusao)::date = (v_mes - interval '1 month')::date), 0),
    'quantidade', count(*))
  into v_custo_os
  from public.ordens_servico o
  where o.equipamento_id = p_id and o.excluido_em is null and o.status = 'concluida'
    and o.data_conclusao is not null;

  with recursive centros as (
    select c.id from public.centros_custo c where c.equipamento_id = p_id
    union
    select f.id from public.centros_custo f join centros on f.pai_id = centros.id
  )
  select jsonb_build_object(
    'total', coalesce(sum(r.valor) filter (where not r.aquisicao), 0),
    'ultimos_12_meses', coalesce(sum(r.valor) filter (where not r.aquisicao and r.mes_competencia >= (v_mes - interval '11 months')::date), 0),
    'ano', coalesce(sum(r.valor) filter (where not r.aquisicao and extract(year from r.mes_competencia) = extract(year from v_hoje)), 0),
    'mes_passado', coalesce(sum(r.valor) filter (where not r.aquisicao and r.mes_competencia = (v_mes - interval '1 month')::date), 0),
    'aquisicao', coalesce(sum(r.valor) filter (where r.aquisicao), 0),
    'mes_passado_ref', (v_mes - interval '1 month')::date,
    'ano_ref', extract(year from v_hoje)::int,
    'tem_centro', exists (select 1 from centros))
  into v_gasto
  from (
    select r0.valor, r0.mes_competencia, coalesce(r0.categoria_id = any (v_cats_aquisicao), false) as aquisicao
    from public.vw_custo_rateios r0
    where r0.centro_custo_id in (select id from centros)
  ) r;

  return jsonb_build_object('ultimo_abastecimento', v_abast, 'consumo_30_dias', v_consumo,
                            'ultima_manutencao', v_os, 'gasto_manutencao', v_gasto,
                            'custo_os', v_custo_os, 'aquisicao', v_aquisicao);
end $$;

revoke all on function public.fn_mapa_ficha_equipamento(uuid) from public, anon;
grant execute on function public.fn_mapa_ficha_equipamento(uuid) to authenticated;
