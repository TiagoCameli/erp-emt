-- Módulo Mapa v1.14: valor de aquisição do equipamento no cadastro e na ficha do Mapa
--
-- Pedido do Tiago (16/10/2026): "no card quero que adicione o valor de aquisição do equipamento,
-- se tiver". O cadastro só guardava a data de aquisição; nenhuma tabela tinha o valor. Coluna
-- nova, opcional (nula = não informado), em reais com 2 casas. A ficha do Mapa
-- (fn_mapa_ficha_equipamento, refeita a partir da v1.13 que está no banco) devolve
-- 'aquisicao' = {valor, data}; a tela mostra a linha só quando há valor.

alter table public.equipamentos
  add column if not exists valor_aquisicao numeric(14,2)
    constraint equipamentos_valor_aquisicao_nao_negativo check (valor_aquisicao >= 0);

comment on column public.equipamentos.valor_aquisicao is 'Valor pago na aquisição (R$). Nulo = não informado.';

create or replace function public.fn_mapa_ficha_equipamento(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
  v_abast jsonb; v_consumo jsonb; v_os jsonb; v_gasto jsonb; v_custo_os jsonb; v_aquisicao jsonb;
begin
  perform public.fn_mapa_exigir('ver');
  select jsonb_build_object('valor', e.valor_aquisicao, 'data', e.data_aquisicao)
  into v_aquisicao
  from public.equipamentos e where e.id = p_id;
  if v_aquisicao is null then
    raise exception 'Equipamento não encontrado';
  end if;

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
    'total', coalesce(sum(r.valor), 0),
    'ultimos_12_meses', coalesce(sum(r.valor) filter (where r.mes_competencia >= (v_mes - interval '11 months')::date), 0),
    'ano', coalesce(sum(r.valor) filter (where extract(year from r.mes_competencia) = extract(year from v_hoje)), 0),
    'mes_passado', coalesce(sum(r.valor) filter (where r.mes_competencia = (v_mes - interval '1 month')::date), 0),
    'mes_passado_ref', (v_mes - interval '1 month')::date,
    'ano_ref', extract(year from v_hoje)::int,
    'tem_centro', exists (select 1 from centros),
    'por_categoria', coalesce((
      select jsonb_agg(jsonb_build_object('categoria', x.categoria, 'total', x.total) order by x.total desc)
      from (
        select coalesce(k.nome, 'Sem categoria') as categoria, sum(r2.valor) as total
        from public.vw_custo_rateios r2
        left join public.categorias_financeiras k on k.id = r2.categoria_id
        where r2.centro_custo_id in (select id from centros)
        group by 1
      ) x), '[]'::jsonb))
  into v_gasto
  from public.vw_custo_rateios r
  where r.centro_custo_id in (select id from centros);

  return jsonb_build_object('ultimo_abastecimento', v_abast, 'consumo_30_dias', v_consumo,
                            'ultima_manutencao', v_os, 'gasto_manutencao', v_gasto,
                            'custo_os', v_custo_os, 'aquisicao', v_aquisicao);
end $$;

revoke all on function public.fn_mapa_ficha_equipamento(uuid) from public, anon;
grant execute on function public.fn_mapa_ficha_equipamento(uuid) to authenticated;
