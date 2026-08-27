-- =============================================================
-- A faixa de movimentação sai, e dois empréstimos entram em Créditos
--
-- O TIAGO MANDOU O PRINT (27/08/2026): no Custo x receita, sem filtro nenhum,
-- ainda aparece a faixa "Movimentação de dívida", com Tomado R$ 0,00 e Devolvido
-- R$ 37.300,00. "pq essa movimentacao de divida ainda esta aparecendo aqui?"
--
-- ============================================================
-- A CAUSA É MINHA, E É DE ONTEM À NOITE
-- ============================================================
-- Para tirar o empréstimo dos relatórios operacionais eu usei DUAS alavancas: o
-- tipo do centro (financeiro) e a natureza da categoria ("Pagamento de
-- Empréstimo" passou a 'movimentacao'). A segunda vazou.
--
-- A categoria é usada por lançamentos em centros DIFERENTES, e um deles não é
-- financeiro: o LAN-2026-3680, R$ 37.300,00, "TRASFERENCIA PARA PAGAMENTO DE
-- EMPRESTIMO", que ele mandou deixar no Escritório Central porque não se sabe de
-- qual contrato é. Como o centro dele é operacional, a exclusão por centro não o
-- pega; como a categoria virou movimentação, ele passou a cair na faixa. Usei a
-- natureza da CATEGORIA para resolver um problema de CENTRO, e categoria é
-- compartilhada entre centros. O "Tomado R$ 0,00" do print é a assinatura disso:
-- a entrada de empréstimo está toda dentro do centro financeiro, que é excluído,
-- então a faixa só tinha o resíduo do lado de fora para mostrar.
--
-- Conferindo, achei um segundo caso que ele não viu: o LAN-2026-1816, os
-- R$ 38.500,00 do Banco da Amazônia. Esse está na etapa certa (centro
-- financeiro), então saiu dos relatórios operacionais -- mas não tem `e_divida`, e
-- o relatório de Créditos seleciona justamente por essa marca. Resultado:
-- R$ 38.500,00 fora de TODO relatório. Dinheiro invisível é pior que dinheiro no
-- lugar errado, porque não há número na tela para estranhar.
--
-- ============================================================
-- A CORREÇÃO
-- ============================================================
-- 1. Os dois ganham `e_divida`. É o que os põe em Créditos, onde a análise de
--    empréstimo passou a viver por decisão dele. Os dois estão pagos, então
--    entram como contratado quitado e não mexem em saldo devedor. O de
--    R$ 37.300,00 continua no Escritório Central, como ele pediu, e aparece na
--    lista por lançamento; a análise por contrato agrupa por etapa do centro
--    financeiro e não vai reivindicá-lo.
--
--    Fica consistente com o que já existia: o LAN-2026-0777 também é um
--    PAGAMENTO (R$ 753.193,90 de um contrato de R$ 2,6 mi) e já figurava em
--    Créditos como contratado. Este relatório mede o que a empresa deve pelo
--    lado a pagar, não o valor de face do contrato.
--
-- 2. `fn_rel_custo_receita` volta a aceitar SÓ 'operacional'. A abertura para
--    'movimentacao' foi de ontem, para o empréstimo aparecer numa faixa própria
--    em vez de somar na receita. A decisão de hoje tornou aquilo obsoleto: o
--    empréstimo não aparece mais neste relatório, em faixa nenhuma. Deixar a
--    função devolvendo linhas que o front ignora seria guardar aberta a porta
--    pela qual o resíduo entrou.
--
--    A coluna `natureza` sai do retorno junto. Coluna que sempre vale a mesma
--    coisa é pior que coluna que não existe: quem ler depois vai supor que ela
--    varia e escrever um filtro que nunca faz nada.
--
--    O R$ 37.300,00 NÃO volta a contar como custo do Escritório Central. É
--    deliberado: ele é pagamento de empréstimo, e empréstimo saiu do resultado
--    operacional por decisão dele -- o centro em que o lançamento está parado não
--    muda a natureza do que ele é. O cartão de Custo continua em
--    R$ 51.557.504,40, que é o número do print, e o dinheiro aparece em Créditos.
--
-- DROP+CREATE porque o RETURNS TABLE muda, e re-grant depois.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Os dois empréstimos sem marca entram em Créditos
-- ---------------------------------------------------------------
do $marca$
declare
  v_tocadas int;
  v_linhas_a int; v_linhas_d int;
  v_contratado_a numeric; v_contratado_d numeric;
  v_saldo_a numeric; v_saldo_d numeric;
  v_saldos_a jsonb; v_saldos_d jsonb;
begin
  select count(*), coalesce(sum(valor_contratado),0), coalesce(sum(saldo_devedor),0)
    into v_linhas_a, v_contratado_a, v_saldo_a
    from public.fn_rel_creditos();
  select jsonb_object_agg(id::text, public.fn_saldo_conta(id)) into v_saldos_a
    from public.contas_bancarias;

  update public.lancamentos l
     set e_divida = true,
         observacoes = concat_ws(E'\n',
           nullif(btrim(coalesce(l.observacoes, ''), E' \t\r\n'), ''),
           'Marcado como divida em 27/08/2026. Sem a marca ele ficava fora de TODO '
           || 'relatorio: fora dos operacionais porque a categoria "Pagamento de '
           || 'Emprestimo" e de natureza movimentacao, e fora de Creditos porque '
           || 'aquele relatorio seleciona justamente por esta marca.')
   where l.numero in ('LAN-2026-1816', 'LAN-2026-3680')
     and l.e_divida = false
     and l.status <> 'cancelado';
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 2 then
    raise exception 'Esperava marcar 2 lancamentos e marquei %.', v_tocadas;
  end if;

  select count(*), coalesce(sum(valor_contratado),0), coalesce(sum(saldo_devedor),0)
    into v_linhas_d, v_contratado_d, v_saldo_d
    from public.fn_rel_creditos();
  select jsonb_object_agg(id::text, public.fn_saldo_conta(id)) into v_saldos_d
    from public.contas_bancarias;

  -- As que TEM de mudar
  if v_linhas_d <> v_linhas_a + 2 then
    raise exception 'Creditos foi de % para % linhas (esperado +2).',
      v_linhas_a, v_linhas_d;
  end if;
  if v_contratado_d - v_contratado_a <> 75800.00 then
    raise exception
      'O contratado de Creditos foi de R$ % para R$ % (delta %, esperado 75800.00 = 38500 + 37300).',
      to_char(v_contratado_a,'FM999999999990.00'), to_char(v_contratado_d,'FM999999999990.00'),
      to_char(v_contratado_d - v_contratado_a,'FM999999999990.00');
  end if;

  -- As que NAO podem mudar: as duas parcelas estao pagas, entao entrar em
  -- Creditos nao pode somar em saldo devedor -- e marca nenhuma move saldo de
  -- conta.
  if v_saldo_d <> v_saldo_a then
    raise exception
      'O saldo devedor de Creditos mudou de R$ % para R$ %. As duas parcelas estao pagas: nao deviam somar em saldo devedor.',
      to_char(v_saldo_a,'FM999999999990.00'), to_char(v_saldo_d,'FM999999999990.00');
  end if;
  if v_saldos_d <> v_saldos_a then
    raise exception 'Algum saldo de conta mudou. Antes: %. Depois: %.',
      v_saldos_a::text, v_saldos_d::text;
  end if;

  raise notice 'Creditos: % -> % linhas, contratado R$ % -> R$ %, saldo devedor intacto em R$ %.',
    v_linhas_a, v_linhas_d,
    to_char(v_contratado_a,'FM999999999990.00'), to_char(v_contratado_d,'FM999999999990.00'),
    to_char(v_saldo_d,'FM999999999990.00');
end $marca$;

-- ---------------------------------------------------------------
-- 2. fn_rel_custo_receita volta a aceitar só operacional
-- ---------------------------------------------------------------
drop function if exists public.fn_rel_custo_receita(date[], uuid[], uuid[]);

create function public.fn_rel_custo_receita(
  p_meses date[],
  p_centros_custo uuid[] default null::uuid[],
  p_centros_receita uuid[] default null::uuid[]
)
returns table(mes date, tipo text, centro_custo_id uuid,
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
      -- O centro financeiro (Emprestimos) fica fora: a analise dele vive no
      -- relatorio de Creditos. `raiz_tipo` desce pela recursao, entao vale para a
      -- raiz E para as etapas.
      and coalesce(a.raiz_tipo, '') <> 'financeiro'
      -- SO operacional. Em 26/08 eu abri para 'movimentacao' tambem, para o
      -- emprestimo aparecer numa faixa propria em vez de somar na receita; a
      -- decisao de 27/08 (emprestimo vive so em Creditos) tornou aquilo obsoleto,
      -- e a abertura passou a ser a porta pela qual o residuo entrava: o
      -- LAN-2026-3680, R$ 37.300,00 de pagamento de emprestimo parado no
      -- Escritorio Central, aparecia na faixa porque o centro dele nao e
      -- financeiro. Fechar aqui e o que o print dele pediu.
      and coalesce(cat.natureza, 'operacional') = 'operacional'
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

revoke all on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) from public;
grant execute on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------
-- As provas
-- ---------------------------------------------------------------
do $prova$
declare
  v_meses date[];
  v_emprestimos uuid;
  v_raizes_fin int;
  v_rpc numeric; v_direto numeric; v_com_movimentacao numeric;
  v_com_raizes numeric;
  v_etapa uuid; v_volta uuid; v_centros int;
begin
  select array_agg(distinct mes_competencia) into v_meses
    from public.lancamentos where mes_competencia is not null;

  -- Duas consultas e nao um `count(*), min(id)`: nao existe min(uuid) no
  -- Postgres, e o erro so aparece em tempo de execucao (plpgsql valida SQL
  -- quando executa, nao quando cria).
  select count(*) into v_raizes_fin
    from public.centros_custo where tipo = 'financeiro' and pai_id is null;
  if v_raizes_fin <> 1 then
    raise exception
      'Achei % raizes de tipo financeiro. As provas abaixo assumem uma; confira antes de seguir.',
      v_raizes_fin;
  end if;
  select id into v_emprestimos
    from public.centros_custo where tipo = 'financeiro' and pai_id is null;

  -- (a) O custo total e o do cartao no print dele. Antes desta migration a
  --     funcao devolvia R$ 51.594.804,40, R$ 37.300,00 a mais, que o front nao
  --     somava no cartao mas mostrava na faixa.
  select coalesce(sum(total),0) into v_rpc
    from public.fn_rel_custo_receita(v_meses) where tipo = 'a_pagar';
  if v_rpc <> 51557504.40 then
    raise exception
      'O custo total deu R$ % e devia dar R$ 51.557.504,40 (o numero do cartao no print dele).',
      to_char(v_rpc,'FM999999999990.00');
  end if;

  -- (b) A MESMA soma por outro caminho: aqui a exclusao do centro financeiro e
  --     top-down (subarvore da raiz conhecida), e nao bottom-up pela recursao da
  --     funcao. Duas formulas diferentes tem de dar o mesmo numero -- (a) sozinha
  --     passaria se a recursao estivesse errada de um jeito que por acaso desse
  --     esse total.
  select coalesce(sum(r.valor),0) into v_direto
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
   where l.status <> 'cancelado'
     and l.tipo = 'a_pagar'
     and l.mes_competencia is not null
     and coalesce(cat.natureza, 'operacional') = 'operacional'
     and r.centro_custo_id not in (
       select s.id from public.fn_centro_custo_subarvore(v_emprestimos) s);
  if v_direto <> v_rpc then
    raise exception
      'A RPC diz R$ % e a soma direta diz R$ %. Uma das duas esta errada.',
      to_char(v_rpc,'FM999999999990.00'), to_char(v_direto,'FM999999999990.00');
  end if;

  -- (c) LINHA DE CONTROLE, a que TEM de dar diferente: a mesma soma direta
  --     aceitando movimentacao da R$ 37.300,00 MAIS. Sem esta, (a) e (b)
  --     passariam se o filtro de natureza nao estivesse fazendo nada -- por
  --     exemplo se a categoria tivesse voltado a ser operacional, ou se nao
  --     houvesse nenhum lancamento de movimentacao fora do centro financeiro.
  select coalesce(sum(r.valor),0) into v_com_movimentacao
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
   where l.status <> 'cancelado'
     and l.tipo = 'a_pagar'
     and l.mes_competencia is not null
     and coalesce(cat.natureza, 'operacional') in ('operacional', 'movimentacao')
     and r.centro_custo_id not in (
       select s.id from public.fn_centro_custo_subarvore(v_emprestimos) s);
  if v_com_movimentacao - v_direto <> 37300.00 then
    raise exception
      'Aceitando movimentacao a soma da R$ % contra R$ % (delta %, esperado 37300.00). O filtro de natureza nao esta cortando o que eu penso que corta.',
      to_char(v_com_movimentacao,'FM999999999990.00'), to_char(v_direto,'FM999999999990.00'),
      to_char(v_com_movimentacao - v_direto,'FM999999999990.00');
  end if;

  -- (d) O centro de emprestimo continua fora, mesmo quando escolhido de proposito
  --     nos dois lados do filtro.
  select coalesce(sum(total),0) into v_rpc
    from public.fn_rel_custo_receita(v_meses, array[v_emprestimos], array[v_emprestimos]);
  if v_rpc <> 0 then
    raise exception 'O centro Emprestimos voltou a aparecer, com R$ %.',
      to_char(v_rpc,'FM999999999990.00');
  end if;

  -- (e) A etapa continua voltando com o id DELA, e nao vestindo o pai: o
  --     agrupamento por escolhido sobreviveu ao DROP+CREATE.
  select etapa.id into v_etapa
    from public.centros_custo etapa
    join public.centros_custo raiz on raiz.id = etapa.pai_id
   where etapa.nivel = 2
     and coalesce(raiz.tipo, '') <> 'financeiro'
     and exists (select 1 from public.lancamento_rateios r
                  where r.centro_custo_id = etapa.id)
   limit 1;
  if v_etapa is null then
    raise exception 'Nao achei etapa operacional com rateio para provar o agrupamento.';
  end if;
  select count(distinct cr.centro_custo_id), min(cr.centro_custo_id::text)::uuid
    into v_centros, v_volta
    from public.fn_rel_custo_receita(v_meses, array[v_etapa], array[v_etapa]) cr;
  if v_centros <> 1 or v_volta <> v_etapa then
    raise exception
      'Filtrando por uma etapa voltaram % centros e o id % (esperado 1 e %). A etapa voltou a ser somada no pai.',
      v_centros, v_volta, v_etapa;
  end if;

  -- (f) Sem filtro tem de ser igual a filtrar por todas as raizes.
  select coalesce(sum(total),0) into v_com_raizes
    from public.fn_rel_custo_receita(v_meses,
      (select array_agg(id) from public.centros_custo where pai_id is null),
      (select array_agg(id) from public.centros_custo where pai_id is null))
   where tipo = 'a_pagar';
  if v_com_raizes <> v_direto then
    raise exception
      'Sem filtro o custo da R$ % e por todas as raizes da R$ %.',
      to_char(v_direto,'FM999999999990.00'), to_char(v_com_raizes,'FM999999999990.00');
  end if;

  raise notice 'Provas ok: custo R$ % pelos dois caminhos, movimentacao de R$ 37.300,00 cortada, centro Emprestimos fora, etapa com o id dela.',
    to_char(v_direto,'FM999999999990.00');
end $prova$;
