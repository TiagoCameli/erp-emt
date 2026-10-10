-- Custo das obras sem socio, empresa ligada e imobilizado (PR 2 do controle
-- total, 10/10/2026).
--
-- As 10 funcoes de custo repetem o mesmo predicado (nao ha helper): centro cuja
-- raiz e 'financeiro'/'investimento' fica fora, e natureza 'movimentacao' fica
-- fora. Aqui as duas listas crescem: tipos 'socio', 'empresa_ligada' e
-- 'imobilizado' e naturezas 'distribuicao' e 'mutuo' (fora do resultado, D3/D4/D5).
-- Corpo de cada funcao copiado do banco vivo; so as duas listas mudam.

-- fn_rel_custo_centro_custo: 1 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_rel_custo_centro_custo(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_centros uuid[] DEFAULT NULL::uuid[], p_categorias uuid[] DEFAULT NULL::uuid[], p_fornecedores uuid[] DEFAULT NULL::uuid[], p_formas uuid[] DEFAULT NULL::uuid[], p_sem_forma boolean DEFAULT false, p_status text[] DEFAULT NULL::text[], p_excluir_previsto boolean DEFAULT false, p_tipos_centro text[] DEFAULT NULL::text[], p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(centro_custo_id uuid, nome text, codigo text, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  left join public.categorias_financeiras cat
    on cat.id = coalesce(r.categoria_id, l.categoria_id)
  left join raizes a on a.centro_id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = a.raiz_id
  left join alvos on alvos.id = r.centro_custo_id
  left join public.centros_custo grupo
    on grupo.id = coalesce(alvos.grupo_id, a.raiz_id)
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    -- O centro financeiro (Emprestimos) fica fora: a analise dele vive no
    -- relatorio de Creditos, por decisao do Tiago em 27/08/2026.
    and coalesce(raiz.tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
    -- TUDO MENOS `movimentacao`. Principal de emprestimo e de aplicacao entra e
    -- sai do caixa sem virar resultado, entao nao e custo de ninguem. Ja a
    -- `financeira` (tarifa bancaria) e despesa paga e rateada num centro real, e
    -- por decisao do Tiago em 29/08/2026 ela pertence ao centro em que esta
    -- rateada -- o Escritorio Central.
    and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
    -- D3: CAPEX (natureza investimento) fora do custo, salvo pedido explicito.
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
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

-- fn_rel_custo_centro_serie: 1 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_rel_custo_centro_serie(p_centros uuid[], p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_categorias uuid[] DEFAULT NULL::uuid[], p_fornecedores uuid[] DEFAULT NULL::uuid[], p_formas uuid[] DEFAULT NULL::uuid[], p_sem_forma boolean DEFAULT false, p_status text[] DEFAULT NULL::text[], p_excluir_previsto boolean DEFAULT false, p_tipos_centro text[] DEFAULT NULL::text[], p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(centro_custo_id uuid, nome text, codigo text, mes text, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    left join public.categorias_financeiras cat
    on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      -- Os dois cortes da familia. Ver fn_rel_custo_centro_custo.
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
      and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
    -- D3: CAPEX (natureza investimento) fora do custo, salvo pedido explicito.
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
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

-- fn_rel_custo_centro_vida: 1 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_rel_custo_centro_vida(p_centros uuid[], p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(centro_custo_id uuid, primeiro_mes date)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  left join public.categorias_financeiras cat
    on cat.id = coalesce(r.categoria_id, l.categoria_id)
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
    and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
    -- D3: CAPEX (natureza investimento) fora do custo, salvo pedido explicito.
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
  group by escolhido.id
$function$;

-- fn_rel_custo_itens_oc: 2 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_rel_custo_itens_oc(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(lancamento_id uuid, item_id uuid, centro_custo_id uuid, insumo_id uuid, categoria_insumo_id uuid, categoria_financeira_id uuid, grupo_id uuid, quantidade numeric, valor numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    select l.id, l.origem_id, l.categoria_id
    from public.lancamentos l
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and l.origem = 'oc'
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
    where coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
  ),
  -- O valor do documento e a soma do RATEIO que conta como custo, que e
  -- exatamente o que `fn_rel_custo_centro_custo` conta.
  valor_do_doc as (
    select r.lancamento_id, sum(r.valor) as valor_doc
    from public.lancamento_rateios r
    join lancs l on l.id = r.lancamento_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat
      on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
      and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
      and (coalesce(p_incluir_investimento, false)
           or coalesce(cat.natureza, 'operacional') <> 'investimento')
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

-- fn_rel_custo_por_grupo: 1 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_rel_custo_por_grupo(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_centro_custo uuid DEFAULT NULL::uuid, p_categoria uuid DEFAULT NULL::uuid, p_centros uuid[] DEFAULT NULL::uuid[], p_categorias uuid[] DEFAULT NULL::uuid[], p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(grupo_id uuid, grupo_nome text, grupo_cor text, grupo_ordem smallint, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  escolhidos as (
    select distinct e.id
    from unnest(
      case
        when coalesce(cardinality(p_centros), 0) > 0 then p_centros
        when p_centro_custo is not null then array[p_centro_custo]
        else '{}'::uuid[]
      end
    ) as e(id)
  ),
  arvore as (
    select distinct s.id
    from escolhidos e
    cross join lateral public.fn_centro_custo_subarvore(e.id) s
  ),
  cats as (
    select distinct c.id
    from unnest(
      case
        when coalesce(cardinality(p_categorias), 0) > 0 then p_categorias
        when p_categoria is not null then array[p_categoria]
        else '{}'::uuid[]
      end
    ) as c(id)
  ),
  lancs as (
    select l.id, l.categoria_id
    from public.lancamentos l
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
  ),
  itens as (
    select * from public.fn_rel_custo_itens_oc(p_inicio, p_fim, p_incluir_investimento)
  ),
  com_insumo as (
    select g.id as grupo_id, g.nome as grupo_nome, g.cor as grupo_cor, g.ordem as grupo_ordem,
           round(sum(it.valor), 2) as total
    from itens it
    join public.insumo_grupos g on g.id = it.grupo_id
    where (
        not exists (select 1 from cats)
        or it.categoria_financeira_id in (select c.id from cats c)
      )
      and (
        not exists (select 1 from escolhidos)
        or it.centro_custo_id in (select a.id from arvore a)
      )
    group by g.id, g.nome, g.cor, g.ordem
  ),
  -- Todo rateio que NAO virou item ajustado cai aqui. Definir o balde por
  -- ausencia e o que garante que cada rateio e contado exatamente uma vez. A
  -- natureza e a do rateio (D4), a mesma que `fn_rel_custo_itens_oc` usa.
  sem_insumo as (
    select null::uuid as grupo_id, 'Sem insumo (lançamento avulso)'::text as grupo_nome,
           'neutro'::text as grupo_cor, 99::smallint as grupo_ordem,
           round(sum(r.valor), 2) as total
    from lancs l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat
      on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where not exists (select 1 from itens it where it.lancamento_id = l.id)
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
      and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
      and (coalesce(p_incluir_investimento, false)
           or coalesce(cat.natureza, 'operacional') <> 'investimento')
      and (
        not exists (select 1 from cats)
        or coalesce(r.categoria_id, l.categoria_id) in (select c.id from cats c)
      )
      and (
        not exists (select 1 from escolhidos)
        or r.centro_custo_id in (select a.id from arvore a)
      )
    having sum(r.valor) is not null
  )
  select * from com_insumo
  union all
  select * from sem_insumo
  order by grupo_ordem
$function$;

-- fn_rel_custo_por_mes: 1 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_rel_custo_por_mes(p_meses integer DEFAULT 6, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_centro_custo uuid DEFAULT NULL::uuid, p_categoria uuid DEFAULT NULL::uuid, p_centros uuid[] DEFAULT NULL::uuid[], p_categorias uuid[] DEFAULT NULL::uuid[], p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(mes date, total numeric, lancamentos integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  -- A lista ganha do escalar quando as duas chegam. Lista vazia e "todos", igual
  -- a parametro nulo.
  escolhidos as (
    select distinct e.id
    from unnest(
      case
        when coalesce(cardinality(p_centros), 0) > 0 then p_centros
        when p_centro_custo is not null then array[p_centro_custo]
        else '{}'::uuid[]
      end
    ) as e(id)
  ),
  -- Filtrar por centro e filtrar a SUBARVORE dele.
  arvore as (
    select distinct s.id
    from escolhidos e
    cross join lateral public.fn_centro_custo_subarvore(e.id) s
  ),
  cats as (
    select distinct c.id
    from unnest(
      case
        when coalesce(cardinality(p_categorias), 0) > 0 then p_categorias
        when p_categoria is not null then array[p_categoria]
        else '{}'::uuid[]
      end
    ) as c(id)
  )
  select
    l.mes_competencia as mes,
    sum(r.valor) as total,
    count(distinct l.id)::int as lancamentos
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join raizes rz on rz.centro_id = r.centro_custo_id
  left join public.categorias_financeiras cat
    on cat.id = coalesce(r.categoria_id, l.categoria_id)
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    -- Os dois cortes da familia. Ver fn_rel_custo_centro_custo.
    and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
    and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
    -- D3: CAPEX (natureza investimento) fora do custo, salvo pedido explicito.
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
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
      not exists (select 1 from escolhidos)
      or r.centro_custo_id in (select a.id from arvore a)
    )
    and (
      not exists (select 1 from cats)
      or coalesce(r.categoria_id, l.categoria_id) in (select c.id from cats c)
    )
  group by l.mes_competencia
  order by l.mes_competencia
$function$;

-- fn_rel_custo_receita: 1 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_rel_custo_receita(p_meses date[], p_centros_custo uuid[] DEFAULT NULL::uuid[], p_centros_receita uuid[] DEFAULT NULL::uuid[], p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(mes date, tipo text, centro_custo_id uuid, nome text, codigo text, total numeric, retencao numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  -- A etapa ganha da raiz: `nivel desc` pega o escolhido MAIS FUNDO.
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
    left join public.categorias_financeiras cat
      on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where l.status <> 'cancelado'
      -- O centro financeiro (Emprestimos) fica fora: a analise dele vive no
      -- relatorio de Creditos.
      and coalesce(a.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
      -- CUSTO: tudo menos `movimentacao` e, salvo pedido, `investimento` (D3).
      -- RECEITA: so `operacional` (ver 29/08/2026).
      and (
        case when l.tipo = 'a_pagar'
          then coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
               and (coalesce(p_incluir_investimento, false)
                    or coalesce(cat.natureza, 'operacional') <> 'investimento')
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

-- fn_rel_gestao_maiores_custos: 1 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_rel_gestao_maiores_custos(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_centros uuid[] DEFAULT NULL::uuid[], p_categorias uuid[] DEFAULT NULL::uuid[], p_limite integer DEFAULT 8, p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(lancamento_id uuid, numero text, descricao text, fornecedor text, mes_competencia date, data_vencimento date, valor numeric, centros integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  escolhidos as (
    select distinct e.id
    from unnest(coalesce(p_centros, '{}'::uuid[])) as e(id)
  ),
  arvore as (
    select distinct s.id
    from escolhidos e
    cross join lateral public.fn_centro_custo_subarvore(e.id) s
  ),
  somado as (
    select
      l.id as lancamento_id,
      round(sum(r.valor), 2) as valor,
      count(distinct r.centro_custo_id)::int as centros
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat
    on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
      and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
    -- D3: CAPEX (natureza investimento) fora do custo, salvo pedido explicito.
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
      and (
        not exists (select 1 from escolhidos)
        or r.centro_custo_id in (select a.id from arvore a)
      )
      and (
        coalesce(cardinality(p_categorias), 0) = 0
        or coalesce(r.categoria_id, l.categoria_id) = any(p_categorias)
      )
    group by l.id
  )
  select
    l.id,
    l.numero,
    l.descricao,
    coalesce(nullif(f.nome_fantasia, ''), f.razao_social) as fornecedor,
    l.mes_competencia,
    l.data_vencimento,
    s.valor,
    s.centros
  from somado s
  join public.lancamentos l on l.id = s.lancamento_id
  left join public.fornecedores f on f.id = l.fornecedor_id
  order by s.valor desc, l.id desc
  limit greatest(coalesce(p_limite, 8), 1)
$function$;

-- fn_rel_gestao_maiores_fornecedores: 1 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_rel_gestao_maiores_fornecedores(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_centros uuid[] DEFAULT NULL::uuid[], p_categorias uuid[] DEFAULT NULL::uuid[], p_limite integer DEFAULT 8, p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(fornecedor_id uuid, nome text, tipo_linha text, total numeric, pago numeric, aberto numeric, lancamentos integer, fornecedores integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  escolhidos as (
    select distinct e.id
    from unnest(coalesce(p_centros, '{}'::uuid[])) as e(id)
  ),
  arvore as (
    select distinct s.id
    from escolhidos e
    cross join lateral public.fn_centro_custo_subarvore(e.id) s
  ),
  -- Fracao PAGA de cada documento, medida nas PARCELAS: o dinheiro e da parcela,
  -- nao do status do lancamento.
  pagamento as (
    select pc.lancamento_id,
           sum(pc.valor) filter (where pc.status = 'pago') / nullif(sum(pc.valor), 0) as fracao
    from public.lancamento_parcelas pc
    group by pc.lancamento_id
  ),
  base as (
    select
      l.fornecedor_id,
      l.id as lancamento_id,
      r.valor,
      r.valor * coalesce(pg.fracao, 0) as valor_pago
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat
    on cat.id = coalesce(r.categoria_id, l.categoria_id)
    left join pagamento pg on pg.lancamento_id = l.id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
      and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
    -- D3: CAPEX (natureza investimento) fora do custo, salvo pedido explicito.
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
      and (
        not exists (select 1 from escolhidos)
        or r.centro_custo_id in (select a.id from arvore a)
      )
      and (
        coalesce(cardinality(p_categorias), 0) = 0
        or coalesce(r.categoria_id, l.categoria_id) = any(p_categorias)
      )
  ),
  por_fornecedor as (
    select
      b.fornecedor_id as id,
      coalesce(nullif(f.nome_fantasia, ''), f.razao_social) as nome,
      round(sum(b.valor), 2) as total,
      round(sum(b.valor_pago), 2) as pago,
      count(distinct b.lancamento_id)::int as lancamentos
    from base b
    left join public.fornecedores f on f.id = b.fornecedor_id
    group by b.fornecedor_id, coalesce(nullif(f.nome_fantasia, ''), f.razao_social)
  ),
  ordenado as (
    select p.*,
           row_number() over (order by p.total desc, p.id) as posicao
    from por_fornecedor p
  ),
  linhas as (
    select
      o.id as fornecedor_id,
      coalesce(o.nome, 'Sem fornecedor') as nome,
      case when o.id is null then 'sem_fornecedor' else 'fornecedor' end as tipo_linha,
      o.total,
      o.pago,
      round(o.total - o.pago, 2) as aberto,
      o.lancamentos,
      1 as fornecedores,
      0 as ordem
    from ordenado o
    where o.posicao <= greatest(coalesce(p_limite, 8), 1)
    union all
    select
      null::uuid,
      'Outros'::text,
      'outros'::text,
      round(sum(o.total), 2),
      round(sum(o.pago), 2),
      round(sum(o.total) - sum(o.pago), 2),
      sum(o.lancamentos)::int,
      count(*)::int,
      1
    from ordenado o
    where o.posicao > greatest(coalesce(p_limite, 8), 1)
    having count(*) > 0
  )
  select
    x.fornecedor_id, x.nome, x.tipo_linha, x.total, x.pago, x.aberto,
    x.lancamentos, x.fornecedores
  from linhas x
  order by x.ordem, x.total desc
$function$;

-- fn_competencias_painel: 1 troca(s) de tipo de centro, 1 de natureza
CREATE OR REPLACE FUNCTION public.fn_competencias_painel(p_meses integer DEFAULT 13, p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(mes date, fechada boolean, fechado_em timestamp with time zone, fechado_por uuid, observacao text, custo numeric, lancamentos integer, sem_categoria integer, excecoes integer, reaberturas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  meses as (
    select date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date
           - (n || ' months')::interval as mes
    from generate_series(0, greatest(coalesce(p_meses, 13), 1) - 1) as n
    union
    select mes::timestamp from public.competencias_fechadas
    union
    select mes::timestamp from public.competencia_eventos
    union
    select distinct mes_competencia::timestamp from public.lancamentos
  ),
  custo as (
    select l.mes_competencia as mes, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat
      on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
      and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
      and (coalesce(p_incluir_investimento, false)
           or coalesce(cat.natureza, 'operacional') <> 'investimento')
    group by l.mes_competencia
  )
  select
    m.mes::date,
    (cf.mes is not null) as fechada,
    cf.fechado_em,
    cf.fechado_por,
    cf.observacao,
    coalesce(cu.total, 0) as custo,
    (
      select count(*)::int from public.lancamentos l
      where l.mes_competencia = m.mes::date and l.status <> 'cancelado'
    ) as lancamentos,
    -- "Sem categoria" no lugar de "Incompletos" (Tiago, 03/10/2026): o que o
    -- DRE e o custo nao conseguem classificar.
    (
      select count(*)::int from public.lancamentos l
      where l.mes_competencia = m.mes::date and l.status <> 'cancelado'
        and l.categoria_id is null
    ) as sem_categoria,
    (
      select count(*)::int from public.competencia_eventos e
      where e.mes = m.mes::date and e.tipo = 'excecao'
    ) as excecoes,
    (
      select count(*)::int from public.competencia_eventos e
      where e.mes = m.mes::date and e.tipo = 'reabriu'
    ) as reaberturas
  from meses m
  left join public.competencias_fechadas cf on cf.mes = m.mes::date
  left join custo cu on cu.mes = m.mes::date
  where public.tem_permissao('financeiro.competencias', 'ver')
  order by m.mes desc
$function$;
