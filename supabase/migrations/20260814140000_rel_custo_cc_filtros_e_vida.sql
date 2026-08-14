-- Filtros de análise no custo por centro de custo, e as duas funções da "vida do
-- centro" (o acumulado de uma obra desde o primeiro lançamento dela).
--
-- fn_rel_custo_centro_custo GANHA parâmetros, e todos com default que preserva o
-- comportamento de hoje. Em especial `p_excluir_previsto` é FALSE por padrão,
-- porque o relatório de hoje inclui previsto (ele só exclui cancelado): fazer a
-- exclusão o padrão mudaria um número de dinheiro sem ninguém pedir, e como a base
-- tem 0 previsto em 14/08/2026 a mudança não apareceria na tela e só morderia no
-- dia do primeiro previsto lançado.
--
-- A assinatura muda, então `create or replace` não basta (ele criaria uma
-- SOBRECARGA, e as chamadas antigas continuariam na função velha, sem os filtros).
-- Drop e create no mesmo arquivo, que roda numa transação só: a janela em que a
-- função não existe é sub-segundo e não fica commitada.
--
-- ATENÇÃO, LEIA A 20260814150000 ANTES DESTA: o `drop` de (date, date) abaixo virou
-- no-op, porque o painel de Gestão substituiu a função por uma de 4 parâmetros no
-- banco vivo enquanto este trabalho estava em curso. O resultado foi DUAS
-- sobrecargas e uma chamada ambígua que quebrou o relatório em runtime. A
-- 20260814150000 é o conserto e é ela que define a função que vale hoje.

drop function if exists public.fn_rel_custo_centro_custo(date, date);

create function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null,
  p_categoria uuid default null,
  p_fornecedor uuid default null,
  p_excluir_previsto boolean default false,
  p_tipo_centro text default null
)
returns table (centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select r.centro_custo_id, cc.nome, cc.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (not coalesce(p_excluir_previsto, false) or l.status <> 'previsto')
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (p_categoria is null or l.categoria_id = p_categoria)
    and (p_fornecedor is null or l.fornecedor_id = p_fornecedor)
    and (p_tipo_centro is null or cc.tipo = p_tipo_centro)
  group by r.centro_custo_id, cc.nome, cc.codigo
$function$;

-- Primeiro mês de competência com custo NAQUELE centro: o início da vida dele.
--
-- Null quando o centro nunca teve lançamento, e quem chama tem que tratar isso
-- como "sem período" em vez de inventar uma data ou cair no total geral: um centro
-- sem lançamento não tem vida, e mostrar o total de outra coisa no lugar seria
-- trocar a pergunta do usuário por outra.
create or replace function public.fn_rel_custo_centro_vida(p_centro uuid)
returns date
language sql
stable
set search_path to ''
as $function$
  select min(l.mes_competencia)
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id = p_centro
    and l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
$function$;

-- Série mensal de um centro, para o gráfico do modo vida.
--
-- Devolve mês sem custo como ZERO em vez de omitir a linha: série com buraco faz o
-- gráfico ligar dois meses distantes por uma reta, e some com a informação de que
-- a obra parou naquele intervalo — que numa obra rodoviária é justamente o que se
-- quer ver.
create or replace function public.fn_rel_custo_centro_serie(
  p_centro uuid,
  p_inicio date default null,
  p_fim date default null
)
returns table (mes text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with extremos as (
    select min(l.mes_competencia) as primeiro, max(l.mes_competencia) as ultimo
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where r.centro_custo_id = p_centro
      and l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
  ),
  limites as (
    select
      coalesce(date_trunc('month', p_inicio)::date, e.primeiro) as inicio,
      coalesce(date_trunc('month', p_fim)::date, e.ultimo) as fim
    from extremos e
  ),
  meses as (
    select generate_series(l.inicio, l.fim, interval '1 month')::date as mes
    from limites l
    where l.inicio is not null and l.fim is not null and l.inicio <= l.fim
  ),
  custo as (
    select l.mes_competencia as mes, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where r.centro_custo_id = p_centro
      and l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
    group by l.mes_competencia
  )
  select to_char(m.mes, 'YYYY-MM'), coalesce(c.total, 0)
  from meses m
  left join custo c on c.mes = m.mes
  order by m.mes
$function$;

comment on function public.fn_rel_custo_centro_vida(uuid) is
  'Primeiro mes de competencia com custo no centro. Null quando o centro nunca teve lancamento.';
comment on function public.fn_rel_custo_centro_serie(uuid, date, date) is
  'Serie mensal do centro para o grafico do modo vida. Mes sem custo sai como zero, nao omitido.';

-- Sem security definer nas três: rodam como o chamador, então a RLS do usuário
-- continua valendo. Grants explícitos, anon não recebe nada.
revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid, boolean, text) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid, boolean, text) to authenticated;
revoke all on function public.fn_rel_custo_centro_vida(uuid) from public;
grant execute on function public.fn_rel_custo_centro_vida(uuid) to authenticated;
revoke all on function public.fn_rel_custo_centro_serie(uuid, date, date) from public;
grant execute on function public.fn_rel_custo_centro_serie(uuid, date, date) to authenticated;
