-- =============================================================
-- Os cinco BB RENDE FACIL de julho que entraram depois do export
--
-- ACHADO. Julho/2026 estava R$ 1.223.590,88 abaixo do maiscontrole. Medido
-- com filtro controlado (Tipo de data = Vencimento, todos os outros em
-- "Todas"), e com junho como controle no mesmo filtro batendo ao centavo
-- (R$ 6.930.243,10 nos dois), o que confirma o critério.
--
-- Buscando "RENDE FACIL" em julho, o maiscontrole tem 8 movimentos somando
-- R$ 1.142.554,55; o ERP-EMT tinha 3, somando R$ 83.245,04. Os cinco que
-- faltavam:
--
--   14/07/2026     36.695,27
--   16/07/2026    584.839,39
--   21/07/2026     55.040,80
--   23/07/2026    111.020,24
--   27/07/2026    271.713,81
--   ----------------------------
--                1.059.309,51
--
-- NAO FOI FALHA DA CARGA, e isso foi verificado no arquivo de origem: o
-- export tem 69 linhas "RENDE FACIL" e o ERP tinha as mesmas 69, com a
-- ultima em 07/07/2026. Os cinco acima foram registrados no maiscontrole
-- depois do export de 11/08/2026 -- lancamento retroativo de movimentacao da
-- aplicacao BB Rende Facil.
--
-- COMO: o lancamento nasce por fn_salvar_lancamento (parcela, rateio e status
-- pela regra normal), e o pagamento e marcado direto, como a importacao de
-- historico faz. Nao passa por fn_pagar_parcela de proposito: ela exige saldo
-- em conta, e as contas estao em zero por decisao do Tiago, entao a guarda
-- recusaria pagamento historico que de fato aconteceu.
--
-- Sao transferencias entre a conta corrente e a aplicacao, e entram com a
-- mesma modelagem dos outros 69: fornecedor BANCO DO BRASIL S/A, categoria
-- Outras Despesas, centro Escritorio Central, conta BB 102.124-9, a vista,
-- vencimento igual a data de pagamento.
-- =============================================================

do $$
declare
  r record;
  v_forn uuid; v_cat uuid; v_cc uuid; v_conta uuid; v_criados int := 0;
begin
  select id into v_forn from public.fornecedores
   where public.fn_chave_nome(razao_social) = public.fn_chave_nome('BANCO DO BRASIL S/A') limit 1;
  select id into v_cat from public.categorias_financeiras
   where public.fn_chave_nome(nome) = public.fn_chave_nome('Outras Despesas') limit 1;
  select id into v_cc from public.centros_custo
   where public.fn_chave_nome(nome) = public.fn_chave_nome('Escritório Central') limit 1;
  select id into v_conta from public.contas_bancarias
   where public.fn_chave_nome(nome) = public.fn_chave_nome('BANCO DO BRASIL 102.124-9') limit 1;

  if v_forn is null or v_cat is null or v_cc is null or v_conta is null then
    raise exception 'Cadastro faltando: fornecedor=% categoria=% centro=% conta=%',
      v_forn, v_cat, v_cc, v_conta;
  end if;

  create temp table _rf(d date, v numeric(14,2)) on commit drop;
  insert into _rf values
    ('2026-07-14', 36695.27),
    ('2026-07-16', 584839.39),
    ('2026-07-21', 55040.80),
    ('2026-07-23', 111020.24),
    ('2026-07-27', 271713.81);

  for r in select d, v from _rf order by d loop
    -- Idempotente: replay nao duplica.
    if exists (
      select 1 from public.lancamentos
      where descricao = 'BB RENDE FACIL' and data_vencimento = r.d and valor = r.v
    ) then
      continue;
    end if;

    -- fn_salvar_lancamento exige auth.uid(), dai o papel do usuario.
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}';

    perform public.fn_salvar_lancamento(null,
      jsonb_build_object(
        'tipo','a_pagar','fornecedor_id',v_forn,'categoria_id',v_cat,
        'forma_pagamento_id',null,'condicao_pagamento_id',null,
        'descricao','BB RENDE FACIL','valor',r.v,
        'data_compra',to_char(r.d,'YYYY-MM-DD'),
        'mes_competencia',to_char(date_trunc('month',r.d),'YYYY-MM-DD'),
        'data_vencimento',to_char(r.d,'YYYY-MM-DD'),
        'observacoes','Lancado direto no ERP-EMT: registrado no maiscontrole depois do export de 11/08/2026.'),
      jsonb_build_array(jsonb_build_object('valor',r.v,'data_vencimento',to_char(r.d,'YYYY-MM-DD'))),
      jsonb_build_array(jsonb_build_object('centro_custo_id',v_cc,'valor',r.v)));

    reset role;
    v_criados := v_criados + 1;
  end loop;

  raise notice 'Lancamentos criados: %', v_criados;
end $$;

-- Pagamento historico das cinco.
update public.lancamento_parcelas p
set status = 'pago',
    conta_bancaria_id = (select id from public.contas_bancarias
      where public.fn_chave_nome(nome) = public.fn_chave_nome('BANCO DO BRASIL 102.124-9') limit 1),
    data_programada = p.data_vencimento,
    data_programada_origem = 'vencimento',
    data_pagamento = p.data_vencimento,
    desconto = 0, juros = 0,
    aprovado_por = 'c66fca9f-5428-4fb9-855f-dcff548764df', aprovado_em = now(),
    conferido_por = 'c66fca9f-5428-4fb9-855f-dcff548764df', conferido_em = now(),
    pago_por = 'c66fca9f-5428-4fb9-855f-dcff548764df', pago_em = now()
from public.lancamentos l
where l.id = p.lancamento_id
  and l.descricao = 'BB RENDE FACIL'
  and l.data_vencimento in (date '2026-07-14', date '2026-07-16', date '2026-07-21',
                            date '2026-07-23', date '2026-07-27')
  and p.status <> 'pago';

update public.lancamentos l
set status = 'pago'
where l.descricao = 'BB RENDE FACIL'
  and l.data_vencimento in (date '2026-07-14', date '2026-07-16', date '2026-07-21',
                            date '2026-07-23', date '2026-07-27');

-- O saldo deriva das parcelas pagas, entao volta a fechar em zero.
update public.contas_bancarias c
set saldo_inicial = coalesce((
  select sum(case when l.tipo = 'a_receber' then -p.valor_liquido else p.valor_liquido end)
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.conta_bancaria_id = c.id and p.status = 'pago'
), 0);
