-- Módulo Mapa v1.12: dados da ficha que abre ao lado do objeto
--
-- Pedido do Tiago (16/10/2026): tocar na pilha ou na máquina abre o card ao lado dela, "com
-- informações corretas". Conferido no banco em 16/10:
--
-- 1. Pilha: o saldo bate (entradas menos saídas não excluídas) e as três ativas estão em
--    toneladas, mas o card só tinha nome e coordenada. fn_mapa_estado passa a devolver o material
--    (insumo), a sigla da unidade dele, o total que entrou e o local.
-- 2. Máquina: o "Gasto em manutenção (Financeiro)" da US-001 dá R$ 0,00 (um rateio só no centro
--    dela, R$ 118,32, fora das categorias de manutenção), enquanto as 3 OS concluídas somam
--    R$ 10.612,97 de custo. O v1.10 escolheu o Financeiro porque as OS subcontam (peça comprada
--    direto e serviço de terceiro não passam pela OS); as duas fontes medem coisas diferentes e
--    podem se sobrepor, então a ficha mostra as duas, separadas, sem somar. Custo das OS =
--    custo_total das concluídas, pela data de conclusão, nos mesmos quatro períodos.

-- fn_mapa_estado: material, unidade, entrada e local da pilha
do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_velho text;
begin
  v_velho := $t$'id', p.id, 'nome', p.nome, 'saldo', p.saldo,$t$;
  if (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho) <> 1 then
    raise exception 'fn_mapa_estado sem a lista de pilhas esperada; nada alterado';
  end if;
  v_def := replace(v_def, v_velho, $t$'id', p.id, 'nome', p.nome, 'saldo', p.saldo,
        'total_entrada', p.total_entrada, 'localidade_id', p.localidade_id,
        'insumo', (select i.nome from public.insumos i where i.id = p.insumo_id),
        'unidade', (select u.sigla from public.insumos i join public.unidades_medida u on u.id = i.unidade_id
                    where i.id = p.insumo_id),$t$);
  execute v_def;
end
$migracao$;

create or replace function public.fn_mapa_ficha_equipamento(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
  v_cats uuid[];
  v_abast jsonb; v_consumo jsonb; v_os jsonb; v_gasto jsonb; v_custo_os jsonb;
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
    'tem_centro', exists (select 1 from centros))
  into v_gasto
  from public.vw_custo_rateios r
  where r.centro_custo_id in (select id from centros) and r.categoria_id = any (v_cats);

  return jsonb_build_object('ultimo_abastecimento', v_abast, 'consumo_30_dias', v_consumo,
                            'ultima_manutencao', v_os, 'gasto_manutencao', v_gasto,
                            'custo_os', v_custo_os);
end $$;

revoke all on function public.fn_mapa_ficha_equipamento(uuid) from public, anon;
grant execute on function public.fn_mapa_ficha_equipamento(uuid) to authenticated;
