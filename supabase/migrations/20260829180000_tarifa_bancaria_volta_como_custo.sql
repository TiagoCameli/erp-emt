-- =============================================================
-- A tarifa bancaria volta a ser custo, no centro em que ela esta rateada
--
-- DECISAO DO TIAGO, 29/08/2026, textual: "as tarifas bancarias devem ser do
-- escritorio central mesmo".
--
-- ============================================================
-- O QUE MUDOU
-- ============================================================
-- Em 28/08/2026 a migration `20260828234000` alinhou a familia de custo em
-- `coalesce(cat.natureza, 'operacional') = 'operacional'`, copiando o corte que
-- `fn_rel_custo_receita` ja fazia. O alvo era o residuo de `movimentacao` (o
-- LAN-2026-3680, principal de emprestimo parado no Escritorio Central), mas o
-- corte pegou junto a natureza `financeira` -- e com ela a Tarifa Bancaria, que
-- E despesa, E paga, E rateada num centro de custo real.
--
-- O corte passa a ser pela natureza que NAO e custo, e nao pela unica que e:
--   antes:  natureza  = 'operacional'
--   agora:  natureza <> 'movimentacao'
--
-- O CHECK da coluna e `natureza in ('operacional','financeira','movimentacao')`
-- (conferido em 29/08/2026), entao `<> 'movimentacao'` e exaustivo: ou e
-- operacional, ou e financeira. Nao ha terceira porta se abrindo por descuido.
--
-- A regra de negocio que sobra e a que interessa: `movimentacao` e principal de
-- emprestimo e de aplicacao, dinheiro que entra e sai sem virar resultado, e
-- continua FORA das sete. Isso nao esta em discussao.
--
-- ============================================================
-- MEDIDO NO BANCO EM 29/08/2026, ANTES DE ESCREVER
-- ============================================================
-- Naturezas nao operacionais com lancamento nao cancelado, por tipo:
--   a_pagar   financeira    Tarifa Banc.  415 rateios  R$    25.784,28  <- ENTRA
--   a_pagar   movimentacao  Pgto Empr.      4 rateios  R$ 2.881.264,90  <- fica fora
--   a_receber movimentacao  Financ. banc.   3 rateios  R$ 4.261.910,46  <- fica fora
--
-- Onde a tarifa esta rateada hoje:
--   Escritorio Central (raiz tipo `escritorio`)  414 rateios  R$ 25.779,09
--   009 - BR-364/AC Lote 09 & 10 (raiz `obra`)     1 rateio   R$      5,19
-- Nenhum dos dois e raiz `financeiro`, entao o outro corte da familia nao a
-- barra: ela cai no centro em que esta, que e o que o Tiago pediu. Os R$ 5,19 na
-- obra 009 sao um rateio de 25/08/2026 -- se for erro de digitacao, o conserto e
-- mover o rateio no lancamento, nao mexer na funcao.
--
-- ============================================================
-- POR QUE A RECEITA DE `fn_rel_custo_receita` CONTINUA SO OPERACIONAL
-- ============================================================
-- Essa funcao usa o corte de natureza nos DOIS lados. Medido acima: nao existe
-- NENHUM lancamento `a_receber` de natureza `financeira` na base -- a unica
-- receita nao operacional e `movimentacao` (Financiamento bancario), que sai
-- pelos dois criterios. Ou seja, abrir a receita para `financeira` nao mudaria
-- um centavo hoje; so deixaria a porta aberta.
--
-- E a porta que ficaria aberta e a errada: receita `financeira` e juro recebido
-- e rendimento de aplicacao, que e resultado da EMPRESA, nao producao de OBRA.
-- Somada na linha de receita ela inflaria a margem da obra com dinheiro que a
-- obra nao gerou. O custo `financeira` (a tarifa) tem o caminho inverso: ele TEM
-- um centro de custo pagando por ele, que e justamente o Escritorio Central.
--
-- Entao o corte fica ASSIMETRICO de proposito, e a assimetria e declarada no
-- codigo com um `case` sobre `l.tipo`, nao escondida:
--   custo   (a_pagar)   : natureza <> 'movimentacao'
--   receita (a_receber) : natureza  = 'operacional'
-- O lado do custo dessa funcao continua fechando com `fn_rel_custo_centro_custo`
-- ao centavo, que e a igualdade que a tela promete.
--
-- ============================================================
-- FORMA
-- ============================================================
-- Nenhuma assinatura muda, entao e `create or replace` nas sete e os grants
-- existentes sobrevivem (replace preserva privilegio; drop nao preservaria).
-- Cada corpo abaixo foi copiado de `pg_get_functiondef` do banco vivo
-- imediatamente antes desta migration: a unica alteracao em cada um e a linha da
-- natureza. `create or replace` apaga o resto sem reclamar, entao o corpo tem de
-- vir inteiro.
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
  -- recorte mais fino pedido.
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
    -- TUDO MENOS `movimentacao`. Principal de emprestimo e de aplicacao entra e
    -- sai do caixa sem virar resultado, entao nao e custo de ninguem. Ja a
    -- `financeira` (tarifa bancaria) e despesa paga e rateada num centro real, e
    -- por decisao do Tiago em 29/08/2026 ela pertence ao centro em que esta
    -- rateada -- o Escritorio Central.
    and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
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
create or replace function public.fn_rel_custo_centro_serie(
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
      -- Os dois cortes da familia. Ver fn_rel_custo_centro_custo.
      and coalesce(rz.raiz_tipo, '') <> 'financeiro'
      and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
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

-- ---------- 3. a vida do centro ----------
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
    and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
  group by escolhido.id
$function$;

-- ---------- 4. o custo por mes ----------
create or replace function public.fn_rel_custo_por_mes(
  p_meses integer default 6,
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null
)
returns table(mes date, total numeric, lancamentos integer)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  )
  select
    l.mes_competencia as mes,
    sum(r.valor) as total,
    count(distinct l.id)::int as lancamentos
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join raizes rz on rz.centro_id = r.centro_custo_id
  left join public.categorias_financeiras cat on cat.id = l.categoria_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    -- Os dois cortes da familia. Ver fn_rel_custo_centro_custo.
    and coalesce(rz.raiz_tipo, '') <> 'financeiro'
    and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
    and (
      p_inicio is not null
      or l.mes_competencia >= (
        date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date
        - ((greatest(coalesce(p_meses, 6), 1) - 1) || ' months')::interval
      )::date
    )
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (
      p_centro_custo is null
      or r.centro_custo_id in (select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s)
    )
    and (p_categoria is null or coalesce(r.categoria_id, l.categoria_id) = p_categoria)
  group by l.mes_competencia
  order by l.mes_competencia
$function$;

-- ---------- 5. os itens de OC ----------
create or replace function public.fn_rel_custo_itens_oc(
  p_inicio date default null,
  p_fim date default null
)
returns table(
  lancamento_id uuid, item_id uuid, centro_custo_id uuid, insumo_id uuid,
  categoria_insumo_id uuid, categoria_financeira_id uuid, grupo_id uuid,
  quantidade numeric, valor numeric
)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  lancs as (
    select l.id, l.origem_id
    from public.lancamentos l
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and l.origem = 'oc'
      and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
  ),
  item as (
    select
      l.id as lancamento_id,
      oi.id as item_id,
      oi.centro_custo_id,
      oi.insumo_id,
      ci.id as categoria_insumo_id,
      ci.categoria_financeira_id,
      ci.grupo_id,
      oi.quantidade,
      oi.quantidade * oi.preco_unitario as bruto
    from lancs l
    join public.oc_itens oi on oi.ordem_compra_id = l.origem_id
    join public.insumos i on i.id = oi.insumo_id
    join public.categorias_insumo ci on ci.id = i.categoria_id
    join public.insumo_grupos g on g.id = ci.grupo_id
    left join raizes rz on rz.centro_id = oi.centro_custo_id
    where coalesce(rz.raiz_tipo, '') <> 'financeiro'
  ),
  -- O valor do documento e a soma do RATEIO dele, que e exatamente o que
  -- `fn_rel_custo_centro_custo` conta.
  valor_do_doc as (
    select r.lancamento_id, sum(r.valor) as valor_doc
    from public.lancamento_rateios r
    join lancs l on l.id = r.lancamento_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    where coalesce(rz.raiz_tipo, '') <> 'financeiro'
    group by r.lancamento_id
  ),
  bruto_do_doc as (
    select i.lancamento_id, sum(i.bruto) as bruto_total
    from item i
    group by i.lancamento_id
  ),
  proporcional as (
    select
      i.*,
      v.valor_doc,
      case when b.bruto_total = 0 then 0
           else round(i.bruto * v.valor_doc / b.bruto_total, 2) end as valor_bruto_ajustado,
      row_number() over (
        partition by i.lancamento_id order by i.bruto desc, i.item_id
      ) as ordem_item
    from item i
    join bruto_do_doc b on b.lancamento_id = i.lancamento_id
    join valor_do_doc v on v.lancamento_id = i.lancamento_id
  ),
  sobra as (
    select p.lancamento_id,
           max(p.valor_doc) - sum(p.valor_bruto_ajustado) as resto
    from proporcional p
    group by p.lancamento_id
  )
  select
    p.lancamento_id,
    p.item_id,
    p.centro_custo_id,
    p.insumo_id,
    p.categoria_insumo_id,
    p.categoria_financeira_id,
    p.grupo_id,
    p.quantidade,
    p.valor_bruto_ajustado + case when p.ordem_item = 1 then s.resto else 0 end
  from proporcional p
  join sobra s on s.lancamento_id = p.lancamento_id
$function$;

-- ---------- 6. o custo por grupo de insumo ----------
create or replace function public.fn_rel_custo_por_grupo(
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null
)
returns table(grupo_id uuid, grupo_nome text, grupo_cor text, grupo_ordem smallint, total numeric)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  arvore as (
    select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s
  ),
  lancs as (
    select l.id, l.categoria_id
    from public.lancamentos l
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
  ),
  itens as (
    select * from public.fn_rel_custo_itens_oc(p_inicio, p_fim)
  ),
  com_insumo as (
    select g.id as grupo_id, g.nome as grupo_nome, g.cor as grupo_cor, g.ordem as grupo_ordem,
           round(sum(it.valor), 2) as total
    from itens it
    join public.insumo_grupos g on g.id = it.grupo_id
    where (p_categoria is null or it.categoria_financeira_id = p_categoria)
      and (p_centro_custo is null or it.centro_custo_id in (select id from arvore))
    group by g.id, g.nome, g.cor, g.ordem
  ),
  -- Todo rateio que NAO virou item ajustado cai aqui. Definir o balde por
  -- ausencia (e nao por `origem <> 'oc'`) e o que garante que cada rateio e
  -- contado exatamente uma vez. A tarifa bancaria nao vem de OC, entao ela cai
  -- neste balde -- que e onde despesa avulsa do escritorio ja aparece.
  sem_insumo as (
    select null::uuid as grupo_id, 'Sem insumo (lançamento avulso)'::text as grupo_nome,
           'neutro'::text as grupo_cor, 99::smallint as grupo_ordem,
           round(sum(r.valor), 2) as total
    from lancs l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    where not exists (select 1 from itens it where it.lancamento_id = l.id)
      and coalesce(rz.raiz_tipo, '') <> 'financeiro'
      and (p_categoria is null or coalesce(r.categoria_id, l.categoria_id) = p_categoria)
      and (p_centro_custo is null or r.centro_custo_id in (select id from arvore))
    having sum(r.valor) is not null
  )
  select * from com_insumo
  union all
  select * from sem_insumo
  order by grupo_ordem
$function$;

-- ---------- 7. custo x receita ----------
-- O corte de natureza aqui e ASSIMETRICO de proposito. Ver o cabecalho.
create or replace function public.fn_rel_custo_receita(
  p_meses date[],
  p_centros_custo uuid[] default null,
  p_centros_receita uuid[] default null
)
returns table(mes date, tipo text, centro_custo_id uuid, nome text, codigo text, total numeric, retencao numeric)
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
  pares_custo as (
    select escolhido.id as grupo_id, s.id as centro_id, c.nivel as nivel_grupo
    from unnest(coalesce(p_centros_custo, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
    join public.centros_custo c on c.id = escolhido.id
  ),
  -- A etapa ganha da raiz: `nivel desc` pega o escolhido MAIS FUNDO, que e o
  -- recorte mais fino pedido. Sem isto, escolher raiz + etapa junto somaria a
  -- etapa dentro da raiz e a etapa escolhida nao apareceria em linha propria.
  grupo_custo as (
    select distinct on (centro_id) centro_id, grupo_id
    from pares_custo
    order by centro_id, nivel_grupo desc
  ),
  pares_receita as (
    select escolhido.id as grupo_id, s.id as centro_id, c.nivel as nivel_grupo
    from unnest(coalesce(p_centros_receita, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
    join public.centros_custo c on c.id = escolhido.id
  ),
  grupo_receita as (
    select distinct on (centro_id) centro_id, grupo_id
    from pares_receita
    order by centro_id, nivel_grupo desc
  ),
  base as (
    select
      l.mes_competencia as mes,
      l.tipo,
      case when l.tipo = 'a_pagar' then coalesce(gc.grupo_id, a.raiz_id)
           else coalesce(gr.grupo_id, a.raiz_id) end as grupo_id,
      r.valor,
      (l.retencao_iss + l.retencao_pis + l.retencao_cofins + l.retencao_csll
       + l.retencao_ir + l.retencao_inss + l.retencao_outras) as retencao_doc,
      sum(r.valor) over (partition by l.id) as rateio_do_doc
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join raizes a on a.centro_id = r.centro_custo_id
    left join grupo_custo gc on gc.centro_id = r.centro_custo_id
    left join grupo_receita gr on gr.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
    where l.status <> 'cancelado'
      -- O centro financeiro (Emprestimos) fica fora: a analise dele vive no
      -- relatorio de Creditos. `raiz_tipo` desce pela recursao, entao vale para a
      -- raiz E para as etapas.
      and coalesce(a.raiz_tipo, '') <> 'financeiro'
      -- CUSTO: tudo menos `movimentacao`, igual as outras seis. A tarifa
      -- bancaria e despesa paga e rateada, entao conta no centro dela.
      -- RECEITA: so `operacional`. Receita `financeira` e juro recebido e
      -- rendimento de aplicacao -- resultado da EMPRESA, nao producao da OBRA;
      -- somada aqui, inflaria a margem da obra com dinheiro que a obra nao
      -- gerou. Medido em 29/08/2026: nao existe NENHUM `a_receber` de natureza
      -- `financeira` na base, entao esta linha nao muda um centavo hoje; ela
      -- existe para a porta continuar fechada quando existir.
      and (
        case when l.tipo = 'a_pagar'
          then coalesce(cat.natureza, 'operacional') <> 'movimentacao'
          else coalesce(cat.natureza, 'operacional') = 'operacional'
        end
      )
      and l.mes_competencia = any(p_meses)
      and (
        (l.tipo = 'a_pagar' and (
          coalesce(cardinality(p_centros_custo), 0) = 0
          or gc.centro_id is not null))
        or
        (l.tipo = 'a_receber' and (
          coalesce(cardinality(p_centros_receita), 0) = 0
          or gr.centro_id is not null))
      )
  )
  select
    b.mes,
    b.tipo,
    grupo.id,
    grupo.nome,
    grupo.codigo,
    round(sum(b.valor), 2) as total,
    round(coalesce(sum(b.retencao_doc * b.valor / nullif(b.rateio_do_doc, 0)), 0), 2) as retencao
  from base b
  join public.centros_custo grupo on grupo.id = b.grupo_id
  group by b.mes, b.tipo, grupo.id, grupo.nome, grupo.codigo
$function$;

comment on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) is
  'Custo a pagar por centro de custo, agrupado no centro escolhido mais fundo. Toda natureza menos `movimentacao` (principal de emprestimo/aplicacao) e sem o centro raiz financeiro.';
comment on function public.fn_rel_custo_centro_serie(uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) is
  'Serie mensal do custo de cada centro escolhido. Mesmos cortes de fn_rel_custo_centro_custo (tipo de centro, raiz financeira fora, natureza <> movimentacao), para o grafico e o cartao contarem a mesma coisa.';
comment on function public.fn_rel_custo_centro_vida(uuid[]) is
  'Primeiro mes com custo de cada centro escolhido, pelos mesmos cortes de fn_rel_custo_centro_custo.';
comment on function public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid) is
  'Custo a pagar por mes de competencia. Mesmos cortes de fn_rel_custo_centro_custo.';
comment on function public.fn_rel_custo_itens_oc(date, date) is
  'Itens de OC com o valor do documento redistribuido proporcionalmente, pelos mesmos cortes de fn_rel_custo_centro_custo.';
comment on function public.fn_rel_custo_por_grupo(date, date, uuid, uuid) is
  'Custo a pagar por grupo de insumo, com o balde "Sem insumo" fechando o total de fn_rel_custo_centro_custo. Mesmos cortes.';
comment on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) is
  'Custo x receita por mes e centro. Custo: natureza <> movimentacao (igual as outras seis). Receita: so operacional, porque receita financeira e resultado da empresa e nao producao da obra.';
