-- Painel de Gestão: os maiores custos do período viram RPC.
--
-- A tabela "Maiores custos do período" era a única leitura do painel que trazia
-- LINHA CRUA (`lancamentos` ou `lancamento_rateios` com `.limit(8)`). Com um
-- centro de custo só isso funcionava; com a escolha múltipla, não:
--
-- 1. **O mesmo lançamento aparecia duas vezes.** Documento rateado entre duas
--    obras filtradas rende dois rateios, e cada um entrava como uma linha, cada
--    uma com metade do valor. Somar depois, no Node, não conserta: o `.limit(8)`
--    já cortou antes de somar, então um documento de R$ 10 mil partido em duas
--    fatias de R$ 5 mil perdia lugar para um de R$ 8 mil inteiro.
-- 2. **O nó exato, e não a subárvore.** O filtro era `.eq(centro_custo_id)`, que
--    ignora o custo apontado numa etapa -- R$ 30.402,70 em 24 rateios já em
--    24/08/2026. O resto do painel usa a subárvore desde 20/08/2026.
-- 3. **A tabela e o gráfico acima não falavam do mesmo dinheiro.** A consulta
--    crua não aplicava os dois cortes da família `fn_rel_custo_*` (fora o centro
--    `financeiro`, fora a natureza `movimentacao`), então o principal de um
--    empréstimo podia encabeçar a lista de "maiores custos" de uma tela que
--    justamente não conta empréstimo como custo.
--
-- Somar e cortar no banco resolve os três de uma vez, e tira do painel a última
-- consulta cujo número de linhas crescia com o tamanho da empresa.

create or replace function public.fn_rel_gestao_maiores_custos(
  p_inicio date default null,
  p_fim date default null,
  p_centros uuid[] default null,
  p_categorias uuid[] default null,
  p_limite integer default 8
)
returns table(
  lancamento_id uuid,
  numero text,
  descricao text,
  fornecedor text,
  mes_competencia date,
  data_vencimento date,
  -- O valor RATEADO no recorte: o documento inteiro quando nada está filtrado
  -- (a soma dos rateios de um documento é o valor dele), e só a fatia que caiu
  -- nos centros escolhidos quando estão. É o que faz "maiores" significar
  -- alguma coisa aqui: um documento de R$ 300 mil rateado 10% nesta obra pesa
  -- menos que um de R$ 50 mil inteiro nela.
  valor numeric,
  -- Em quantos centros de custo do recorte este documento caiu. A tela usa para
  -- avisar que o valor exibido é uma fatia.
  centros integer
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
  somado as (
    select
      l.id as lancamento_id,
      round(sum(r.valor), 2) as valor,
      count(distinct r.centro_custo_id)::int as centros
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      -- Os dois cortes da familia, para a tabela falar do MESMO dinheiro que o
      -- grafico logo acima dela.
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
  -- Desempate pelo id: sem chave unica, dois lancamentos de mesmo valor trocam
  -- de lugar entre uma carga e a seguinte da mesma tela.
  order by s.valor desc, l.id desc
  limit greatest(coalesce(p_limite, 8), 1)
$function$;

revoke all on function public.fn_rel_gestao_maiores_custos(date, date, uuid[], uuid[], integer) from public;
grant execute on function public.fn_rel_gestao_maiores_custos(date, date, uuid[], uuid[], integer) to authenticated;

do $$
begin
  if not has_function_privilege(
       'authenticated',
       'public.fn_rel_gestao_maiores_custos(date, date, uuid[], uuid[], integer)',
       'EXECUTE')
     or has_function_privilege(
       'anon',
       'public.fn_rel_gestao_maiores_custos(date, date, uuid[], uuid[], integer)',
       'EXECUTE')
  then
    raise exception
      'Painel: grant errado em fn_rel_gestao_maiores_custos. Sem isto a tabela fica vazia sem erro.';
  end if;
end
$$;
