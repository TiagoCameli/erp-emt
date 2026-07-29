-- Bloco 3: custo por centro de custo ganha a dimensao MES DE REFERENCIA.
--
-- Decisao do Tiago (29/07/2026): como toda OC vira lancamento e existem
-- lancamentos avulsos, o gasto da obra e o que esta nos lancamentos, rateado por
-- centro de custo e agrupado por mes de referencia. Antes esta funcao somava
-- tudo, sem recorte de mes: respondia "quanto essa obra ja custou" mas nunca
-- "quanto ela custou em julho".
--
-- Isso substitui o modelo "base CONSUMO" da Fase 8 (consumo de estoque + folha +
-- lancamentos de origem os/diaria/manual, com a compra de fora para nao contar
-- duas vezes). Com o modulo de Estoque fora do escopo, nunca haveria consumo
-- registrado, e o custo apareceria menor que a realidade.
--
-- Assinatura muda (ganha o periodo), entao a antiga sai para nao virar overload
-- ambiguo. Periodo nulo = todos os meses, para o acumulado continuar possivel.

drop function if exists public.fn_rel_custo_centro_custo();

create or replace function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null
)
returns table(centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $$
  select r.centro_custo_id, cc.nome, cc.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
  group by r.centro_custo_id, cc.nome, cc.codigo
$$;

revoke all on function public.fn_rel_custo_centro_custo(date, date) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date) to authenticated;

comment on function public.fn_rel_custo_centro_custo(date, date) is
  'Custo por centro de custo pelo MES DE REFERENCIA do lancamento (regime de competencia). Periodo nulo soma todos os meses.';

-- Serie por mes, para o painel de Gestao mostrar a evolucao sem trazer linha bruta.
create or replace function public.fn_rel_custo_por_mes(p_meses int default 6)
returns table(mes date, total numeric, lancamentos int)
language sql
stable
set search_path to ''
as $$
  select
    l.mes_competencia as mes,
    sum(r.valor) as total,
    count(distinct l.id)::int as lancamentos
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and l.mes_competencia >= (
      date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date
      - ((greatest(coalesce(p_meses, 6), 1) - 1) || ' months')::interval
    )::date
  group by l.mes_competencia
  order by l.mes_competencia
$$;

revoke all on function public.fn_rel_custo_por_mes(int) from public;
grant execute on function public.fn_rel_custo_por_mes(int) to authenticated;

comment on function public.fn_rel_custo_por_mes(int) is
  'Custo total por mes de referencia nos ultimos N meses (regime de competencia). Base do painel de Gestao.';
