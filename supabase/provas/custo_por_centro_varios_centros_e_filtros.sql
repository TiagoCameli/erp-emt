-- Prova de aceite do relatório "Custo por centro de custo" com vários centros e
-- com os filtros de status e forma de pagamento.
--
-- Só leitura: não cria massa e não apaga nada. Pode rodar quantas vezes quiser.
--
-- Nada de valor fixo no meio da prova: cada caso recalcula o esperado por uma
-- consulta INDEPENDENTE da função (soma direta dos rateios, agrupada na raiz) ou
-- pela relação entre dois casos. Valor fixo aqui envelheceria em uma semana, porque
-- este banco recebe lançamento todo dia, e a prova passaria a falhar por dado novo
-- em vez de por defeito.
--
-- As LINHAS DE CONTROLE são o que dá valor ao resto: casos 3, 6, 9 e 12 exigem que
-- o número mude quando o filtro entra. Sem elas, uma função que ignorasse os
-- parâmetros (que é exatamente o defeito que esta migration conserta) passaria em
-- todos os outros casos.
--
-- Cobre:
--   1. sem filtro: bate com a soma direta dos rateios do mês
--   2. array vazio se comporta como nulo (sem filtro)
--   3. CONTROLE: um centro escolhido dá MENOS que o total geral
--   4. dois centros = soma dos dois pedidos um a um
--   5. subárvore: a raiz soma pelo menos o que a etapa filha soma
--   6. CONTROLE: a etapa filha dá menos que a raiz dela
--   7. status: os três status juntos reconstroem o total
--   8. forma: todas as formas + "sem forma" reconstroem o total
--   9. CONTROLE: uma forma só dá menos que o total
--  10. série: `p_fim` é exclusivo, o último mês é o pedido
--  11. série: uma linha por centro escolhido, e ela fecha com o cartão dele
--  12. CONTROLE: série de dois centros traz dois centros distintos
--  13. vida: uma linha por centro, e centro sem lançamento não volta

create temp table if not exists prova_custo_cc (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
);
truncate prova_custo_cc;

do $prova$
declare
  v_inicio date;
  v_fim date;
  v_total numeric;
  v_direto numeric;
  v_a numeric;
  v_b numeric;
  v_centro_a uuid;
  v_centro_b uuid;
  v_raiz uuid;
  v_filho uuid;
  v_raiz_total numeric;
  v_filho_total numeric;
  v_status text[];
  v_forma uuid;
  v_soma_formas numeric;
  v_int int;
  v_mes text;
  v_orfao uuid;
begin
  -- Mês de referência da prova: o último mês que tem custo, para ela não depender
  -- de "hoje" nem virar vazia quando o mês corrente ainda não tem lançamento.
  select date_trunc('month', max(l.mes_competencia))::date
    into v_inicio
  from public.lancamentos l
  where l.tipo = 'a_pagar' and l.status <> 'cancelado';
  v_fim := (v_inicio + interval '1 month')::date;

  -- ---------------------------------------------------------------
  -- 1. Sem filtro bate com a soma direta dos rateios
  -- ---------------------------------------------------------------
  select coalesce(sum(total), 0) into v_total
  from public.fn_rel_custo_centro_custo(v_inicio, v_fim);

  select coalesce(sum(r.valor), 0) into v_direto
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and l.mes_competencia >= v_inicio
    and l.mes_competencia < v_fim;

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values (
    format('1. sem filtro em %s bate com a soma direta dos rateios', to_char(v_inicio, 'MM/YYYY')),
    v_direto::text, v_total::text, v_total = v_direto
  );

  -- ---------------------------------------------------------------
  -- 2. Array vazio se comporta como nulo
  -- ---------------------------------------------------------------
  select coalesce(sum(total), 0) into v_a
  from public.fn_rel_custo_centro_custo(
    v_inicio, v_fim, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], false, '{}'::text[], false, '{}'::text[]
  );

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values ('2. array vazio em todos os filtros = sem filtro', v_total::text, v_a::text, v_a = v_total);

  -- ---------------------------------------------------------------
  -- 3 e 4. Um centro, e dois centros
  -- ---------------------------------------------------------------
  -- Os dois maiores centros do mês, para os casos não caírem em centro de troco.
  select centro_custo_id into v_centro_a
  from public.fn_rel_custo_centro_custo(v_inicio, v_fim)
  where centro_custo_id is not null
  order by total desc
  limit 1;

  select centro_custo_id into v_centro_b
  from public.fn_rel_custo_centro_custo(v_inicio, v_fim)
  where centro_custo_id is not null and centro_custo_id <> v_centro_a
  order by total desc
  limit 1;

  select coalesce(sum(total), 0) into v_a
  from public.fn_rel_custo_centro_custo(v_inicio, v_fim, array[v_centro_a]);

  select coalesce(sum(total), 0) into v_b
  from public.fn_rel_custo_centro_custo(v_inicio, v_fim, array[v_centro_b]);

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values (
    '3. CONTROLE: um centro escolhido da MENOS que o total geral',
    format('menor que %s e maior que zero', v_total),
    v_a::text,
    v_a < v_total and v_a > 0
  );

  select coalesce(sum(total), 0) into v_direto
  from public.fn_rel_custo_centro_custo(v_inicio, v_fim, array[v_centro_a, v_centro_b]);

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values (
    '4. dois centros = soma dos dois pedidos um a um',
    (v_a + v_b)::text, v_direto::text, v_direto = v_a + v_b
  );

  -- ---------------------------------------------------------------
  -- 5 e 6. Subárvore
  -- ---------------------------------------------------------------
  -- Uma etapa filha que tem custo no mês, e a raiz dela.
  select f.id, r.id into v_filho, v_raiz
  from public.centros_custo f
  join public.centros_custo r on r.id = f.pai_id and r.pai_id is null
  where exists (
    select 1
    from public.lancamento_rateios ra
    join public.lancamentos l on l.id = ra.lancamento_id
    where ra.centro_custo_id = f.id
      and l.tipo = 'a_pagar' and l.status <> 'cancelado'
      and l.mes_competencia >= v_inicio and l.mes_competencia < v_fim
  )
  limit 1;

  if v_filho is null then
    insert into prova_custo_cc (caso, esperado, obtido, passou)
    values ('5-6. subarvore: sem etapa filha com custo no mes, casos nao aplicaveis', 'n/a', 'n/a', true);
  else
    select coalesce(sum(total), 0) into v_raiz_total
    from public.fn_rel_custo_centro_custo(v_inicio, v_fim, array[v_raiz]);

    select coalesce(sum(total), 0) into v_filho_total
    from public.fn_rel_custo_centro_custo(v_inicio, v_fim, array[v_filho]);

    insert into prova_custo_cc (caso, esperado, obtido, passou)
    values (
      '5. a raiz soma pelo menos o que a etapa filha soma',
      format('raiz >= %s', v_filho_total), v_raiz_total::text,
      v_raiz_total >= v_filho_total and v_filho_total > 0
    );

    insert into prova_custo_cc (caso, esperado, obtido, passou)
    values (
      '6. CONTROLE: a etapa filha da menos que a raiz dela',
      format('menor que %s', v_raiz_total), v_filho_total::text,
      v_filho_total < v_raiz_total
    );
  end if;

  -- ---------------------------------------------------------------
  -- 7. Status: os que existem reconstroem o total
  -- ---------------------------------------------------------------
  select array_agg(distinct l.status) into v_status
  from public.lancamentos l
  where l.tipo = 'a_pagar' and l.status <> 'cancelado'
    and l.mes_competencia >= v_inicio and l.mes_competencia < v_fim;

  select coalesce(sum(total), 0) into v_a
  from public.fn_rel_custo_centro_custo(v_inicio, v_fim, null, null, null, null, false, v_status);

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values (
    format('7. status %s juntos reconstroem o total', v_status::text),
    v_total::text, v_a::text, v_a = v_total
  );

  -- ---------------------------------------------------------------
  -- 8 e 9. Forma de pagamento, com a perna do "sem forma"
  -- ---------------------------------------------------------------
  select coalesce(sum(total), 0) into v_soma_formas
  from public.fn_rel_custo_centro_custo(
    v_inicio, v_fim, null, null, null,
    (select array_agg(f.id) from public.formas_pagamento f),
    true
  );

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values (
    '8. todas as formas + sem forma reconstroem o total',
    v_total::text, v_soma_formas::text, v_soma_formas = v_total
  );

  -- A forma mais usada do mês, para o controle não cair numa forma sem movimento.
  select l.forma_pagamento_id into v_forma
  from public.lancamentos l
  where l.tipo = 'a_pagar' and l.status <> 'cancelado'
    and l.forma_pagamento_id is not null
    and l.mes_competencia >= v_inicio and l.mes_competencia < v_fim
  group by l.forma_pagamento_id
  order by count(*) desc
  limit 1;

  if v_forma is null then
    insert into prova_custo_cc (caso, esperado, obtido, passou)
    values ('9. CONTROLE de forma: nenhum lancamento com forma no mes, caso nao aplicavel', 'n/a', 'n/a', true);
  else
    select coalesce(sum(total), 0) into v_a
    from public.fn_rel_custo_centro_custo(v_inicio, v_fim, null, null, null, array[v_forma], false);

    insert into prova_custo_cc (caso, esperado, obtido, passou)
    values (
      '9. CONTROLE: uma forma so da menos que o total',
      format('menor que %s e maior que zero', v_total), v_a::text,
      v_a < v_total and v_a > 0
    );
  end if;

  -- ---------------------------------------------------------------
  -- 10, 11 e 12. Série
  -- ---------------------------------------------------------------
  select s.mes into v_mes
  from public.fn_rel_custo_centro_serie(array[v_centro_a], null, v_fim) s
  order by s.mes desc
  limit 1;

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values (
    '10. serie respeita p_fim EXCLUSIVO: ultimo mes e o pedido',
    to_char(v_inicio, 'YYYY-MM'), coalesce(v_mes, '(vazio)'),
    v_mes = to_char(v_inicio, 'YYYY-MM')
  );

  select coalesce(sum(s.total), 0) into v_b
  from public.fn_rel_custo_centro_serie(array[v_centro_a], v_inicio, v_fim) s;

  select coalesce(sum(total), 0) into v_a
  from public.fn_rel_custo_centro_custo(v_inicio, v_fim, array[v_centro_a]);

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values (
    '11. serie de um centro no mes fecha com o cartao dele',
    v_a::text, v_b::text, v_b = v_a
  );

  select count(distinct s.centro_custo_id) into v_int
  from public.fn_rel_custo_centro_serie(array[v_centro_a, v_centro_b], v_inicio, v_fim) s;

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values (
    '12. CONTROLE: serie de dois centros traz dois centros distintos',
    '2', v_int::text, v_int = 2
  );

  -- ---------------------------------------------------------------
  -- 13. Vida por centro
  -- ---------------------------------------------------------------
  -- Um centro que existe e nunca recebeu rateio: ele NÃO pode voltar da vida.
  select c.id into v_orfao
  from public.centros_custo c
  where not exists (
    select 1 from public.lancamento_rateios r where r.centro_custo_id = c.id
  )
  and not exists (
    select 1 from public.centros_custo f where f.pai_id = c.id
  )
  limit 1;

  select count(*) into v_int
  from public.fn_rel_custo_centro_vida(
    array_remove(array[v_centro_a, v_centro_b, v_orfao], null)
  );

  insert into prova_custo_cc (caso, esperado, obtido, passou)
  values (
    case when v_orfao is null
      then '13. vida devolve uma linha por centro escolhido (sem centro orfao para testar)'
      else '13. vida devolve uma linha por centro COM custo, e nao inventa linha para o centro sem lancamento'
    end,
    '2', v_int::text, v_int = 2
  );
end $prova$;

select ordem, caso, esperado, obtido, passou from prova_custo_cc order by ordem;

do $verdict$
declare
  v_falhas int;
begin
  select count(*) into v_falhas from prova_custo_cc where not passou;
  if v_falhas > 0 then
    raise exception 'PROVA FALHOU em % caso(s). Rode o select acima para ver qual.', v_falhas;
  end if;
  raise notice 'PROVA OK: % casos', (select count(*) from prova_custo_cc);
end $verdict$;
