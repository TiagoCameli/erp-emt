-- Familia de resultado (D3 e D4, Tiago, 03/10/2026), parte 1 de 4.
-- Em quatro arquivos porque o MCP do Supabase recusa o SQL inteiro de uma vez.
--
-- 1. Natureza vem SEMPRE de coalesce(r.categoria_id, l.categoria_id): a
--    categoria do rateio, caindo na do lancamento. A familia de custo usava a do
--    lancamento para natureza e a do rateio para o filtro de categoria; os R$
--    1,32 mi de "Investimentos" em 2026 so existem na categoria do rateio.
-- 2. Custo exclui `movimentacao` e `investimento`. O parametro novo
--    `p_incluir_investimento` (default false, no fim da assinatura) traz o
--    investimento de volta quando a tela marca "Incluir investimentos".
-- 3. fn_rel_dre ganha a coluna `retencao` (receita bruta = total + retencao).
-- 4. fn_competencias_painel: "Custo do mes" com o mesmo WHERE do custo por
--    centro, e a coluna `incompletos` (status previsto) vira `sem_categoria`.
-- Funcoes que mudam de assinatura sao recriadas (drop + create) com o mesmo
-- grant de antes: execute para authenticated, nada para anon.

-- Custo por centro, serie, vida do centro e custo por mes.

drop function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]);

CREATE FUNCTION public.fn_rel_custo_centro_custo(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_centros uuid[] DEFAULT NULL::uuid[], p_categorias uuid[] DEFAULT NULL::uuid[], p_fornecedores uuid[] DEFAULT NULL::uuid[], p_formas uuid[] DEFAULT NULL::uuid[], p_sem_forma boolean DEFAULT false, p_status text[] DEFAULT NULL::text[], p_excluir_previsto boolean DEFAULT false, p_tipos_centro text[] DEFAULT NULL::text[], p_incluir_investimento boolean DEFAULT false)
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
    and coalesce(raiz.tipo, '') not in ('financeiro', 'investimento')
    -- TUDO MENOS `movimentacao`. Principal de emprestimo e de aplicacao entra e
    -- sai do caixa sem virar resultado, entao nao e custo de ninguem. Ja a
    -- `financeira` (tarifa bancaria) e despesa paga e rateada num centro real, e
    -- por decisao do Tiago em 29/08/2026 ela pertence ao centro em que esta
    -- rateada -- o Escritorio Central.
    and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
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

revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[], boolean) from public, anon;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[], boolean) to authenticated;

drop function public.fn_rel_custo_centro_serie(uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean, text[]);

CREATE FUNCTION public.fn_rel_custo_centro_serie(p_centros uuid[], p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_categorias uuid[] DEFAULT NULL::uuid[], p_fornecedores uuid[] DEFAULT NULL::uuid[], p_formas uuid[] DEFAULT NULL::uuid[], p_sem_forma boolean DEFAULT false, p_status text[] DEFAULT NULL::text[], p_excluir_previsto boolean DEFAULT false, p_tipos_centro text[] DEFAULT NULL::text[], p_incluir_investimento boolean DEFAULT false)
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
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento')
      and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
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

revoke all on function public.fn_rel_custo_centro_serie(uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean, text[], boolean) from public, anon;
grant execute on function public.fn_rel_custo_centro_serie(uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean, text[], boolean) to authenticated;

drop function public.fn_rel_custo_centro_vida(uuid[]);

CREATE FUNCTION public.fn_rel_custo_centro_vida(p_centros uuid[], p_incluir_investimento boolean DEFAULT false)
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
    and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento')
    and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
    -- D3: CAPEX (natureza investimento) fora do custo, salvo pedido explicito.
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
  group by escolhido.id
$function$;

revoke all on function public.fn_rel_custo_centro_vida(uuid[], boolean) from public, anon;
grant execute on function public.fn_rel_custo_centro_vida(uuid[], boolean) to authenticated;

drop function public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid, uuid[], uuid[]);

CREATE FUNCTION public.fn_rel_custo_por_mes(p_meses integer DEFAULT 6, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_centro_custo uuid DEFAULT NULL::uuid, p_categoria uuid DEFAULT NULL::uuid, p_centros uuid[] DEFAULT NULL::uuid[], p_categorias uuid[] DEFAULT NULL::uuid[], p_incluir_investimento boolean DEFAULT false)
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
    and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento')
    and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
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

revoke all on function public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid, uuid[], uuid[], boolean) to authenticated;
