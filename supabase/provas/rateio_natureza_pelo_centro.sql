-- Prova: rateio em centro de socio nasce como "Distribuicao a socio" e em
-- empresa ligada como mutuo (Tiago, 10/10/2026, decisao 4). Rodar em
-- begin/rollback depois da migration; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_casa uuid := 'dd508720-2c7a-4e22-bebe-4b80947499cf';      -- Casa James (socio)
  v_amazonia uuid := 'a6a1f57d-b8cb-4113-b694-58f34af7bdb4';  -- empresa ligada
  v_obra uuid;
  v_salario uuid := (select id from public.categorias_financeiras where nome = 'Salário Mão de Obra' and tipo = 'despesa');
  v_emprest uuid := (select id from public.categorias_financeiras where nome = 'Pagamento de Empréstimo' and tipo = 'despesa');
  v_distrib uuid := (select id from public.categorias_financeiras where nome = 'Distribuição a sócio' and tipo = 'despesa');
  v_mutuo uuid := (select id from public.categorias_financeiras where nome = 'Mútuo concedido a empresa ligada' and tipo = 'despesa');
  v_devol uuid := (select id from public.categorias_financeiras where nome = 'Devolução de mútuo' and tipo = 'receita');
  v_l uuid; v_lr uuid; v_r uuid; v_cat uuid;
begin
  select id into v_obra from public.centros_custo where nivel = 1 and tipo = 'obra' limit 1;
  -- Lancamento a pagar de prova (uma linha de rateio por centro).
  insert into public.lancamentos (tipo, origem, descricao, valor, status, mes_competencia, categoria_id, centro_custo_id, data_vencimento)
  values ('a_pagar', 'manual', 'prova natureza pelo centro', 300, 'a_pagar', date '2026-10-01', v_salario, v_obra, date '2026-10-31')
  returning id into v_l;

  -- 1. Centro de socio: categoria operacional vira distribuicao.
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, categoria_id, valor) values (v_l, v_casa, v_salario, 100) returning categoria_id into v_cat;
  if v_cat is distinct from v_distrib then raise exception 'FALHOU 1: socio ficou com %', v_cat; end if;

  -- 2. Empresa ligada: operacional vira mutuo concedido; sem categoria tambem.
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, categoria_id, valor) values (v_l, v_amazonia, null, 100) returning categoria_id into v_cat;
  if v_cat is distinct from v_mutuo then raise exception 'FALHOU 2: ligada ficou com %', v_cat; end if;

  -- 3. Obra: nada muda.
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, categoria_id, valor) values (v_l, v_obra, v_salario, 100) returning id, categoria_id into v_r, v_cat;
  if v_cat is distinct from v_salario then raise exception 'FALHOU 3: obra mudou para %', v_cat; end if;

  -- 4. Mover o rateio da obra para a ligada tambem converte.
  update public.lancamento_rateios set centro_custo_id = v_amazonia where id = v_r returning categoria_id into v_cat;
  -- (o centro repetido no lancamento e problema do teste, nao da regra)
  if v_cat is distinct from v_mutuo then raise exception 'FALHOU 4: mover para a ligada ficou com %', v_cat; end if;

  -- 5. Emprestimo (movimentacao) na ligada fica como esta (BASA).
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, categoria_id, valor) values (v_l, v_amazonia, v_emprest, 1) returning categoria_id into v_cat;
  if v_cat is distinct from v_emprest then raise exception 'FALHOU 5: emprestimo virou %', v_cat; end if;

  -- 6. A receber na ligada: devolucao de mutuo.
  insert into public.lancamentos (tipo, origem, descricao, valor, status, mes_competencia, centro_custo_id, data_vencimento)
  values ('a_receber', 'manual', 'prova devolucao', 50, 'a_pagar', date '2026-10-01', v_amazonia, date '2026-10-31')
  returning id into v_lr;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, categoria_id, valor) values (v_lr, v_amazonia, null, 50) returning categoria_id into v_cat;
  if v_cat is distinct from v_devol then raise exception 'FALHOU 6: a receber da ligada ficou com %', v_cat; end if;

  raise exception 'PROVA OK';
end
$prova$;
