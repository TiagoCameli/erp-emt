-- Familia de resultado (D3 e D4, Tiago, 03/10/2026), parte 4 de 4.
-- Ver o cabecalho de 20261005183221_resultado_sem_investimento_custo_centro.sql.

-- Custo x receita, painel de competencias e DRE.

drop function public.fn_rel_custo_receita(date[], uuid[], uuid[]);

create function public.fn_rel_custo_receita(p_meses date[], p_centros_custo uuid[] default null::uuid[], p_centros_receita uuid[] default null::uuid[], p_incluir_investimento boolean default false)
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
      and coalesce(a.raiz_tipo, '') not in ('financeiro', 'investimento')
      -- CUSTO: tudo menos `movimentacao` e, salvo pedido, `investimento` (D3).
      -- RECEITA: so `operacional` (ver 29/08/2026).
      and (
        case when l.tipo = 'a_pagar'
          then coalesce(cat.natureza, 'operacional') <> 'movimentacao'
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

revoke all on function public.fn_rel_custo_receita(date[], uuid[], uuid[], boolean) from public, anon;
grant execute on function public.fn_rel_custo_receita(date[], uuid[], uuid[], boolean) to authenticated;

-- Painel de competencias: "Custo do mes" com o mesmo WHERE do Custo por
-- centro. Antes somava todo rateio a pagar, inclusive emprestimo e o centro
-- financeiro: jul/2026 mostrava R$ 9.020.764,29 contra R$ 5.477.200,29.
drop function public.fn_competencias_painel(integer);

create function public.fn_competencias_painel(p_meses integer default 13, p_incluir_investimento boolean default false)
 returns table(mes date, fechada boolean, fechado_em timestamp with time zone, fechado_por uuid, observacao text, custo numeric, lancamentos integer, sem_categoria integer, excecoes integer, reaberturas integer)
 language sql
 stable security definer
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
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento')
      and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
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

revoke all on function public.fn_competencias_painel(integer, boolean) from public, anon;
grant execute on function public.fn_competencias_painel(integer, boolean) to authenticated;

-- DRE: devolve a retencao na fonte de cada linha (receita bruta = total +
-- retencao), proporcional ao rateio como em fn_rel_custo_receita. A natureza
-- `investimento` sai como as outras; quem monta o DRE a poe fora do resultado.
drop function public.fn_rel_dre(date, date);

create function public.fn_rel_dre(p_inicio date, p_fim date)
 returns table(tipo text, categoria_id uuid, categoria text, natureza text, total numeric, retencao numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with doc as (
    select
      l.id,
      (coalesce(l.retencao_iss, 0) + coalesce(l.retencao_pis, 0)
       + coalesce(l.retencao_cofins, 0) + coalesce(l.retencao_csll, 0)
       + coalesce(l.retencao_ir, 0) + coalesce(l.retencao_inss, 0)
       + coalesce(l.retencao_outras, 0)) as retencao_doc,
      (select sum(r2.valor) from public.lancamento_rateios r2
       where r2.lancamento_id = l.id) as rateio_do_doc
    from public.lancamentos l
    where l.status <> 'cancelado'
      and l.mes_competencia >= date_trunc('month', p_inicio)::date
      and l.mes_competencia < p_fim
  )
  select
    l.tipo,
    c.id as categoria_id,
    c.nome as categoria,
    -- Sem categoria cai em operacional: sumir com despesa por falta de
    -- cadastro seria pior.
    coalesce(c.natureza, 'operacional') as natureza,
    sum(r.valor) as total,
    round(coalesce(sum(d.retencao_doc * r.valor / nullif(d.rateio_do_doc, 0)), 0), 2) as retencao
  from doc d
  join public.lancamentos l on l.id = d.id
  join public.lancamento_rateios r on r.lancamento_id = l.id
  left join public.categorias_financeiras c
    on c.id = coalesce(r.categoria_id, l.categoria_id)
  -- Ajuste de abertura de aplicacao: saldo anterior e rendimento passado,
  -- nao e movimento do periodo (Tiago, 25/09/2026).
  where not (l.origem = 'aplicacao' and coalesce(c.natureza, 'operacional') = 'movimentacao')
  group by l.tipo, c.id, c.nome, c.natureza
$function$;

revoke all on function public.fn_rel_dre(date, date) from public, anon;
grant execute on function public.fn_rel_dre(date, date) to authenticated;
