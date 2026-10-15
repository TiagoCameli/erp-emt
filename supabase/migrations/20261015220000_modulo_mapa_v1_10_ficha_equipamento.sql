-- Módulo Mapa v1.10: números da máquina na ficha
--
-- Pedido do Tiago (15/10/2026): ao tocar na máquina, o card mostra último abastecimento, última
-- manutenção, consumo de combustível nos últimos 30 dias (máquina própria) e o total gasto em
-- manutenção desde sempre, nos últimos 12 meses, no ano vigente e no mês passado.
--
-- Fonte do gasto em manutenção: o Financeiro, não as OS. Medido em 15/10: no CB-001 + PC-001 a
-- categoria "Manutenção de equipamentos" rateada no centro de custo da máquina soma R$ 110 mil,
-- contra R$ 22,6 mil de custo_total nas ordens de serviço (peça comprada direto e serviço de
-- terceiro não passam pela OS). O centro da máquina também carrega compra/financiamento (as
-- carretas CS-00x passam de R$ 1,6 mi), por isso só entram as categorias de manutenção, lidas da
-- configuração mapa.categorias_manutencao (ids, não nomes). Mesma view dos relatórios de custo
-- por centro (vw_custo_rateios, por competência), na subárvore do centro da máquina.
--
-- Carregada sob demanda (uma máquina por vez), fora de fn_mapa_estado.

insert into public.configuracoes (chave, valor, descricao)
values ('mapa.categorias_manutencao',
        '["15ac7507-c642-4cfa-9af7-1061f6798080", "dccf8899-f25f-c2c3-46c4-09f2585581a7"]'::jsonb,
        'Categorias financeiras somadas como gasto em manutenção na ficha da máquina no Mapa (Manutenção de equipamentos, Manutenção).')
on conflict (chave) do nothing;

create or replace function public.fn_mapa_ficha_equipamento(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
  v_cats uuid[];
  v_abast jsonb; v_consumo jsonb; v_os jsonb; v_gasto jsonb;
begin
  perform public.fn_mapa_exigir('ver');
  if not exists (select 1 from public.equipamentos where id = p_id) then
    raise exception 'Equipamento não encontrado';
  end if;

  select coalesce(array_agg(x::uuid), '{}') into v_cats
  from jsonb_array_elements_text(coalesce(
    (select valor from public.configuracoes where chave = 'mapa.categorias_manutencao'), '[]'::jsonb)) x;

  select jsonb_build_object('data', s.data, 'litros', s.litros, 'valor', s.valor_total,
                            'tanque', t.nome, 'medicao', s.medicao, 'tipo_medicao', s.tipo_medicao)
  into v_abast
  from public.combustivel_saidas s
  left join public.tanques t on t.id = s.tanque_id
  where s.equipamento_id = p_id and s.excluido_em is null
  order by s.data desc limit 1;

  select jsonb_build_object('litros', coalesce(sum(s.litros), 0), 'valor', coalesce(sum(s.valor_total), 0),
                            'abastecimentos', count(*))
  into v_consumo
  from public.combustivel_saidas s
  where s.equipamento_id = p_id and s.excluido_em is null
    and (s.data at time zone 'America/Rio_Branco')::date > v_hoje - 30;

  select jsonb_build_object('numero', o.numero, 'tipo', o.tipo, 'status', o.status,
                            'abertura', o.data_abertura, 'conclusao', o.data_conclusao,
                            'descricao', coalesce(nullif(btrim(o.descricao), ''), o.defeito_reportado),
                            'custo', o.custo_total)
  into v_os
  from public.ordens_servico o
  where o.equipamento_id = p_id and o.excluido_em is null and o.status <> 'cancelada'
  order by coalesce(o.data_conclusao, o.data_abertura) desc nulls last limit 1;

  with recursive centros as (
    select c.id from public.centros_custo c where c.equipamento_id = p_id
    union
    select f.id from public.centros_custo f join centros on f.pai_id = centros.id
  )
  select jsonb_build_object(
    'total', coalesce(sum(r.valor), 0),
    'ultimos_12_meses', coalesce(sum(r.valor) filter (where r.mes_competencia >= (v_mes - interval '11 months')::date), 0),
    'ano', coalesce(sum(r.valor) filter (where extract(year from r.mes_competencia) = extract(year from v_hoje)), 0),
    'mes_passado', coalesce(sum(r.valor) filter (where r.mes_competencia = (v_mes - interval '1 month')::date), 0),
    'mes_passado_ref', (v_mes - interval '1 month')::date,
    'ano_ref', extract(year from v_hoje)::int,
    'tem_centro', exists (select 1 from centros))
  into v_gasto
  from public.vw_custo_rateios r
  where r.centro_custo_id in (select id from centros) and r.categoria_id = any (v_cats);

  return jsonb_build_object('ultimo_abastecimento', v_abast, 'consumo_30_dias', v_consumo,
                            'ultima_manutencao', v_os, 'gasto_manutencao', v_gasto);
end $$;

revoke all on function public.fn_mapa_ficha_equipamento(uuid) from public, anon;
grant execute on function public.fn_mapa_ficha_equipamento(uuid) to authenticated;
