-- Prova (05/10/2026): a aprovacao da folha gera salario e gratificacao em
-- lancamentos separados. Roda depois da migration 20261005230000, ROLLBACK.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_folha uuid; v_c1 uuid; v_c2 uuid; v_cc uuid; v_i1 uuid; v_i2 uuid; v_conta uuid;
  v_n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  select id, centro_custo_id into v_c1, v_cc from public.colaboradores where ativo and centro_custo_id is not null order by nome limit 1;
  select id into v_c2 from public.colaboradores where ativo and centro_custo_id is not null and id <> v_c1 order by nome limit 1;
  select id into v_conta from public.contas_bancarias where ativo and tipo = 'corrente' limit 1;

  insert into public.folhas (competencia, status, data_vencimento) values (date '2027-01-01', 'pendente_aprovacao', date '2027-02-05') returning id into v_folha;
  insert into public.folha_itens (folha_id, colaborador_id, centro_custo_id, salario_base, gratificacao, adiantamentos, valor_liquido, custo_total)
  values (v_folha, v_c1, v_cc, 1800, 600, 100, 2300, 2400) returning id into v_i1;
  -- 1800 de salario, 600 de gratificacao, 100 de adiantamento: liquido 2300.
  -- Salario 1800 (sem descontos) e gratificacao 500 (o adiantamento sai dela).
  insert into public.folha_itens (folha_id, colaborador_id, centro_custo_id, salario_base, gratificacao, valor_liquido, custo_total)
  values (v_folha, v_c2, v_cc, 1000, 0, 1000, 1000) returning id into v_i2;

  perform public.fn_aprovar_folha_com_pagamento(v_folha, null, v_conta);

  select count(*) into v_n from public.lancamentos where origem = 'folha' and origem_id = v_i1;
  if v_n <> 2 then raise exception 'FALHA 1: com gratificacao gerou % lancamentos', v_n; end if;
  if not exists (select 1 from public.lancamentos where origem = 'folha' and origem_id = v_i1 and descricao like 'Salario %' and valor = 1800)
     or not exists (select 1 from public.lancamentos where origem = 'folha' and origem_id = v_i1 and descricao like 'Gratificacao %' and valor = 500) then
    raise exception 'FALHA 1: valores';
  end if;
  if (select count(*) from public.lancamentos where origem = 'folha' and origem_id = v_i2) <> 1 then
    raise exception 'FALHA 2: sem gratificacao deveria ter um lancamento';
  end if;
  if (select l.descricao from public.folha_itens i join public.lancamentos l on l.id = i.lancamento_id where i.id = v_i1) not like 'Salario %' then
    raise exception 'FALHA 3: folha_itens.lancamento_id deve apontar o salario';
  end if;
  if exists (select 1 from public.lancamento_parcelas lp join public.lancamentos l on l.id = lp.lancamento_id
             where l.origem = 'folha' and l.origem_id in (v_i1, v_i2) and lp.conta_bancaria_id is distinct from v_conta) then
    raise exception 'FALHA 4: a conta nao foi programada nas duas parcelas';
  end if;
  raise notice 'OK salario 1800 + gratificacao 500 (adiantamento sai da gratificacao); sem gratificacao um so; conta nos dois';

  perform public.fn_desaprovar_folha(v_folha, 'prova');
  if exists (select 1 from public.lancamentos where origem = 'folha' and origem_id in (v_i1, v_i2)) then
    raise exception 'FALHA 5: desaprovar deixou lancamento';
  end if;
  raise notice 'OK desaprovar apaga os dois';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
