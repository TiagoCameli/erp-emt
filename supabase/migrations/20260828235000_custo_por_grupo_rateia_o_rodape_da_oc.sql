-- =============================================================
-- Custo por grupo de insumo: o rodape da OC entra no rateio
--
-- ============================================================
-- O QUE ESTAVA ERRADO
-- ============================================================
-- O ramo `com_insumo` de `fn_rel_custo_por_grupo` somava
-- `oi.quantidade * oi.preco_unitario`, que e o SUBTOTAL DOS ITENS. O rodape da
-- ordem (desconto, frete, impostos, outras despesas) nao entra nele, entao o
-- relatorio contava um custo que ninguem vai pagar.
--
-- Prova nominal, medida em 28/08/2026:
--   LAN-2026-6463 / OC-2026-0017
--     itens ......... R$ 103.835,95
--     desconto ...... R$   3.835,95
--     valor_total ... R$ 100.000,00
--   O relatorio contava 103.835,95. O lancamento, o rateio, a parcela e o
--   pagamento contam 100.000,00.
--
-- No agregado: 10 ordens com rodape, R$ 243.163,23 de itens contra
-- R$ 238.560,02 de valor total -- R$ 4.603,21 de custo inventado, todo em
-- 08/2026.
--
-- O KPI da tela promete "Soma dos 4 grupos, igual ao custo por centro de custo"
-- e nao cumpria. Antes desta migration, mes a mes:
--   2025-01  grupos R$   786.874,24 | centro de custo R$   748.374,24
--   2025-04  grupos R$ 1.178.316,33 | centro de custo R$   425.122,43
--   2026-05  grupos R$ 6.498.686,81 | centro de custo R$ 4.446.415,81
--   2026-08  grupos R$ 3.869.740,94 | centro de custo R$ 3.865.137,72
-- (as tres primeiras sao o centro raiz `financeiro`, que o custo por centro
-- exclui desde 27/08 e o custo por grupo nao excluia; a ultima e o rodape)
--
-- ============================================================
-- COMO O AJUSTE E RATEADO
-- ============================================================
-- Pela MESMA regra que `fn_aprovar_ordem_compra` ja usa para escrever
-- `lancamento_rateios`:
--   1. cada fatia pesa pelo bruto dela (quantidade x preco);
--   2. valor = round(bruto * valor_do_documento / bruto_total, 2);
--   3. a sobra de centavo (valor_do_documento - soma dos arredondados) vai para
--      a MAIOR fatia, uma vez so.
-- A unica diferenca e a granularidade: la a fatia e (centro, categoria), porque
-- e isso que vira linha de rateio; aqui e o ITEM da OC, porque e a fatia mais
-- fina de que os tres niveis do drill precisam (grupo > subcategoria > insumo).
-- Em qualquer uma das duas, a soma por documento fecha exatamente com o valor
-- do documento, que e o que faz a igualdade valer.
--
-- O bruto NAO e arredondado antes de proporcionar: quantidade e preco tem 4
-- casas, o produto tem 8, e arredondar antes de dividir joga fora precisao que
-- a sobra depois teria de recolher. A sobra existe para o centavo do
-- arredondamento final, nao para consertar um truncamento evitavel.
--
-- ============================================================
-- O CALCULO MORA NUMA FUNCAO SO
-- ============================================================
-- `fn_rel_custo_itens_oc` devolve o item ja ajustado, e as tres RPCs do drill
-- (grupo, subcategoria, insumo) somam a MESMA linha em granularidades
-- diferentes. Com tres copias do calculo, o dia em que uma delas mudasse o
-- drill deixaria de fechar com o pai -- em silencio, que e o defeito que este
-- relatorio ja teve.
--
-- ============================================================
-- OS OUTROS DOIS CORTES QUE FALTAVAM
-- ============================================================
-- As tres funcoes tambem passam a repetir os cortes de
-- `fn_rel_custo_centro_custo`: fora o centro raiz de tipo `financeiro` e fora o
-- que nao e natureza `operacional`. Sem eles a soma dos grupos nunca fecharia
-- com o custo por centro, por mais certo que o rateio do rodape estivesse.
--
-- E o balde "Sem insumo" passa a ser definido por AUSENCIA de item ajustado, e
-- nao por `origem <> 'oc'`: assim todo rateio e contado uma vez, e uma OC que
-- por qualquer motivo nao produzir item (item sem subcategoria, por exemplo)
-- cai no balde em vez de sumir da soma.
--
-- ============================================================
-- MUDANCA DE COMPORTAMENTO ASSUMIDA
-- ============================================================
-- `fn_rel_custo_por_subcategoria` e `fn_rel_custo_por_insumo` filtravam o
-- centro com `oi.centro_custo_id = p_centro_custo` (o centro exato), enquanto
-- `fn_rel_custo_por_grupo` filtra pela SUBARVORE. Escolher uma obra abria um
-- grupo com um numero e mostrava subcategorias que somavam menos. As tres
-- passam a usar a subarvore.
--
-- Assinaturas iguais nas tres, entao `create or replace` basta. A funcao nova
-- (`fn_rel_custo_itens_oc`) nasce sem privilegio nenhum e leva grant explicito.
-- =============================================================

-- ---------- 1. o item da OC, com o rodape ja rateado ----------
create or replace function public.fn_rel_custo_itens_oc(
  p_inicio date default null,
  p_fim date default null
)
returns table(
  lancamento_id uuid,
  item_id uuid,
  centro_custo_id uuid,
  insumo_id uuid,
  categoria_insumo_id uuid,
  categoria_financeira_id uuid,
  grupo_id uuid,
  quantidade numeric,
  valor numeric
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
      and coalesce(cf.natureza, 'operacional') = 'operacional'
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
  -- `fn_rel_custo_centro_custo` conta. Ancorar em `lancamentos.valor` daria o
  -- mesmo numero hoje e divergiria no dia em que alguem realinhasse o rateio.
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

revoke execute on function public.fn_rel_custo_itens_oc(date, date) from public;
grant execute on function public.fn_rel_custo_itens_oc(date, date) to authenticated;

comment on function public.fn_rel_custo_itens_oc(date, date) is
  'Item de ordem de compra com o rodape da OC (desconto, frete, impostos, outras despesas) ja rateado proporcionalmente, pela mesma regra de fn_aprovar_ordem_compra. A soma por lancamento fecha com o rateio dele. Base dos tres niveis do drill de custo por grupo de insumo.';

-- ---------- 2. o grupo ----------
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
      and coalesce(cf.natureza, 'operacional') = 'operacional'
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
  -- contado exatamente uma vez.
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

-- ---------- 3. a subcategoria (nivel 2 do drill) ----------
create or replace function public.fn_rel_custo_por_subcategoria(
  p_grupo_id uuid,
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null
)
returns table(categoria_id uuid, categoria_nome text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with arvore as (
    select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s
  )
  select c.id, c.nome, round(sum(it.valor), 2) as total
  from public.fn_rel_custo_itens_oc(p_inicio, p_fim) it
  join public.categorias_insumo c on c.id = it.categoria_insumo_id
  where c.grupo_id = p_grupo_id
    and (p_centro_custo is null or it.centro_custo_id in (select id from arvore))
  group by c.id, c.nome
  order by round(sum(it.valor), 2) desc
$function$;

-- ---------- 4. o insumo (nivel 3 do drill) ----------
create or replace function public.fn_rel_custo_por_insumo(
  p_categoria_id uuid,
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null
)
returns table(insumo_id uuid, insumo_nome text, quantidade numeric, total numeric)
language sql
stable
set search_path to ''
as $function$
  with arvore as (
    select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s
  )
  select i.id, i.nome, round(sum(it.quantidade), 3) as quantidade,
         round(sum(it.valor), 2) as total
  from public.fn_rel_custo_itens_oc(p_inicio, p_fim) it
  join public.insumos i on i.id = it.insumo_id
  where i.categoria_id = p_categoria_id
    and (p_centro_custo is null or it.centro_custo_id in (select id from arvore))
  group by i.id, i.nome
  order by round(sum(it.valor), 2) desc
$function$;

comment on function public.fn_rel_custo_por_grupo(date, date, uuid, uuid) is
  'Custo a pagar por grupo de insumo. Item de OC entra com o rodape da ordem ja rateado, e a soma dos grupos fecha com fn_rel_custo_centro_custo no mesmo periodo.';
comment on function public.fn_rel_custo_por_subcategoria(uuid, date, date, uuid) is
  'Nivel 2 do drill de custo por grupo. Mesma linha ajustada de fn_rel_custo_itens_oc, entao a soma das subcategorias fecha com o grupo.';
comment on function public.fn_rel_custo_por_insumo(uuid, date, date, uuid) is
  'Nivel 3 do drill de custo por grupo. Mesma linha ajustada de fn_rel_custo_itens_oc, entao a soma dos insumos fecha com a subcategoria.';
