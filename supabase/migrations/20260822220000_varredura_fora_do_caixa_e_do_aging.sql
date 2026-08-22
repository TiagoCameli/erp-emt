-- =============================================================
-- A varredura sai TAMBEM do fluxo de caixa, do aging e dos KPIs de Gestao
--
-- Continuacao direta da opcao A (20260822210000). Achado ao conferir a coerencia
-- do modulo depois de aplicar o saldo: tres funcoes somam parcela e NAO olhavam
-- natureza, entao o mesmo dinheiro que acabou de sair do DRE e do saldo continuava
-- inflando as outras telas do mesmo modulo.
--
-- MEDIDO EM 22/08/2026, ANTES DE APLICAR:
--
--   Fluxo de caixa, entradas ..... 31.524.771,98   dos quais 14.163.547,98 (45%)
--                                                  eram varredura
--   Fluxo de caixa, saidas ....... 63.937.446,61   dos quais 10.854.817,87 (17%)
--
-- Quarenta e cinco por cento das entradas do fluxo de caixa eram a propria conta
-- se aplicando e resgatando. Nao e detalhe: e a tela em que se olha "quanto entra
-- e quanto sai por mes" para decidir pagamento.
--
-- ============================================================
-- POR QUE O AGING TAMBEM, SE HOJE ELE NAO MUDA NADA
-- ============================================================
-- Parcela de varredura em aberto: ZERO hoje (todas nascem pagas, vem do extrato).
-- Entao este filtro nao muda um centavo do aging agora.
--
-- Entra de proposito, porque "hoje zero" nao e invariante e aplicacao financeira
-- nao e divida: o dia em que uma aplicacao for lancada como programada, ela
-- apareceria na fila de "a pagar vencido" e alguem tentaria pagar duas vezes o
-- que o banco varreu sozinho. Mais barato barrar agora que descobrir depois.
--
-- ============================================================
-- O MESMO CUIDADO DO LEFT JOIN
-- ============================================================
-- `lancamentos.categoria_id` e nulavel nas tres. Join comum descartaria parcela
-- de lancamento sem categoria em silencio -- no fluxo de caixa isso ESCONDERIA
-- saida de dinheiro, que e pior que mostrar a mais. left join + coalesce.
--
-- ============================================================
-- O QUE NAO ENTRA NESTA MIGRATION, E POR QUE
-- ============================================================
-- Os relatorios de CUSTO (fn_rel_custo_*) continuam mostrando o centro de custo
-- "Investimentos". Medido: em 2026 ele e o TERCEIRO maior "centro de custo",
-- R$ 4.992.073,68, acima de obras reais como o Ramal do Gama -- e esta cadastrado
-- com tipo 'obra', entao aparece junto das obras no filtro e na escala do
-- grafico.
--
-- Isso e assunto proprio e nao e obvio como este: pode ser resolvido filtrando a
-- natureza nas sete funcoes de custo, ou mudando o `tipo` do centro no cadastro,
-- e a segunda opcao e decisao do Tiago sobre como ele quer ver a arvore de
-- centros. Fica relatado, com o numero, em vez de decidido por conta propria.
-- =============================================================

-- ---------- 1. fluxo de caixa ----------
create or replace function public.fn_rel_fluxo_caixa()
returns table(mes text, tipo text, realizado boolean, total numeric)
language sql
stable
set search_path to ''
as $function$
  select t.mes, t.tipo, t.realizado, sum(t.valor) as total
  from (
    select
      case
        when p.status = 'pago'
          then to_char(coalesce(p.data_pagamento, p.data_vencimento), 'YYYY-MM')
        else to_char(coalesce(p.data_programada, p.data_vencimento), 'YYYY-MM')
      end as mes,
      l.tipo,
      (p.status = 'pago') as realizado,
      -- Realizado sai pelo liquido (foi o que passou no caixa). Previsto tem
      -- desconto zero por construcao, entao a linha nao paga nao muda: o
      -- desconto so nasce no ato do pagamento e o estorno o zera.
      p.valor_liquido as valor
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    where p.status <> 'cancelado'
      and l.status <> 'cancelado'
      -- Opcao A: aplicar o saldo a noite e resgatar na manha seguinte nao e
      -- caixa entrando nem saindo. Era 45% das entradas desta tela.
      and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
  ) t
  where t.mes is not null
  group by t.mes, t.tipo, t.realizado
$function$;

revoke all on function public.fn_rel_fluxo_caixa() from public, anon;
grant execute on function public.fn_rel_fluxo_caixa() to authenticated;

comment on function public.fn_rel_fluxo_caixa() is
  'Entradas e saidas por mes, realizado e previsto. Ignora categoria de natureza movimentacao: aplicacao e resgate do principal nao sao caixa (opcao A, 22/08/2026).';

-- ---------- 2. aging ----------
create or replace function public.fn_rel_aging(p_hoje date default null::date)
returns table(tipo text, faixa_prazo text, faixa_aging text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with corte as (
    select coalesce(p_hoje, (now() at time zone 'America/Rio_Branco')::date) as hoje
  ),
  parcela as (
    -- dias positivo = ainda vai vencer; negativo = ja venceu; nulo = sem data.
    select
      l.tipo as tipo,
      p.valor as valor,
      p.data_vencimento - c.hoje as dias
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    cross join corte c
    where p.status in ('pendente', 'em_revisao', 'aprovado')
      and l.status <> 'cancelado'
      -- Aplicacao financeira nao e divida a vencer. Hoje nao muda nada (zero
      -- parcelas de varredura em aberto), e e por isso mesmo que entra agora.
      and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
  )
  select
    b.tipo,
    case
      when b.dias is null then 'sem_data'
      when b.dias < 0     then 'vencido'
      when b.dias <= 7    then 'ate_7'
      when b.dias <= 15   then 'd_8_15'
      when b.dias <= 30   then 'd_16_30'
      when b.dias <= 60   then 'd_31_60'
      else                     'acima_60'
    end,
    case
      when b.dias is null  then 'a_vencer'
      when b.dias >= 0     then 'a_vencer'
      when b.dias >= -7    then 'v_1_7'
      when b.dias >= -15   then 'v_8_15'
      when b.dias >= -30   then 'v_16_30'
      when b.dias >= -60   then 'v_31_60'
      else                      'v_60_mais'
    end,
    sum(b.valor)
  from parcela b
  group by 1, 2, 3
$function$;

revoke all on function public.fn_rel_aging(date) from public, anon;
grant execute on function public.fn_rel_aging(date) to authenticated;

comment on function public.fn_rel_aging(date) is
  'Idade dos vencimentos em aberto. Ignora categoria de natureza movimentacao: aplicacao financeira nao e divida a vencer (opcao A, 22/08/2026).';

-- ---------- 3. KPIs de Gestao > Financeiro ----------
create or replace function public.fn_rel_gestao_financeiro_resumo(p_hoje date default null::date)
returns table(a_pagar_contagem integer, a_pagar_vencidas integer, a_pagar_valor numeric, a_aprovar_contagem integer, a_aprovar_valor numeric, pago_mes_contagem integer, pago_mes_valor numeric)
language sql
stable
set search_path to ''
as $function$
  with janela as (
    select
      d.hoje,
      d.hoje + 7 as limite7,
      date_trunc('month', d.hoje)::date as inicio_mes,
      (date_trunc('month', d.hoje) + interval '1 month')::date as proximo_mes
    from (
      select coalesce(
        p_hoje,
        (now() at time zone 'America/Rio_Branco')::date
      ) as hoje
    ) d
  ),
  base as (
    -- Lancamento cancelado nao e divida: fora dos tres cortes, com o MESMO
    -- criterio das fn_rel_* irmas. Parcela cancelada ja cai fora sozinha,
    -- porque cada corte abaixo exige um status exato de parcela.
    select p.status, p.valor, p.valor_liquido, p.data_vencimento, p.data_pagamento
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      -- "Pago no mes" contava a varredura do mes como pagamento feito, o que
      -- fazia o cartao mostrar milhoes que nunca sairam da empresa.
      and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
  )
  -- left join ... on true garante uma linha mesmo com base vazia: os FILTER
  -- viram falso e a funcao devolve zeros, nunca "nenhuma linha".
  select
    count(*) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    )::int,
    count(*) filter (
      where b.status = 'aprovado'
        and b.data_vencimento <= j.limite7
        and b.data_vencimento < j.hoje
    )::int,
    -- A pagar e a aprovar seguem no valor CHEIO: e divida em aberto, e desconto
    -- ainda nao houve (parcela nao paga tem desconto zero de todo jeito).
    coalesce(sum(b.valor) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    ), 0),
    count(*) filter (where b.status = 'pendente')::int,
    coalesce(sum(b.valor) filter (where b.status = 'pendente'), 0),
    count(*) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    )::int,
    -- Pago no mes e caixa que saiu: liquido.
    coalesce(sum(b.valor_liquido) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    ), 0)
  from janela j
  left join base b on true
$function$;

revoke all on function public.fn_rel_gestao_financeiro_resumo(date) from public, anon;
grant execute on function public.fn_rel_gestao_financeiro_resumo(date) to authenticated;

comment on function public.fn_rel_gestao_financeiro_resumo(date) is
  'KPIs de Gestao > Financeiro. Ignora categoria de natureza movimentacao: a varredura da conta nao e conta a pagar nem pagamento do mes (opcao A, 22/08/2026).';
