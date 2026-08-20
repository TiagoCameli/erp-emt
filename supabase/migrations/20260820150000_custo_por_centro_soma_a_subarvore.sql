-- Custo por centro de custo passa a somar a SUBÁRVORE, não o nó exato.
--
-- O problema, visto na tela: "Caminhão Pipa L1318/50 MZO-4486 - 02" aparecia
-- como um centro de custo no mesmo nível das obras, com R$ 326,50. Ele não é
-- um centro individual: é uma ETAPA dentro de "Manutenção/Documentação de
-- Equipamentos" (é assim que o plano modela manutenção — cada equipamento é
-- uma etapa do centro de manutenção). O dado no banco estava certo; o
-- relatório é que agrupava por `r.centro_custo_id` cru, então uma etapa virava
-- linha de primeiro nível ao lado da raiz dela.
--
-- Dois defeitos, na verdade:
--
--   1. AGRUPAMENTO. `group by r.centro_custo_id` mistura níveis. Agora o
--      relatório sobe cada rateio até a RAIZ da árvore e agrupa por ela.
--
--   2. FILTRO POR TIPO, que era um buraco silencioso de dinheiro. Só a raiz
--      tem `tipo` preenchido (etapa tem `tipo` null), então
--      `cc.tipo = p_tipo_centro` DESCARTAVA todo rateio feito em etapa. Quem
--      filtrasse "Manutenção" via R$ 4.353.614,09 em vez de R$ 4.353.940,59 —
--      sem erro, sem aviso, R$ 326,50 a menos. Agora o tipo é lido na raiz.
--
-- E o mesmo "= p_centro" exato existia em toda a família de relatórios de
-- custo: escolher a raiz "Manutenção" no filtro não trazia o custo dos
-- equipamentos dela. Todas passam a usar a subárvore, senão o mesmo filtro
-- responde números diferentes em painéis diferentes.
--
-- Tamanho real da mudança hoje: existe UM rateio abaixo da raiz (R$ 326,50 no
-- Caminhão Pipa) contra 6.052 na raiz (R$ 63,7 mi). O total geral não se move —
-- é a linha de controle desta migration. Mas as 60 etapas de equipamento já
-- estão cadastradas e só uma foi usada, então o buraco ia crescer a cada
-- rateio por equipamento.
--
-- Nenhuma assinatura muda (mesmos parâmetros, mesmas colunas de retorno), então
-- `create or replace` preserva os grants existentes. O helper novo é o único que
-- precisa de grant explícito.

-- ---------------------------------------------------------------------------
-- Helper: a subárvore de um centro (ele mesmo + todos os descendentes).
-- ---------------------------------------------------------------------------
-- Recursivo em vez de `nivel <= 3` na mão porque a profundidade é do cadastro
-- (Obra > Etapa > Item), não desta função: se amanhã nascer um quarto nível, o
-- relatório não pode passar a mentir calado.
create or replace function public.fn_centro_custo_subarvore(p_centro uuid)
returns table(id uuid)
language sql
stable
set search_path to ''
as $function$
  with recursive sub as (
    select c.id
    from public.centros_custo c
    where c.id = p_centro
    union all
    select f.id
    from public.centros_custo f
    join sub s on f.pai_id = s.id
  )
  select sub.id from sub
$function$;

comment on function public.fn_centro_custo_subarvore(uuid) is
  'Ids do centro de custo e de todos os descendentes dele. Base do filtro de custo: escolher a obra tem que trazer as etapas, e escolher o centro de manutenção tem que trazer os equipamentos.';

revoke all on function public.fn_centro_custo_subarvore(uuid) from public;
grant execute on function public.fn_centro_custo_subarvore(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Custo por centro de custo: agrupa na raiz.
-- ---------------------------------------------------------------------------
create or replace function public.fn_rel_custo_centro_custo(
  p_inicio date default null::date,
  p_fim date default null::date,
  p_centro_custo uuid default null::uuid,
  p_categoria uuid default null::uuid,
  p_fornecedor uuid default null::uuid,
  p_excluir_previsto boolean default false,
  p_tipo_centro text default null::text
)
returns table(centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    -- Raiz é quem nao tem pai. Usar `pai_id is null` em vez de `nivel = 1`
    -- porque o pai e quem define a arvore; `nivel` e denormalizacao e pode
    -- divergir sem que o join perceba.
    select c.id as centro_id, c.id as raiz_id
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_id
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  )
  select raiz.id, raiz.nome, raiz.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  -- `left join` nos dois: rateio sem centro (ou centro fora da arvore) nao pode
  -- desaparecer da soma. Ele cai numa linha sem nome, que a tela mostra como
  -- "Sem centro de custo" — visivel, nao sumido.
  left join raizes a on a.centro_id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = a.raiz_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    -- Previsto continua DENTRO por padrao: e o comportamento historico, e a base
    -- tem 0 previsto hoje, entao inverter o padrao mudaria um numero de dinheiro
    -- de forma invisivel agora e visivel no primeiro previsto lancado.
    and (not coalesce(p_excluir_previsto, false) or l.status <> 'previsto')
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (
      p_centro_custo is null
      or r.centro_custo_id in (select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s)
    )
    and (p_categoria is null or l.categoria_id = p_categoria)
    and (p_fornecedor is null or l.fornecedor_id = p_fornecedor)
    -- Tipo lido na RAIZ: etapa tem tipo null, e comparar com o tipo da etapa
    -- descartava o rateio de equipamento inteiro.
    and (p_tipo_centro is null or raiz.tipo = p_tipo_centro)
  group by raiz.id, raiz.nome, raiz.codigo
$function$;

-- ---------------------------------------------------------------------------
-- 2. Série mensal de um centro: soma a subárvore dele.
-- ---------------------------------------------------------------------------
create or replace function public.fn_rel_custo_centro_serie(
  p_centro uuid,
  p_inicio date default null::date,
  p_fim date default null::date
)
returns table(mes text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with arvore as (
    select s.id from public.fn_centro_custo_subarvore(p_centro) s
  ),
  extremos as (
    select min(l.mes_competencia) as primeiro, max(l.mes_competencia) as ultimo
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where r.centro_custo_id in (select id from arvore)
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
    where r.centro_custo_id in (select id from arvore)
      and l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
    group by l.mes_competencia
  )
  select to_char(m.mes, 'YYYY-MM'), coalesce(c.total, 0)
  from meses m
  left join custo c on c.mes = m.mes
  order by m.mes
$function$;

-- ---------------------------------------------------------------------------
-- 3. Início da vida do centro: primeiro mês da subárvore.
-- ---------------------------------------------------------------------------
create or replace function public.fn_rel_custo_centro_vida(p_centro uuid)
returns date
language sql
stable
set search_path to ''
as $function$
  select min(l.mes_competencia)
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id in (select s.id from public.fn_centro_custo_subarvore(p_centro) s)
    and l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
$function$;

-- ---------------------------------------------------------------------------
-- 4. Custo por mês (painel de Gestão): filtro de centro pela subárvore.
-- ---------------------------------------------------------------------------
create or replace function public.fn_rel_custo_por_mes(
  p_meses integer default 6,
  p_inicio date default null::date,
  p_fim date default null::date,
  p_centro_custo uuid default null::uuid,
  p_categoria uuid default null::uuid
)
returns table(mes date, total numeric, lancamentos integer)
language sql
stable
set search_path to ''
as $function$
  select
    l.mes_competencia as mes,
    sum(r.valor) as total,
    count(distinct l.id)::int as lancamentos
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
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
    and (p_categoria is null or l.categoria_id = p_categoria)
  group by l.mes_competencia
  order by l.mes_competencia
$function$;

-- ---------------------------------------------------------------------------
-- 5. Custo por grupo de insumo: os DOIS filtros de centro pela subárvore.
-- ---------------------------------------------------------------------------
-- São dois porque o grão muda: quando o lançamento vem de OC o centro está no
-- ITEM da OC (`oi.centro_custo_id`), e no avulso está no rateio. Trocar só um
-- deixaria metade do painel respondendo a árvore e a outra metade ao nó exato.
create or replace function public.fn_rel_custo_por_grupo(
  p_inicio date default null::date,
  p_fim date default null::date,
  p_centro_custo uuid default null::uuid,
  p_categoria uuid default null::uuid
)
returns table(grupo_id uuid, grupo_nome text, grupo_cor text, grupo_ordem smallint, total numeric)
language sql
stable
set search_path to ''
as $function$
  with arvore as (
    select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s
  ),
  lancs as (
    select l.id, l.origem, l.origem_id
    from public.lancamentos l
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
      and (p_categoria is null or l.categoria_id = p_categoria)
  ),
  com_insumo as (
    select g.id as grupo_id, g.nome as grupo_nome, g.cor as grupo_cor, g.ordem as grupo_ordem,
           round(sum(oi.quantidade * oi.preco_unitario), 2) as total
    from lancs l
    join public.oc_itens oi on oi.ordem_compra_id = l.origem_id
    join public.insumos i on i.id = oi.insumo_id
    join public.categorias_insumo c on c.id = i.categoria_id
    join public.insumo_grupos g on g.id = c.grupo_id
    where l.origem = 'oc'
      and (p_centro_custo is null or oi.centro_custo_id in (select id from arvore))
    group by g.id, g.nome, g.cor, g.ordem
  ),
  sem_insumo as (
    select null::uuid as grupo_id, 'Sem insumo (lançamento avulso)'::text as grupo_nome,
           'neutro'::text as grupo_cor, 99::smallint as grupo_ordem,
           round(sum(r.valor), 2) as total
    from lancs l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    where l.origem <> 'oc'
      and (p_centro_custo is null or r.centro_custo_id in (select id from arvore))
    having sum(r.valor) is not null
  )
  select * from com_insumo
  union all
  select * from sem_insumo
  order by grupo_ordem
$function$;
