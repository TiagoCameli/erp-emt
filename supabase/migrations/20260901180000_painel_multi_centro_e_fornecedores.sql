-- Painel de Gestão: centro de custo e categoria em LISTA, e o ranking de fornecedores.
--
-- O painel era a última tela de custo presa a UM centro de custo. O relatório de
-- Custo por CC já escolhe vários desde 20/08/2026, com a escada raiz/etapa de
-- `_shared/centro-custo/filtro.ts`; aqui as duas RPCs que só ele chamava ficaram
-- para trás com o parâmetro escalar.
--
-- Os escalares CONTINUAM na assinatura, e não por gentileza: `fn_rel_custo_por_grupo`
-- também é chamada pelo relatório de Custo por grupo de insumo, que manda
-- `p_centro_custo`/`p_categoria` por nome. Trocar o escalar pela lista quebraria
-- aquela tela sem o `tsc` acusar nada (`supabase.rpc` aceita chave que não existe
-- na assinatura). Quando as duas chegam, a LISTA ganha.
--
-- DROP + CREATE, e não `create or replace`: mudar a lista de argumentos cria uma
-- SOBRECARGA, e aí a chamada antiga casa com as duas e o banco responde
-- `function is not unique`. Como recriar apaga o ACL, o `revoke`/`grant` vem
-- junto (função nasce com EXECUTE para PUBLIC) e o bloco de asserção no fim
-- estoura se algum grant ou o INVOKER faltar -- a exceção aborta a transação e a
-- versão nunca é registrada quebrada.

-- =====================================================================
-- 1. Custo por mês de referência
-- =====================================================================

drop function if exists public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid);

create function public.fn_rel_custo_por_mes(
  p_meses integer default 6,
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null,
  p_centros uuid[] default null,
  p_categorias uuid[] default null
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
  ),
  -- A lista ganha do escalar quando as duas chegam. Lista vazia é "todos", igual
  -- a parâmetro nulo: é o que `escreverListaNaUrl` manda quando ninguém está
  -- marcado, e ela não pode significar "nenhum centro" (a tela zeraria).
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
  -- Filtrar por centro é filtrar a SUBÁRVORE dele: escolher a obra traz as
  -- etapas, escolher a manutenção traz os 61 equipamentos.
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

revoke all on function public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid, uuid[], uuid[]) from public;
grant execute on function public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid, uuid[], uuid[]) to authenticated;

-- =====================================================================
-- 2. Custo por grupo de insumo
-- =====================================================================

drop function if exists public.fn_rel_custo_por_grupo(date, date, uuid, uuid);

create function public.fn_rel_custo_por_grupo(
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null,
  p_centros uuid[] default null,
  p_categorias uuid[] default null
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

revoke all on function public.fn_rel_custo_por_grupo(date, date, uuid, uuid, uuid[], uuid[]) from public;
grant execute on function public.fn_rel_custo_por_grupo(date, date, uuid, uuid, uuid[], uuid[]) to authenticated;

-- =====================================================================
-- 3. Maiores fornecedores do período
-- =====================================================================

-- Com quem a empresa gastou no período, maiores primeiro, dividido entre o que
-- já saiu do caixa e o que ainda vai sair.
--
-- Soma o RATEIO, e não o valor do documento: assim o bloco fecha com o custo
-- total do painel, e com centro de custo filtrado ele mostra a FATIA que caiu
-- naquele centro em vez de inflar o fornecedor com o documento inteiro.
--
-- Pago x aberto sai da fração paga das PARCELAS, não do `status` do lançamento:
-- o dinheiro é da parcela, e documento parcelado fica meses no meio do caminho.
-- `aberto` é calculado por diferença justamente para pago + aberto nunca
-- discordar do total por centavo de arredondamento.
--
-- O corte fica no BANCO: são 962 fornecedores ativos, e devolver uma linha por
-- fornecedor é exatamente a consulta que cresce com o tamanho da empresa até
-- bater no teto de 1000 do PostgREST -- que corta sem erro. O excedente vem
-- somado numa linha `outros`.
create or replace function public.fn_rel_gestao_maiores_fornecedores(
  p_inicio date default null,
  p_fim date default null,
  p_centros uuid[] default null,
  p_categorias uuid[] default null,
  p_limite integer default 8
)
returns table(
  fornecedor_id uuid,
  nome text,
  -- 'fornecedor' | 'sem_fornecedor' | 'outros'. Coluna própria, e não um nome
  -- combinado, porque as duas linhas sem id se confundiriam: "sem fornecedor" é
  -- dinheiro de lançamento avulso e "outros" é a cauda do ranking.
  tipo_linha text,
  total numeric,
  pago numeric,
  aberto numeric,
  lancamentos integer,
  -- Quantos fornecedores a linha representa: 1, ou o tamanho da cauda.
  fornecedores integer
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
  escolhidos as (
    select distinct e.id
    from unnest(coalesce(p_centros, '{}'::uuid[])) as e(id)
  ),
  arvore as (
    select distinct s.id
    from escolhidos e
    cross join lateral public.fn_centro_custo_subarvore(e.id) s
  ),
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
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
    left join pagamento pg on pg.lancamento_id = l.id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and coalesce(rz.raiz_tipo, '') <> 'financeiro'
      and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
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
           -- Desempate pelo id: sem ele dois fornecedores de mesmo total trocam
           -- de lugar entre uma carga e a seguinte da mesma tela.
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

revoke all on function public.fn_rel_gestao_maiores_fornecedores(date, date, uuid[], uuid[], integer) from public;
grant execute on function public.fn_rel_gestao_maiores_fornecedores(date, date, uuid[], uuid[], integer) to authenticated;

-- =====================================================================
-- 4. Asserção: grant e INVOKER nas três
-- =====================================================================

do $$
declare
  faltando text;
begin
  select string_agg(p.proname, ', ')
    into faltando
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'fn_rel_custo_por_mes',
      'fn_rel_custo_por_grupo',
      'fn_rel_gestao_maiores_fornecedores'
    )
    and (
      not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or p.prosecdef
      or has_function_privilege('anon', p.oid, 'EXECUTE')
    );

  if faltando is not null then
    raise exception
      'Painel: grant/INVOKER errado em %. Sem isto a tela fica em branco sem erro.',
      faltando;
  end if;
end
$$;
