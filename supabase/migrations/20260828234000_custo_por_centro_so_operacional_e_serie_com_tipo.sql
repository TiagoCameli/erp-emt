-- =============================================================
-- Custo por centro de custo: so natureza operacional, e a serie obedece o
-- filtro de tipo de centro
--
-- ============================================================
-- BUG 1 DESTA MIGRATION: a natureza nao era filtrada
-- ============================================================
-- `fn_rel_custo_receita` exige `coalesce(cat.natureza,'operacional') =
-- 'operacional'` desde 27/08/2026. `fn_rel_custo_centro_custo`, que responde a
-- MESMA pergunta do lado a pagar, nao filtrava nada. As duas telas mostravam
-- numeros diferentes para o mesmo mes e o mesmo centro.
--
-- Medido em 28/08/2026, mes a mes, com as duas RPCs no mesmo periodo:
--   20 dos 21 meses divergiam, R$ 63.021,72 no total, que fecha exatamente com
--     natureza `financeira`   : R$ 25.721,72 (414 rateios, tarifa bancaria)
--     natureza `movimentacao` : R$ 37.300,00 (1 lancamento, LAN-2026-3680,
--                               "Pagamento de Emprestimo" parado no Escritorio
--                               Central)
--
-- A regra escrita esta na migration 20260822180000: `movimentacao` e "principal
-- de aplicacao e emprestimo, FORA do resultado" e `financeira` e "resultado, mas
-- nao e da obra". Custo POR CENTRO DE CUSTO e a leitura da obra, entao as duas
-- ficam fora e a funcao passa a repetir o corte da gemea, literalmente.
--
-- As TRES funcoes de custo por centro passam a concordar: a da tabela
-- (`fn_rel_custo_centro_custo`), a do grafico (`fn_rel_custo_centro_serie`) e a
-- que diz quando o centro comecou (`fn_rel_custo_centro_vida`). Com uma delas de
-- fora, a linha do grafico e o cartao ao lado contariam coisas diferentes.
--
-- ============================================================
-- BUG 2 DESTA MIGRATION: a serie nao recebia o filtro de tipo de centro
-- ============================================================
-- Os cartoes filtram por tipo de centro (obra / manutencao / escritorio); o
-- grafico nao, porque a RPC dele nem tinha o parametro. Medido em 28/08/2026,
-- com as 17 raizes escolhidas:
--   cartao (p_tipos_centro = obra) : R$ 45.625.418,30
--   serie  (sem parametro nenhum)  : R$ 55.038.244,19
-- A serie tambem nao excluia o centro raiz de tipo `financeiro`, que a tabela
-- exclui SEMPRE desde 27/08/2026 (a analise de emprestimo vive em Creditos):
-- eram R$ 2.843.964,90 desenhados num grafico que o cartao ao lado nao contava.
--
-- Assinatura NOVA (`p_tipos_centro text[]` no fim), entao vai DROP + CREATE +
-- RE-GRANT: sem o grant a tela nao da erro, ela fica em branco.
--
-- ============================================================
-- BUG 3 DESTA MIGRATION: a serie somava duas vezes quando raiz e etapa vinham
-- juntas
-- ============================================================
-- `fn_rel_custo_centro_custo` resolve isso com `distinct on (centro_id) order by
-- nivel_grupo desc` -- cada rateio conta uma vez so, no escolhido MAIS FUNDO. A
-- serie usava `join alvos` cru, entao raiz + etapa dela no mesmo filtro somariam
-- a etapa nas duas linhas. Hoje `centrosEfetivos` (TypeScript) nao deixa isso
-- chegar aqui, e e exatamente por isso que o defeito nao aparecia na tela; a
-- igualdade entre as duas RPCs passa a valer sem depender do cliente.
-- =============================================================

-- ---------- 1. a tabela ----------
create or replace function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null,
  p_centros uuid[] default null,
  p_categorias uuid[] default null,
  p_fornecedores uuid[] default null,
  p_formas uuid[] default null,
  p_sem_forma boolean default false,
  p_status text[] default null,
  p_excluir_previsto boolean default false,
  p_tipos_centro text[] default null
)
returns table(centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    select c.id as centro_id, c.id as raiz_id
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_id
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  pares as (
    select escolhido.id as grupo_id, s.id as centro_id, c.nivel as nivel_grupo
    from unnest(coalesce(p_centros, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
    join public.centros_custo c on c.id = escolhido.id
  ),
  -- A etapa ganha da raiz: `nivel desc` pega o escolhido MAIS FUNDO, que e o
  -- recorte mais fino pedido. Sem isto, escolher raiz + etapa junto somaria a
  -- etapa dentro da raiz e a etapa escolhida nao apareceria em linha propria.
  alvos as (
    select distinct on (centro_id) centro_id as id, grupo_id
    from pares
    order by centro_id, nivel_grupo desc
  )
  select grupo.id, grupo.nome, grupo.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.categorias_financeiras cat on cat.id = l.categoria_id
  left join raizes a on a.centro_id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = a.raiz_id
  left join alvos on alvos.id = r.centro_custo_id
  left join public.centros_custo grupo
    on grupo.id = coalesce(alvos.grupo_id, a.raiz_id)
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    -- O centro financeiro (Emprestimos) fica fora: a analise dele vive no
    -- relatorio de Creditos, por decisao do Tiago em 27/08/2026.
    and coalesce(raiz.tipo, '') <> 'financeiro'
    -- SO operacional, igual a `fn_rel_custo_receita`. `financeira` (tarifa,
    -- juros) e resultado da empresa mas nao e custo de obra; `movimentacao`
    -- (principal de emprestimo e de aplicacao) nao e resultado nenhum.
    and coalesce(cat.natureza, 'operacional') = 'operacional'
    and (not coalesce(p_excluir_previsto, false) or l.status <> 'previsto')
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (
      coalesce(cardinality(p_centros), 0) = 0
      or alvos.id is not null
    )
    and (
      coalesce(cardinality(p_categorias), 0) = 0
      or coalesce(r.categoria_id, l.categoria_id) = any(p_categorias)
    )
    and (
      coalesce(cardinality(p_fornecedores), 0) = 0
      or l.fornecedor_id = any(p_fornecedores)
    )
    and (coalesce(cardinality(p_status), 0) = 0 or l.status = any(p_status))
    and (
      (coalesce(cardinality(p_formas), 0) = 0 and not coalesce(p_sem_forma, false))
      or l.forma_pagamento_id = any(coalesce(p_formas, '{}'::uuid[]))
      or (coalesce(p_sem_forma, false) and l.forma_pagamento_id is null)
    )
    and (
      coalesce(cardinality(p_tipos_centro), 0) = 0
      or raiz.tipo = any(p_tipos_centro)
    )
  group by grupo.id, grupo.nome, grupo.codigo
$function$;

-- ---------- 2. o grafico ----------
-- Assinatura nova: DROP e CREATE, nao replace.
drop function if exists public.fn_rel_custo_centro_serie(
  uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean);

create function public.fn_rel_custo_centro_serie(
  p_centros uuid[],
  p_inicio date default null,
  p_fim date default null,
  p_categorias uuid[] default null,
  p_fornecedores uuid[] default null,
  p_formas uuid[] default null,
  p_sem_forma boolean default false,
  p_status text[] default null,
  p_excluir_previsto boolean default false,
  p_tipos_centro text[] default null
)
returns table(centro_custo_id uuid, nome text, codigo text, mes text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    select c.id as centro_id, c.id as raiz_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  pares as (
    select escolhido.id as grupo_id, s.id as descendente, c.nivel as nivel_grupo
    from unnest(coalesce(p_centros, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
    join public.centros_custo c on c.id = escolhido.id
  ),
  -- Mesma regra da tabela: cada centro conta UMA vez, no escolhido mais fundo.
  alvos as (
    select distinct on (descendente) descendente, grupo_id as centro_id
    from pares
    order by descendente, nivel_grupo desc
  ),
  custo as (
    select a.centro_id, l.mes_competencia as mes, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join alvos a on a.descendente = r.centro_custo_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      -- Os dois cortes que a tabela ja fazia e o grafico nao.
      and coalesce(rz.raiz_tipo, '') <> 'financeiro'
      and coalesce(cat.natureza, 'operacional') = 'operacional'
      and (not coalesce(p_excluir_previsto, false) or l.status <> 'previsto')
      and (
        coalesce(cardinality(p_categorias), 0) = 0
        or coalesce(r.categoria_id, l.categoria_id) = any(p_categorias)
      )
      and (
        coalesce(cardinality(p_fornecedores), 0) = 0
        or l.fornecedor_id = any(p_fornecedores)
      )
      and (coalesce(cardinality(p_status), 0) = 0 or l.status = any(p_status))
      and (
        (coalesce(cardinality(p_formas), 0) = 0 and not coalesce(p_sem_forma, false))
        or l.forma_pagamento_id = any(coalesce(p_formas, '{}'::uuid[]))
        or (coalesce(p_sem_forma, false) and l.forma_pagamento_id is null)
      )
      and (
        coalesce(cardinality(p_tipos_centro), 0) = 0
        or rz.raiz_tipo = any(p_tipos_centro)
      )
    group by a.centro_id, l.mes_competencia
  ),
  extremos as (
    select centro_id, min(mes) as primeiro, max(mes) as ultimo
    from custo
    group by centro_id
  ),
  limites as (
    select
      e.centro_id,
      greatest(
        coalesce(date_trunc('month', p_inicio)::date, e.primeiro),
        e.primeiro
      ) as inicio,
      coalesce(
        (date_trunc('month', p_fim) - interval '1 month')::date,
        e.ultimo
      ) as fim
    from extremos e
  ),
  meses as (
    select li.centro_id, generate_series(li.inicio, li.fim, interval '1 month')::date as mes
    from limites li
    where li.inicio is not null
      and li.fim is not null
      and li.inicio <= li.fim
  )
  select m.centro_id, c.nome, c.codigo, to_char(m.mes, 'YYYY-MM'), coalesce(cu.total, 0)
  from meses m
  join public.centros_custo c on c.id = m.centro_id
  left join custo cu on cu.centro_id = m.centro_id and cu.mes = m.mes
  order by c.nome, m.mes
$function$;

-- RE-GRANT: funcao nova nao herda privilegio nenhum, e sem isto a tela do
-- grafico fica em branco SEM erro na tela.
revoke execute on function public.fn_rel_custo_centro_serie(
  uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) from public;
grant execute on function public.fn_rel_custo_centro_serie(
  uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) to authenticated;

-- ---------- 3. a vida do centro ----------
-- Mesmos cortes: o primeiro mes do centro tem de ser o primeiro mes que a tabela
-- e o grafico CONTAM. Sem isto, uma tarifa bancaria de 2024 abriria a janela do
-- modo "vida" um ano antes do primeiro custo desenhado.
create or replace function public.fn_rel_custo_centro_vida(p_centros uuid[])
returns table(centro_custo_id uuid, primeiro_mes date)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    select c.id as centro_id, c.id as raiz_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  )
  select escolhido.id, min(l.mes_competencia)
  from unnest(coalesce(p_centros, '{}'::uuid[])) as escolhido(id)
  cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  join public.lancamento_rateios r on r.centro_custo_id = s.id
  join public.lancamentos l on l.id = r.lancamento_id
  left join raizes rz on rz.centro_id = r.centro_custo_id
  left join public.categorias_financeiras cat on cat.id = l.categoria_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and coalesce(rz.raiz_tipo, '') <> 'financeiro'
    and coalesce(cat.natureza, 'operacional') = 'operacional'
  group by escolhido.id
$function$;

comment on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) is
  'Custo a pagar por centro de custo, agrupado no centro escolhido mais fundo. So natureza operacional e sem o centro raiz financeiro, igual a fn_rel_custo_receita.';
comment on function public.fn_rel_custo_centro_serie(uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) is
  'Serie mensal do custo de cada centro escolhido. Mesmos cortes de fn_rel_custo_centro_custo (tipo de centro, raiz financeira fora, so natureza operacional), para o grafico e o cartao contarem a mesma coisa.';
comment on function public.fn_rel_custo_centro_vida(uuid[]) is
  'Primeiro mes com custo de cada centro escolhido, pelos mesmos cortes de fn_rel_custo_centro_custo.';
