-- =============================================================
-- Empréstimo vive só em Créditos, e o filtro passa a aceitar etapa
--
-- PEDIDO DO TIAGO (27/08/2026): "ele passa a ser receita somente quando
-- analisando o centro de custo de emprestimo e tambem so passa a ser custo quando
-- estou analisando o cc de emprestimo, entao o ideal e fazer toda a analise do cc
-- de emprestimo dentro do relatorio de credito e ele nao deve aparecer nos
-- outros."
--
-- E, da mensagem anterior, que segue valendo: "quero poder selecionar uma etapa
-- especifica ou varias etapas do centro de custo que tiver etapas."
--
-- ============================================================
-- ELE MUDOU A DECISÃO, E PARA MELHOR
-- ============================================================
-- Meia hora antes ele havia pedido que o empréstimo entrasse como receita
-- líquida. Eu tinha escrito a migration que fazia isso (tornava "Financiamento
-- bancário" operacional) e ela ABORTOU numa guarda minha -- a prova contava
-- linhas onde devia contar centros distintos. Enquanto eu corrigia, ele mandou
-- esta mensagem. Então não há nada a desfazer: a natureza nunca mudou.
--
-- A decisão nova resolve a tensão que vinha desde 22/08. Empréstimo não é receita
-- de obra e não é custo de obra -- ele é as duas coisas apenas DENTRO da própria
-- análise, e essa análise tem lugar próprio: o relatório de Créditos.
--
-- ============================================================
-- DUAS ALAVANCAS, CADA UMA NO LUGAR CERTO
-- ============================================================
-- Os relatórios pegam o empréstimo por dois caminhos diferentes, e tapar um só
-- deixaria metade aparecendo:
--
--   por CENTRO ..... quem quebra o número por centro de custo (custo x receita,
--                    custo por centro de custo). Aqui o marcador é o
--                    `centros_custo.tipo = 'financeiro'`, e "Empréstimos" é o
--                    único centro com esse tipo. Excluir a subárvore dele tira a
--                    entrada E a despesa de uma vez.
--   por CATEGORIA .. quem agrupa por categoria e nunca olha centro (DRE, fluxo de
--                    caixa, aging, resumo da Gestão). Aqui o marcador é a
--                    natureza. A entrada já era 'movimentacao'; a DESPESA
--                    ("Pagamento de Empréstimo") era 'operacional' e por isso
--                    aparecia. Passa a 'movimentacao' também.
--
-- Essa assimetria entre as duas pernas era o defeito de origem: o mesmo contrato
-- tinha a entrada fora do resultado e a saída dentro dele.
--
-- NÃO MEXO em `fn_rel_custo_centro_serie` nem em `fn_rel_custo_centro_vida`: as
-- duas só respondem sobre centros que o usuário JÁ escolheu (p_centros é
-- obrigatório), então não há como o Empréstimos entrar sem ele pedir.
--
-- ============================================================
-- E A ETAPA NO FILTRO, QUE SÓ FUNCIONA COM O AGRUPAMENTO CERTO
-- ============================================================
-- O seletor de centro oferece só raiz desde 24/08, e o comentário da
-- `listarCentrosCustoRaiz` diz por quê: o relatório AGRUPA POR RAIZ, então
-- escolher "CAMINHÃO BOIADEIRO/MIILHO - L1620" devolvia uma linha chamada
-- "Manutenção/Documentação de Equipamentos". Sessenta e uma etapas diferentes
-- voltavam vestindo o mesmo nome, e a decisão certa foi tirar a opção em vez de
-- mostrar número errado.
--
-- A causa nunca foi o seletor. Agora a função agrupa pelo centro ESCOLHIDO:
--   escolheu a raiz         -> agrupa na raiz            (igual a antes)
--   escolheu uma etapa      -> agrupa NAQUELA etapa, com o nome dela
--   escolheu raiz E etapa   -> a etapa ganha (o `distinct on ... nivel desc`)
--   não escolheu nada       -> agrupa na raiz            (igual a antes)
--
-- O mapa entra por LEFT JOIN e faz duas coisas de uma vez: quem não está na
-- subárvore de nenhum escolhido sai (é o filtro) e quem está recebe o grupo (é o
-- agrupador). Filtrar por uma cláusula e agrupar por outra deixaria as duas
-- discordarem, e a discordância apareceria como valor somado no grupo errado.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. A despesa de empréstimo sai dos relatórios por categoria
-- ---------------------------------------------------------------
do $natureza$
declare
  v_tocadas int;
  v_saldos_a jsonb; v_saldos_d jsonb;
  v_oper_a numeric; v_oper_d numeric;
begin
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_saldos_a
    from public.contas_bancarias;
  select coalesce(sum(total),0) into v_oper_a
    from public.fn_rel_dre('2020-01-01','2030-12-31')
   where tipo = 'a_pagar' and natureza = 'operacional';

  update public.categorias_financeiras
     set natureza = 'movimentacao'
   where nome = 'Pagamento de Empréstimo'
     and natureza = 'operacional';
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception 'Esperava mudar a natureza de 1 categoria e mudei %.', v_tocadas;
  end if;

  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_saldos_d
    from public.contas_bancarias;
  select coalesce(sum(total),0) into v_oper_d
    from public.fn_rel_dre('2020-01-01','2030-12-31')
   where tipo = 'a_pagar' and natureza = 'operacional';

  -- A que NAO pode mudar. Natureza mexe em RELATORIO, nunca em dinheiro -- mas a
  -- fn_rel_posicao_bancaria tambem filtra natureza, entao trocar de 'operacional'
  -- para 'movimentacao' TIRA essas parcelas do saldo. Aqui isso e inofensivo
  -- porque todas sao anteriores as datas de corte das contas; se algum dia uma for
  -- posterior, esta guarda avisa antes de o saldo cair sozinho.
  if v_saldos_d <> v_saldos_a then
    raise exception
      'Algum saldo mudou ao trocar a natureza da despesa de emprestimo. Antes: %. Depois: %.',
      v_saldos_a::text, v_saldos_d::text;
  end if;

  -- A que TEM de mudar: a despesa operacional do DRE cai exatamente o valor da
  -- categoria (R$ 2.881.264,90 -- os R$ 2.843.964,90 do centro Emprestimos mais os
  -- R$ 37.300,00 da transferencia sem contrato, que ele mandou deixar no Escritorio
  -- Central e segue na categoria de emprestimo).
  if v_oper_a - v_oper_d <> 2881264.90 then
    raise exception
      'A despesa operacional do DRE foi de R$ % para R$ % (saiu %, esperado 2881264.90).',
      to_char(v_oper_a,'FM999999999990.00'), to_char(v_oper_d,'FM999999999990.00'),
      to_char(v_oper_a - v_oper_d,'FM999999999990.00');
  end if;

  raise notice 'Pagamento de Emprestimo agora e movimentacao. Despesa operacional do DRE: R$ % -> R$ %. Saldos intactos.',
    to_char(v_oper_a,'FM999999999990.00'), to_char(v_oper_d,'FM999999999990.00');
end $natureza$;

-- ---------------------------------------------------------------
-- 2. fn_rel_custo_receita: agrupa no escolhido e ignora centro financeiro
-- ---------------------------------------------------------------
drop function if exists public.fn_rel_custo_receita(date[], uuid[], uuid[]);

create function public.fn_rel_custo_receita(
  p_meses date[],
  p_centros_custo uuid[] default null::uuid[],
  p_centros_receita uuid[] default null::uuid[]
)
returns table(mes date, tipo text, natureza text, centro_custo_id uuid,
              nome text, codigo text, total numeric, retencao numeric)
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
  -- A etapa ganha da raiz: `nivel desc` pega o escolhido MAIS FUNDO, que e o
  -- recorte mais fino pedido. Sem isto, escolher raiz + etapa junto somaria a
  -- etapa dentro da raiz e a etapa escolhida nao apareceria em linha propria.
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
      coalesce(cat.natureza, 'operacional') as natureza,
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
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
    where l.status <> 'cancelado'
      -- O CENTRO FINANCEIRO NAO ENTRA AQUI. Toda a analise de emprestimo vive no
      -- relatorio de Creditos, por decisao dele em 27/08/2026: emprestimo nao e
      -- receita de obra nem custo de obra, e misturado neste relatorio ele fazia o
      -- centro aparecer com custo de R$ 2,84 mi e receita zero. `raiz_tipo` desce
      -- pela recursao, entao a exclusao vale para a raiz E para as etapas dela.
      and coalesce(a.raiz_tipo, '') <> 'financeiro'
      -- 'financeira' continua fora; a movimentacao entra rotulada, para a
      -- varredura (aplicacao/resgate) aparecer no bloco proprio da tela em vez de
      -- somar na receita se voltar a ser lancada.
      and coalesce(cat.natureza, 'operacional') in ('operacional', 'movimentacao')
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
    b.natureza,
    grupo.id,
    grupo.nome,
    grupo.codigo,
    round(sum(b.valor), 2) as total,
    round(coalesce(sum(b.retencao_doc * b.valor / nullif(b.rateio_do_doc, 0)), 0), 2) as retencao
  from base b
  join public.centros_custo grupo on grupo.id = b.grupo_id
  group by b.mes, b.tipo, b.natureza, grupo.id, grupo.nome, grupo.codigo
$function$;

revoke all on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) from public;
grant execute on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------
-- 3. fn_rel_custo_centro_custo também ignora o centro financeiro
-- ---------------------------------------------------------------
-- Editada por ÂNCORA a partir da definição viva, e não colada inteira: várias
-- frentes mexem nestas funções de relatório, e CREATE OR REPLACE sobrescreve sem
-- dar conflito. Se o texto tiver mudado desde que eu li, isto aborta.
do $centro_custo$
declare
  v_def text; v_novo text; v_de text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_rel_custo_centro_custo';
  if v_def is null then
    raise exception 'fn_rel_custo_centro_custo nao existe.';
  end if;

  v_de := '  where l.tipo = ''a_pagar''' || chr(10) ||
          '    and l.status <> ''cancelado''';
  v_n := (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'A ancora do WHERE aparece % vez(es) e eu esperava 1.', v_n;
  end if;

  v_novo := replace(v_def, v_de,
    '  where l.tipo = ''a_pagar''' || chr(10) ||
    '    and l.status <> ''cancelado''' || chr(10) ||
    '    -- O centro financeiro (Emprestimos) fica fora: a analise dele vive no' || chr(10) ||
    '    -- relatorio de Creditos, por decisao do Tiago em 27/08/2026.' || chr(10) ||
    '    and coalesce(raiz.tipo, '''') <> ''financeiro''');

  if v_novo = v_def then
    raise exception 'A troca saiu identica: a ancora nao pegou.';
  end if;
  execute v_novo;
end $centro_custo$;

revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) to authenticated;

-- ---------------------------------------------------------------
-- 4. A análise por contrato do centro de Empréstimos
-- ---------------------------------------------------------------
-- É o que faz o relatório de Créditos virar "toda a análise do cc de empréstimo".
-- Agrupa por ETAPA, porque etapa É contrato desde 26/08: cada empréstimo tem a
-- sua, e é o que casa a entrada do dinheiro com a dívida.
--
-- Não substitui a lista por lançamento que já existe em Créditos: aquela cobre
-- também os 10 financiamentos de equipamento, que por decisão dele ficaram no
-- centro do bem e não entram aqui.
create or replace function public.fn_rel_emprestimos_por_contrato()
returns table(
  centro_custo_id uuid,
  contrato text,
  tomado numeric,
  pago numeric,
  a_pagar numeric,
  parcelas integer,
  parcelas_pagas integer,
  proximo_vencimento date
)
language sql
stable
set search_path to ''
as $function$
  with etapas as (
    select e.id, e.nome
    from public.centros_custo e
    join public.centros_custo raiz on raiz.id = e.pai_id
    where raiz.tipo = 'financeiro'
  ),
  -- As duas pernas somadas SEPARADAMENTE e juntadas pela etapa no fim. Um join
  -- direto entre entrada e divida multiplicaria linha por linha quando a etapa
  -- tivesse mais de um lancamento de cada lado.
  entradas as (
    select et.id as etapa_id, coalesce(sum(r.valor), 0) as tomado
    from etapas et
    join public.lancamento_rateios r on r.centro_custo_id = et.id
    join public.lancamentos l on l.id = r.lancamento_id
    where l.tipo = 'a_receber' and l.status <> 'cancelado'
    group by et.id
  ),
  parcelas_da_etapa as (
    select
      et.id as etapa_id,
      count(p.id)::int as parcelas,
      count(p.id) filter (where p.status = 'pago')::int as parcelas_pagas,
      -- Parcela INTEIRA, e nao a fatia do rateio. Hoje isto e exato porque toda
      -- divida de emprestimo tem rateio num centro so; se algum dia uma for
      -- rateada entre dois centros, este numero passa a superestimar os dois, e o
      -- conserto e ponderar pela fracao do rateio (como a fn_rel_custo_receita faz
      -- com a retencao).
      coalesce(sum(p.valor_liquido) filter (where p.status = 'pago'), 0) as pago,
      coalesce(sum(p.valor) filter (where p.status <> 'pago'), 0) as a_pagar,
      min(p.data_vencimento) filter (where p.status <> 'pago') as proximo
    from etapas et
    join public.lancamento_rateios r on r.centro_custo_id = et.id
    join public.lancamentos l on l.id = r.lancamento_id
    join public.lancamento_parcelas p on p.lancamento_id = l.id
    where l.tipo = 'a_pagar' and l.status <> 'cancelado'
    group by et.id
  )
  select
    et.id,
    et.nome,
    coalesce(e.tomado, 0),
    coalesce(pe.pago, 0),
    coalesce(pe.a_pagar, 0),
    coalesce(pe.parcelas, 0),
    coalesce(pe.parcelas_pagas, 0),
    pe.proximo
  from etapas et
  left join entradas e on e.etapa_id = et.id
  left join parcelas_da_etapa pe on pe.etapa_id = et.id
  order by et.nome
$function$;

revoke all on function public.fn_rel_emprestimos_por_contrato() from public;
grant execute on function public.fn_rel_emprestimos_por_contrato() to authenticated;

-- ---------------------------------------------------------------
-- As provas
-- ---------------------------------------------------------------
do $prova$
declare
  v_meses date[];
  v_emprestimos uuid; v_siemp uuid;
  v_nome text; v_valor numeric; v_centros int;
  v_sem_filtro numeric; v_com_raizes numeric;
  v_contratos int; v_tomado numeric; v_pago numeric;
begin
  select array_agg(distinct mes_competencia) into v_meses
    from public.lancamentos where mes_competencia is not null;
  select id into v_emprestimos from public.centros_custo
   where nome = 'Empréstimos' and nivel = 1;
  select id into v_siemp from public.centros_custo
   where nome = 'Caixa Econômica - SIEMP 05/2026';

  -- (a) O centro de emprestimo SUMIU do custo x receita, dos dois lados, mesmo
  --     quando explicitamente escolhido. E o pedido dele.
  select coalesce(sum(total),0) into v_valor
    from public.fn_rel_custo_receita(v_meses, array[v_emprestimos], array[v_emprestimos]);
  if v_valor <> 0 then
    raise exception
      'O centro Emprestimos ainda traz R$ % no custo x receita. Ele tinha de sair.',
      to_char(v_valor,'FM999999999990.00');
  end if;

  -- (b) E saiu tambem quando NAO se filtra nada: o custo total cai exatamente o
  --     que o centro pesava (R$ 2.843.964,90).
  select coalesce(sum(total),0) into v_sem_filtro
    from public.fn_rel_custo_receita(v_meses) where tipo = 'a_pagar';
  if v_sem_filtro <> 51594804.40 then
    raise exception
      'O custo total sem filtro deu R$ % e devia dar R$ 51.594.804,40 (era 54.438.769,30 menos os 2.843.964,90 do centro Emprestimos).',
      to_char(v_sem_filtro,'FM999999999990.00');
  end if;

  -- (c) A ETAPA volta com o NOME DELA. Era isto que estava errado em 24/08 e que
  --     tirou a opcao do seletor. Uso uma etapa de EQUIPAMENTO, porque as de
  --     emprestimo agora estao (corretamente) fora deste relatorio.
  -- O `limit 1` vai DENTRO do subselect: numa consulta com cross join lateral e
  -- string_agg, o limit de fora nao escolhe uma etapa -- ele corta o resultado
  -- depois da agregacao, e a agregacao ja teria misturado as 61.
  select string_agg(distinct cr.nome, ' + '), count(distinct cr.centro_custo_id)
    into v_nome, v_centros
    from (select etapa.id from public.centros_custo etapa
           where etapa.nivel = 2
             and etapa.pai_id = (select id from public.centros_custo
                                  where tipo = 'manutencao' and nivel = 1 limit 1)
             and exists (select 1 from public.lancamento_rateios r
                          where r.centro_custo_id = etapa.id)
           limit 1) uma
    cross join lateral public.fn_rel_custo_receita(v_meses, array[uma.id], array[uma.id]) cr;
  if v_centros <> 1 then
    raise exception 'Uma etapa escolhida devia dar 1 centro no retorno e deu %.', v_centros;
  end if;
  if v_nome like 'Manutenção/Documenta%' then
    raise exception
      'A etapa voltou vestindo o nome do pai ("%"). E exatamente o defeito de 24/08.', v_nome;
  end if;

  -- (d) LINHA DE CONTROLE do agrupamento: sem filtro tem de dar o mesmo que
  --     filtrar por todas as raizes. Se o agrupamento novo perdeu ou duplicou
  --     rateio, e aqui que aparece.
  select coalesce(sum(total),0) into v_com_raizes
    from public.fn_rel_custo_receita(v_meses,
      (select array_agg(id) from public.centros_custo where pai_id is null),
      (select array_agg(id) from public.centros_custo where pai_id is null))
   where tipo = 'a_pagar';
  if v_sem_filtro <> v_com_raizes then
    raise exception
      'Sem filtro o custo da R$ % e por todas as raizes da R$ %. O agrupamento perdeu ou duplicou rateio.',
      to_char(v_sem_filtro,'FM999999999990.00'), to_char(v_com_raizes,'FM999999999990.00');
  end if;

  -- (e) A analise por contrato existe e fecha com o que eu sei dos numeros.
  select count(*), coalesce(sum(tomado),0), coalesce(sum(pago),0)
    into v_contratos, v_tomado, v_pago
    from public.fn_rel_emprestimos_por_contrato();
  if v_contratos <> 6 then
    raise exception 'Esperava 6 contratos (as 6 etapas de Emprestimos) e vieram %.', v_contratos;
  end if;
  if v_tomado <> 4261910.46 then
    raise exception 'O tomado somado devia dar R$ 4.261.910,46 e deu R$ %.',
      to_char(v_tomado,'FM999999999990.00');
  end if;

  -- (f) E a etapa do SIEMP tem de trazer o SEU tomado, nao o total.
  select tomado into v_valor from public.fn_rel_emprestimos_por_contrato()
   where centro_custo_id = v_siemp;
  if v_valor <> 963910.46 then
    raise exception 'A etapa SIEMP devia ter tomado R$ 963.910,46 e tem R$ %.',
      to_char(v_valor,'FM999999999990.00');
  end if;

  raise notice 'Provas ok: Emprestimos fora do custo x receita (total agora R$ %), etapa volta com o nome dela, e 6 contratos com R$ % tomados e R$ % pagos.',
    to_char(v_sem_filtro,'FM999999999990.00'),
    to_char(v_tomado,'FM999999999990.00'),
    to_char(v_pago,'FM999999999990.00');
end $prova$;
