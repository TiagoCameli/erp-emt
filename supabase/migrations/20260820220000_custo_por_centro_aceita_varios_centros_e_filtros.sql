-- Relatório "Custo por centro de custo": vários centros por vez, mais os filtros
-- de status do lançamento e de forma de pagamento.
--
-- As três funções mudam de ASSINATURA (escalar vira array), então é DROP + CREATE:
-- `create or replace` não troca o tipo de um parâmetro. E o grant tem que ser
-- refeito na mão, porque função nova nasce com EXECUTE para PUBLIC e este projeto
-- revoga isso de propósito (ver 20260820190100).
--
-- Além do que foi pedido, três consertos que a leitura destas funções expôs:
--
-- 1. O app montava o centro escolhido e nunca mandava: `p_centro_custo` existia e
--    chegava sempre nulo. Medido em 07/2026: sem filtro são 9 linhas e
--    R$ 6.918.483,54; com o centro 009 é 1 linha e R$ 3.372.968,17. Na tela os dois
--    davam o mesmo número, e no modo "vida do centro" o gráfico era de um centro
--    com a tabela do lado somando todos.
-- 2. A série ignorava categoria, fornecedor e "excluir previsto", que os cartões ao
--    lado aplicavam: gráfico e cartão do mesmo recorte discordavam.
-- 3. `p_fim` é EXCLUSIVO nos cartões (`mes_competencia < p_fim`) e era INCLUSIVO na
--    série, que desenhava um mês além da janela: pedindo até 07/2026 ela devolvia
--    2026-08 com R$ 1.192.759,63.
--
-- Convenção dos parâmetros novos: array nulo OU vazio significa "sem filtro", para
-- o número de hoje não mudar sozinho em nenhuma tela que ainda não passou a mandar
-- o parâmetro.

-- =====================================================================
-- 1. Custo por centro de custo (cartões, gráfico e tabela)
-- =====================================================================

drop function if exists public.fn_rel_custo_centro_custo(date, date, uuid, uuid, uuid, boolean, text);

create function public.fn_rel_custo_centro_custo(
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
  -- Escolher um centro vale para a SUBÁRVORE dele: quem escolhe a obra quer as
  -- etapas dela, e comparar no id da etapa perdia dinheiro em silêncio.
  alvos as (
    select distinct s.id
    from unnest(coalesce(p_centros, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  )
  select raiz.id, raiz.nome, raiz.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join raizes a on a.centro_id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = a.raiz_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (not coalesce(p_excluir_previsto, false) or l.status <> 'previsto')
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (
      coalesce(cardinality(p_centros), 0) = 0
      or r.centro_custo_id in (select alvos.id from alvos)
    )
    and (
      coalesce(cardinality(p_categorias), 0) = 0
      or l.categoria_id = any(p_categorias)
    )
    and (
      coalesce(cardinality(p_fornecedores), 0) = 0
      or l.fornecedor_id = any(p_fornecedores)
    )
    and (coalesce(cardinality(p_status), 0) = 0 or l.status = any(p_status))
    -- Forma de pagamento é a única com duas pernas: 880 lançamentos a pagar não
    -- têm forma nenhuma (R$ 13,4 mi), então "sem forma" precisa ser uma escolha
    -- marcável, e não um resto invisível.
    and (
      (coalesce(cardinality(p_formas), 0) = 0 and not coalesce(p_sem_forma, false))
      or l.forma_pagamento_id = any(coalesce(p_formas, '{}'::uuid[]))
      or (coalesce(p_sem_forma, false) and l.forma_pagamento_id is null)
    )
    and (
      coalesce(cardinality(p_tipos_centro), 0) = 0
      or raiz.tipo = any(p_tipos_centro)
    )
  group by raiz.id, raiz.nome, raiz.codigo
$function$;

revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) to authenticated;

-- =====================================================================
-- 2. Vida de cada centro: quando ele começou
-- =====================================================================

drop function if exists public.fn_rel_custo_centro_vida(uuid);

create function public.fn_rel_custo_centro_vida(p_centros uuid[])
returns table(centro_custo_id uuid, primeiro_mes date)
language sql
stable
set search_path to ''
as $function$
  -- Uma linha por centro ESCOLHIDO, não por centro que existe: centro sem
  -- lançamento nenhum não volta, e quem chama lê a ausência como "este centro
  -- ainda não tem vida" em vez de mostrar o total geral no lugar.
  --
  -- Sem os filtros da tela de propósito: a vida do centro é quando ele começou a
  -- gastar, e não quando começou a gastar com aquele fornecedor. É ela que define
  -- a janela, então filtrá-la moveria o começo do eixo junto com o filtro.
  select escolhido.id, min(l.mes_competencia)
  from unnest(coalesce(p_centros, '{}'::uuid[])) as escolhido(id)
  cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  join public.lancamento_rateios r on r.centro_custo_id = s.id
  join public.lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
  group by escolhido.id
$function$;

revoke all on function public.fn_rel_custo_centro_vida(uuid[]) from public;
grant execute on function public.fn_rel_custo_centro_vida(uuid[]) to authenticated;

-- =====================================================================
-- 3. Série mensal: uma linha por centro escolhido
-- =====================================================================

drop function if exists public.fn_rel_custo_centro_serie(uuid, date, date);

create function public.fn_rel_custo_centro_serie(
  p_centros uuid[],
  p_inicio date default null,
  p_fim date default null,
  p_categorias uuid[] default null,
  p_fornecedores uuid[] default null,
  p_formas uuid[] default null,
  p_sem_forma boolean default false,
  p_status text[] default null,
  p_excluir_previsto boolean default false
)
returns table(centro_custo_id uuid, nome text, codigo text, mes text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with alvos as (
    select escolhido.id as centro_id, s.id as descendente
    from unnest(coalesce(p_centros, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  custo as (
    -- Sem corte de período aqui de propósito: é de `custo` que sai o primeiro mês
    -- de cada centro, e cortar pela janela faria a vida do centro começar onde a
    -- janela começa. Quem corta o que aparece é `meses`, lá embaixo.
    select a.centro_id, l.mes_competencia as mes, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join alvos a on a.descendente = r.centro_custo_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and (not coalesce(p_excluir_previsto, false) or l.status <> 'previsto')
      and (
        coalesce(cardinality(p_categorias), 0) = 0
        or l.categoria_id = any(p_categorias)
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
      -- Cada linha começa na vida DELA. Antes do primeiro lançamento do centro a
      -- série não tem ponto, e não tem zero: uma reta no zero desde 2024 se lê
      -- como obra que já existia e não gastava. Depois que ela nasce, mês sem
      -- custo é zero de verdade e o gráfico mostra a obra parada.
      greatest(
        coalesce(date_trunc('month', p_inicio)::date, e.primeiro),
        e.primeiro
      ) as inicio,
      -- `p_fim` é EXCLUSIVO, igual ao dos cartões (o app manda o primeiro dia do
      -- mês seguinte). Sem o recuo de um mês a série desenhava um mês a mais que
      -- a janela pedida, com valor cheio.
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

revoke all on function public.fn_rel_custo_centro_serie(uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean) from public;
grant execute on function public.fn_rel_custo_centro_serie(uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean) to authenticated;
