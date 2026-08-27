-- =============================================================
-- O empréstimo tomado aparece nos relatórios (e para de aparecer errado)
--
-- O TIAGO MANDOU O PRINT (27/08/2026): no relatório "Custo x receita por centro
-- de custo", com Empréstimos escolhido nos dois lados, o custo aparece
-- (R$ 2.843.964,90) e a receita fica R$ 0,00. "os recebimentos dos emprestimos
-- nao esta aparecendo nos relatorios".
--
-- Investigando, achei DOIS problemas -- e o que ele não viu é o pior.
--
-- ============================================================
-- 1. O BUG: Créditos mostra a entrada como dívida QUITADA
-- ============================================================
-- `fn_rel_creditos` seleciona por `where l.e_divida` e não olha o TIPO do
-- lançamento. Os três empréstimos que lancei ontem são `a_receber` (a entrada do
-- dinheiro) marcados com `e_divida`, então entraram na lista assim:
--
--   Empréstimo Cap Giro Digital 23411259 | (sem credor) | contratado 1.000.000,00
--                                        | pago 1.000.000,00 | saldo devedor 0
--
-- Três linhas dizendo que a empresa tomou R$ 4.261.910,46 e já quitou tudo. É
-- falso nos três campos: o credor sai vazio porque a função lê `fornecedor_id`
-- (nulo num a receber, o banco está em `cliente_id`), e "pago" é a parcela do
-- RECEBIMENTO, não amortização.
--
-- A CAUSA É MINHA, e é conceitual: `e_divida` marca o lado que a empresa DEVE --
-- um a_pagar com plano de parcelas, que é o que o relatório mede. Pôr a marca na
-- entrada do dinheiro fez o relatório somar as duas pernas do empréstimo como se
-- fossem duas dívidas.
--
-- Correção em dois passos, porque um só não basta:
--   a) tirar `e_divida` dos três `a_receber`. A entrada continua identificável
--      pela categoria ("Financiamento bancário") e pela etapa do contrato no
--      centro Empréstimos -- que é onde ela tem de ser lida.
--   b) `fn_rel_creditos` passa a exigir `tipo = 'a_pagar'`. Sem isto, o próximo
--      a_receber marcado por engano volta a poluir, e a tela mente de novo.
--
-- ============================================================
-- 2. O QUE ELE VIU: a natureza sumia com a entrada
-- ============================================================
-- `fn_rel_custo_receita` filtra `natureza = 'operacional'`. A categoria
-- "Financiamento bancário" é 'movimentacao' (decisão de 22/08: dinheiro que tem
-- de ser devolvido não é receita e fica fora do resultado), então a entrada
-- desaparece do relatório inteiro.
--
-- E havia uma ASSIMETRIA que eu criei sem perceber: a DESPESA de empréstimo tem
-- categoria "Pagamento de Empréstimo", que é operacional, e por isso aparece. O
-- mesmo contrato tinha as duas pernas em naturezas diferentes -- uma dentro do
-- resultado e outra fora. É exatamente o que o print mostra: custo de R$ 2,84
-- milhões e receita zero no mesmo centro.
--
-- A função passa a trazer as duas naturezas E a devolver qual é, para o front
-- separar. NÃO removo o filtro: se eu simplesmente aceitasse tudo, a varredura
-- (aplicação/resgate, também 'movimentacao') voltaria a poluir o relatório no dia
-- em que alguém a lançasse de novo -- foi ela que inflou 31,7% da receita de 2026
-- antes de 22/08. Trazer a natureza no retorno deixa o front decidir, e o front
-- vai manter custo, receita, resultado e margem contando SÓ operacional.
--
-- DROP+CREATE porque o RETURNS TABLE muda, e re-grant depois: função nova nasce
-- com EXECUTE para PUBLIC, e PUBLIC inclui o `anon`.
--
-- ============================================================
-- AS GUARDAS
-- ============================================================
-- A que NÃO pode mudar: a soma do saldo devedor em Créditos. As três linhas
-- falsas tinham saldo zero (a parcela estava paga), então tirá-las não pode mexer
-- em quanto a empresa deve. Se mexer, saiu dívida verdadeira junto.
-- A que TEM de mudar: o "contratado" cai exatamente R$ 4.261.910,46, e as linhas
-- vão de 15 para 12. Sem ela, a de cima passaria igual se nada tivesse saído.
-- =============================================================

-- ---------------------------------------------------------------
-- 1a. A marca sai dos três a_receber
-- ---------------------------------------------------------------
do $marca$
declare
  v_tocadas int;
  v_saldo_a numeric; v_saldo_d numeric;
  v_contratado_a numeric; v_contratado_d numeric;
  v_linhas_a int; v_linhas_d int;
begin
  select count(*), coalesce(sum(saldo_devedor),0), coalesce(sum(valor_contratado),0)
    into v_linhas_a, v_saldo_a, v_contratado_a
    from public.fn_rel_creditos();

  update public.lancamentos
     set e_divida = false,
         observacoes = concat_ws(E'\n', observacoes,
           'Marca "é dívida" retirada em 27/08/2026. Ela é do lado a PAGAR: o '
           || 'relatório de Créditos mede saldo devedor por parcela a pagar, e com '
           || 'a marca na entrada do dinheiro ele mostrava este empréstimo como '
           || 'dívida já quitada, sem credor. A entrada continua identificada pela '
           || 'categoria "Financiamento bancário" e pela etapa do contrato no '
           || 'centro Empréstimos.')
   where tipo = 'a_receber' and e_divida and status <> 'cancelado';
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 3 then
    raise exception 'Esperava desmarcar 3 recebimentos de emprestimo e desmarquei %.', v_tocadas;
  end if;

  select count(*), coalesce(sum(saldo_devedor),0), coalesce(sum(valor_contratado),0)
    into v_linhas_d, v_saldo_d, v_contratado_d
    from public.fn_rel_creditos();

  -- A que nao pode mudar: as falsas tinham saldo zero.
  if v_saldo_d <> v_saldo_a then
    raise exception
      'O saldo devedor total mudou de R$ % para R$ %. As tres linhas falsas tinham saldo zero: saiu divida verdadeira junto.',
      to_char(v_saldo_a,'FM999999999990.00'), to_char(v_saldo_d,'FM999999999990.00');
  end if;

  -- As que tem de mudar.
  if v_contratado_a - v_contratado_d <> 4261910.46 then
    raise exception
      'O contratado foi de R$ % para R$ % (saiu %, esperado 4261910.46).',
      to_char(v_contratado_a,'FM999999999990.00'), to_char(v_contratado_d,'FM999999999990.00'),
      to_char(v_contratado_a - v_contratado_d,'FM999999999990.00');
  end if;
  if v_linhas_d <> v_linhas_a - 3 then
    raise exception 'As linhas de Creditos foram de % para % (esperado -3).',
      v_linhas_a, v_linhas_d;
  end if;

  raise notice 'Creditos: % -> % linhas, contratado R$ % -> R$ %, saldo devedor intacto em R$ %.',
    v_linhas_a, v_linhas_d,
    to_char(v_contratado_a,'FM999999999990.00'), to_char(v_contratado_d,'FM999999999990.00'),
    to_char(v_saldo_d,'FM999999999990.00');
end $marca$;

-- ---------------------------------------------------------------
-- 1b. Créditos passa a ser só do lado a pagar
-- ---------------------------------------------------------------
create or replace function public.fn_rel_creditos()
returns table(lancamento_id uuid, numero text, credor text, descricao text,
              categoria text, valor_contratado numeric, total_pago numeric,
              saldo_devedor numeric, parcelas integer, parcelas_pagas integer,
              proximo_vencimento date)
language sql
stable
set search_path to ''
as $function$
  select
    l.id,
    l.numero,
    coalesce(f.nome_fantasia, f.razao_social, '(sem credor)') as credor,
    l.descricao,
    coalesce(cf.nome, '(sem categoria)') as categoria,
    l.valor as valor_contratado,
    coalesce(sum(p.valor_liquido) filter (where p.status = 'pago'), 0) as total_pago,
    coalesce(sum(p.valor) filter (where p.status <> 'pago'), 0) as saldo_devedor,
    count(p.id)::int as parcelas,
    count(p.id) filter (where p.status = 'pago')::int as parcelas_pagas,
    min(p.data_vencimento) filter (where p.status <> 'pago') as proximo_vencimento
  from public.lancamentos l
  left join public.lancamento_parcelas p on p.lancamento_id = l.id
  left join public.fornecedores f on f.id = l.fornecedor_id
  left join public.categorias_financeiras cf on cf.id = l.categoria_id
  where l.e_divida
    -- SO o lado que a empresa DEVE. Este relatorio mede saldo devedor por parcela
    -- a pagar, e um a_receber marcado por engano aparecia como divida quitada:
    -- credor vazio (a funcao le fornecedor_id, nulo no a receber), "pago" igual ao
    -- contratado e saldo zero. Aconteceu com 3 lancamentos em 26/08/2026.
    and l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
  group by l.id, l.numero, f.nome_fantasia, f.razao_social, l.descricao, cf.nome, l.valor
$function$;

revoke all on function public.fn_rel_creditos() from public;
grant execute on function public.fn_rel_creditos() to authenticated;

-- ---------------------------------------------------------------
-- 2. fn_rel_custo_receita devolve a natureza
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
      coalesce(cat.natureza, 'operacional') as natureza,
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
      -- Operacional E movimentacao, e a natureza vai no retorno para o front
      -- separar. A movimentacao existe aqui por causa do emprestimo tomado, que
      -- antes desaparecia: era o print do Tiago em 27/08/2026, com custo de
      -- R$ 2,84 mi e receita zero no centro Emprestimos.
      --
      -- Nao aceito qualquer natureza: 'financeira' continua fora, e a filtragem
      -- explicita e o que impede a varredura (aplicacao/resgate, tambem
      -- 'movimentacao') de voltar a inflar o relatorio se alguem a lancar de novo
      -- -- ela era 31,7% da receita de 2026 antes de 22/08. Quem decide o que faz
      -- parte do RESULTADO e o front, e ele conta so operacional.
      and coalesce(cat.natureza, 'operacional') in ('operacional', 'movimentacao')
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
    b.natureza,
    raiz.id,
    raiz.nome,
    raiz.codigo,
    round(sum(b.valor), 2) as total,
    round(coalesce(sum(b.retencao_doc * b.valor / nullif(b.rateio_do_doc, 0)), 0), 2) as retencao
  from base b
  join public.centros_custo raiz on raiz.id = b.raiz_id
  group by b.mes, b.tipo, b.natureza, raiz.id, raiz.nome, raiz.codigo
$function$;

revoke all on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) from public;
grant execute on function public.fn_rel_custo_receita(date[], uuid[], uuid[]) to authenticated;

-- Prova de que a funcao nova enxerga o emprestimo, sem depender do front.
do $prova$
declare
  v_emprestimos uuid;
  v_operacional numeric; v_movimentacao numeric;
begin
  select id into v_emprestimos from public.centros_custo
   where nome = 'Empréstimos' and nivel = 1;

  select
    coalesce(sum(total) filter (where natureza = 'operacional' and tipo = 'a_receber'), 0),
    coalesce(sum(total) filter (where natureza = 'movimentacao' and tipo = 'a_receber'), 0)
  into v_operacional, v_movimentacao
  from public.fn_rel_custo_receita(
    (select array_agg(distinct mes_competencia) from public.lancamentos
      where mes_competencia is not null),
    array[v_emprestimos], array[v_emprestimos]);

  if v_movimentacao <> 4261910.46 then
    raise exception
      'A funcao nova devia trazer R$ 4.261.910,46 de movimentacao a receber no centro Emprestimos e trouxe R$ %.',
      to_char(v_movimentacao, 'FM999999999990.00');
  end if;
  -- E a linha de controle do outro lado: nada de emprestimo tomado pode ter
  -- entrado como receita OPERACIONAL, senao ele passaria a somar no resultado.
  if v_operacional <> 0 then
    raise exception
      'Apareceu R$ % de receita operacional no centro Emprestimos. Emprestimo tomado nao e receita.',
      to_char(v_operacional, 'FM999999999990.00');
  end if;

  raise notice 'fn_rel_custo_receita agora enxerga R$ % de movimentacao no centro Emprestimos, e zero de receita operacional.',
    to_char(v_movimentacao, 'FM999999999990.00');
end $prova$;
