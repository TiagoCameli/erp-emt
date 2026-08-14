-- Filtros do painel de Gestão: obra/centro de custo, período por mês de
-- referência e categoria financeira nas três funções de custo.
--
-- Por que DROP + CREATE, e não CREATE OR REPLACE: os parâmetros novos mudam a
-- lista de argumentos, e no Postgres isso cria uma SOBRECARGA em vez de
-- substituir. Com a antiga viva, a chamada de 1 (ou 2, ou 3) argumento passa a
-- casar com as duas e o banco responde "function is not unique". Então a antiga
-- sai na mesma transação em que a nova entra.
--
-- Compatibilidade: todo parâmetro novo entra com DEFAULT NULL e no FIM da lista,
-- então quem já chamava continua chamando igual. Isso importa porque
-- fn_rel_custo_centro_custo e fn_rel_custo_por_grupo também são usadas pelos
-- relatórios do Financeiro (src/modules/financeiro/relatorios/queries.ts), não
-- só pelo painel.
--
-- As três seguem SECURITY INVOKER (sem SECURITY DEFINER), STABLE e
-- search_path vazio, como estavam: o filtro é conveniência de tela, não pode
-- virar caminho para ler o que a RLS do usuário não deixa.

-- ---------------------------------------------------------------------------
-- 1. Custo por mês de referência
-- ---------------------------------------------------------------------------
drop function if exists public.fn_rel_custo_por_mes(integer);

create function public.fn_rel_custo_por_mes(
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
  select
    l.mes_competencia as mes,
    sum(r.valor) as total,
    count(distinct l.id)::int as lancamentos
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    -- Período explícito manda. Sem ele, vale a janela dos últimos p_meses, que
    -- é o comportamento que o painel tinha antes de existir filtro.
    and (
      p_inicio is not null
      or l.mes_competencia >= (
        date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date
        - ((greatest(coalesce(p_meses, 6), 1) - 1) || ' months')::interval
      )::date
    )
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    -- p_fim é EXCLUSIVO, igual às outras duas funções: quem chama passa o dia 1
    -- do mês seguinte ao último desejado.
    and (p_fim is null or l.mes_competencia < p_fim)
    -- Centro de custo mora no rateio: um lançamento pode ser dividido entre
    -- várias obras, e filtrar aqui soma só a parte que caiu na obra pedida.
    and (p_centro_custo is null or r.centro_custo_id = p_centro_custo)
    and (p_categoria is null or l.categoria_id = p_categoria)
  group by l.mes_competencia
  order by l.mes_competencia
$function$;

grant execute on function public.fn_rel_custo_por_mes(
  integer, date, date, uuid, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Custo por centro de custo
-- ---------------------------------------------------------------------------
drop function if exists public.fn_rel_custo_centro_custo(date, date);

create function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null
)
returns table(centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select r.centro_custo_id, cc.nome, cc.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (p_centro_custo is null or r.centro_custo_id = p_centro_custo)
    and (p_categoria is null or l.categoria_id = p_categoria)
  group by r.centro_custo_id, cc.nome, cc.codigo
$function$;

grant execute on function public.fn_rel_custo_centro_custo(
  date, date, uuid, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Custo por grupo de insumo
-- ---------------------------------------------------------------------------
-- Só ganha p_categoria: centro e período ela já tinha. Não ganha filtro de
-- grupo de propósito, porque ela É a quebra por grupo.
drop function if exists public.fn_rel_custo_por_grupo(date, date, uuid);

create function public.fn_rel_custo_por_grupo(
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
  with lancs as (
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
      and (p_centro_custo is null or oi.centro_custo_id = p_centro_custo)
    group by g.id, g.nome, g.cor, g.ordem
  ),
  sem_insumo as (
    select null::uuid as grupo_id, 'Sem insumo (lançamento avulso)'::text as grupo_nome,
           'neutro'::text as grupo_cor, 99::smallint as grupo_ordem,
           round(sum(r.valor), 2) as total
    from lancs l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    where l.origem <> 'oc'
      and (p_centro_custo is null or r.centro_custo_id = p_centro_custo)
    having sum(r.valor) is not null
  )
  select * from com_insumo
  union all
  select * from sem_insumo
  order by grupo_ordem
$function$;

grant execute on function public.fn_rel_custo_por_grupo(
  date, date, uuid, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Trava: se o grant não pegou, esta migration não passa
-- ---------------------------------------------------------------------------
-- Recriar função apaga o ACL dela, e função sem execute para `authenticated`
-- deixa o painel em branco sem erro visível na tela. A exceção aqui aborta a
-- transação, então a versão nunca é registrada com o grant faltando.
do $$
declare
  faltando text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into faltando
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'fn_rel_custo_por_mes',
      'fn_rel_custo_centro_custo',
      'fn_rel_custo_por_grupo'
    )
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if faltando is not null then
    raise exception 'authenticated sem EXECUTE em: %', faltando;
  end if;

  -- Nenhuma delas pode ter virado SECURITY DEFINER na recriação: isso furaria a
  -- RLS do usuário no painel.
  select string_agg(p.proname, ', ') into faltando
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'fn_rel_custo_por_mes',
      'fn_rel_custo_centro_custo',
      'fn_rel_custo_por_grupo'
    )
    and p.prosecdef;

  if faltando is not null then
    raise exception 'função de relatório virou SECURITY DEFINER: %', faltando;
  end if;
end $$;
