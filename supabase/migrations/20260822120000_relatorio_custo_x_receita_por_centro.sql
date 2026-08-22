-- Relatório "Custo x receita por centro de custo".
--
-- Compara o custo de um conjunto de centros com a receita de OUTRO conjunto,
-- escolhidos separadamente, por mês de referência. Medido em 22/08/2026: sete
-- centros têm custo e receita zero (carretas, equipamentos, escritório, casas), e
-- a receita se concentra nas obras -- comparar "o custo da obra mais o das
-- máquinas que servem ela" contra "a receita da obra" é a pergunta real.
--
-- ## Uma função só, no grão fino
--
-- A tela mostra três coisas (cartões, gráfico por mês, tabela por centro) e esta
-- função devolve UMA linha por mês x centro-raiz x tipo. As três leituras somam as
-- MESMAS linhas, então não existe caminho para a tabela discordar do gráfico. Uma
-- função por visão seria a terceira vez em dois dias que duas contas do mesmo
-- dinheiro divergem (ver fn_saldo_conta e fn_total_da_oc).
--
-- Com 17 meses e 13 centros o grão fino dá no máximo 442 linhas: não há motivo
-- para agregar no banco o que o app soma de graça.
--
-- ## As regras do dinheiro
--
-- SOMA O RATEIO (`lancamento_rateios.valor`), não o valor do documento: é o rateio
-- que tem centro de custo. Agrupa na RAIZ da árvore, e cada centro escolhido vale
-- pela SUBÁRVORE dele (escolher a obra traz as etapas).
--
-- NATUREZA `operacional` só. As categorias de natureza `movimentacao` (aplicação,
-- resgate, financiamento) estão ativas mas hoje têm zero lançamento -- o dinheiro
-- de aplicação virou transferência entre contas e saldo inicial com data de corte.
-- O filtro é uma GUARDA: no dia em que alguém lançar um resgate de aplicação, ele
-- não entra como receita de obra. Hoje ele tira só R$ 24.199,97 de tarifa bancária
-- (natureza `financeira`) do custo.
--
-- RECEITA É A LÍQUIDA, e a retenção vem ao lado. Decisão do dono: o resultado usa
-- o que a obra efetivamente recebe (o rateio divide o líquido), e a função devolve
-- também a retenção para a tela mostrar o faturado sem esconder nada. Medido:
-- líquido R$ 39.164.731,18, retido R$ 2.985.761,68, faturado R$ 42.150.492,85, em
-- 9 documentos com retenção (as medições do DNIT).
--
-- A retenção é rateada pela FATIA do rateio (`valor / soma dos rateios do
-- lançamento`), porque ela é do documento e não tem centro próprio. Hoje todo
-- recebimento tem um rateio só, então a fatia é 1 e a conta é exata; ratear já
-- deixa certo o dia em que uma medição for dividida entre duas obras.

create or replace function public.fn_rel_custo_receita(
  p_meses date[],
  p_centros_custo uuid[] default null,
  p_centros_receita uuid[] default null
)
returns table(
  mes date,
  tipo text,
  centro_custo_id uuid,
  nome text,
  codigo text,
  total numeric,
  retencao numeric
)
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
  alvos_custo as (
    select distinct s.id
    from unnest(coalesce(p_centros_custo, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  alvos_receita as (
    select distinct s.id
    from unnest(coalesce(p_centros_receita, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  base as (
    select
      l.mes_competencia as mes,
      l.tipo,
      a.raiz_id,
      r.valor,
      (l.retencao_iss + l.retencao_pis + l.retencao_cofins + l.retencao_csll
       + l.retencao_ir + l.retencao_inss + l.retencao_outras) as retencao_doc,
      sum(r.valor) over (partition by l.id) as rateio_do_doc
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join raizes a on a.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
    where l.status <> 'cancelado'
      and coalesce(cat.natureza, 'operacional') = 'operacional'
      and l.mes_competencia = any(p_meses)
      and (
        (l.tipo = 'a_pagar' and (
          coalesce(cardinality(p_centros_custo), 0) = 0
          or r.centro_custo_id in (select alvos_custo.id from alvos_custo)))
        or
        (l.tipo = 'a_receber' and (
          coalesce(cardinality(p_centros_receita), 0) = 0
          or r.centro_custo_id in (select alvos_receita.id from alvos_receita)))
      )
  )
  select
    b.mes,
    b.tipo,
    raiz.id,
    raiz.nome,
    raiz.codigo,
    round(sum(b.valor), 2) as total,
    -- Retenção pela fatia do rateio. `nullif` porque documento de valor zero
    -- existe (estorno), e dividir por ele derrubaria a consulta inteira.
    round(coalesce(sum(b.retencao_doc * b.valor / nullif(b.rateio_do_doc, 0)), 0), 2) as retencao
  from base b
  join public.centros_custo raiz on raiz.id = b.raiz_id
  group by b.mes, b.tipo, raiz.id, raiz.nome, raiz.codigo
$function$;

comment on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) is
  'Custo x receita por centro de custo e mes de referencia, no grao mes x centro-raiz x tipo. Soma o rateio, agrupa na raiz, expande a subarvore dos centros escolhidos, conta so natureza operacional e devolve a retencao rateada pela fatia do rateio. Cartoes, grafico e tabela da tela somam estas mesmas linhas.';

revoke all on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) from public;
grant execute on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) to authenticated;

-- =====================================================================
-- Os meses que o seletor oferece
-- =====================================================================
--
-- Só mês que TEM lançamento entra na lista. Oferecer um calendário aberto
-- deixaria a pessoa escolher março de 2019 e ler "sem dados" como se fosse
-- resposta, quando a resposta é "esse mês não existe nesta base".

create or replace function public.fn_rel_meses_competencia()
returns table(mes date)
language sql
stable
set search_path to ''
as $function$
  select distinct l.mes_competencia
  from public.lancamentos l
  where l.status <> 'cancelado'
  order by 1
$function$;

comment on function public.fn_rel_meses_competencia() is
  'Meses de referencia que existem em lancamentos nao cancelados, para o seletor de meses dos relatorios.';

revoke all on function public.fn_rel_meses_competencia() from public;
grant execute on function public.fn_rel_meses_competencia() to authenticated;
