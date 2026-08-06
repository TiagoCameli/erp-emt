-- Prova de aceite: conta bancaria em lote (fn_definir_conta_lancamentos_lote).
--
-- Roda em transacao e termina em ROLLBACK: nada do que ela cria sobrevive.
-- Cria as PROPRIAS contas bancarias e os proprios lancamentos, para os numeros
-- nao dependerem do que existe em producao.
--
-- A RPC e SECURITY DEFINER e checa permissao por tem_permissao(), que le
-- auth.uid() de request.jwt.claims. Por isso a prova seta as claims do usuario em
-- vez de trocar de role: o que se prova aqui e a REGRA.
--
-- O que esta prova mede, e por que ela existe:
-- o lote grava em MUITAS parcelas de uma vez, e o unico jeito de errar sem
-- ninguem ver e errar o `where`. Um `where` frouxo sobrescreve conta que alguem
-- escolheu ou mexe em parcela paga, e isso nao aparece em teste de componente
-- nem em typecheck: aparece no extrato do mes seguinte. Cada afirmacao abaixo
-- mede uma linha do `where`.
--
-- Cenario, um lancamento por caso:
--   A: 2 parcelas em aberto, ambas SEM conta            -> elegivel, 2 gravadas
--   B: 2 parcelas em aberto, 1 COM conta e 1 sem        -> elegivel, 1 gravada,
--                                                          a outra INTACTA
--   C: 2 parcelas em aberto, ambas COM conta            -> pulado_com_conta
--   D: 1 parcela PAGA, sem conta                        -> pulado_sem_pendente

begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select id::text from public.usuarios where ativo order by created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);

-- ---------- Cenario ----------

create temporary table t_ids (chave text primary key, id uuid not null) on commit drop;

insert into t_ids (chave, id) values
  ('conta_nova', gen_random_uuid()),
  ('conta_velha', gen_random_uuid()),
  ('lanc_a', gen_random_uuid()),
  ('lanc_b', gen_random_uuid()),
  ('lanc_c', gen_random_uuid()),
  ('lanc_d', gen_random_uuid()),
  ('fantasma', gen_random_uuid());

create or replace function pg_temp.id(p_chave text) returns uuid
language sql stable as $$ select id from t_ids where chave = p_chave $$;

insert into public.contas_bancarias (id, nome, banco, agencia, conta, saldo_inicial, ativo)
values
  (pg_temp.id('conta_nova'), 'PROVA LOTE nova', '001', '0001', '111111', 0, true),
  (pg_temp.id('conta_velha'), 'PROVA LOTE velha', '237', '0002', '222222', 0, true);

-- Lancamentos minimos, do jeito que a carga da BR-364 deixou: a pagar, sem conta.
insert into public.lancamentos (id, tipo, descricao, valor, data_vencimento, status)
select x.id, 'a_pagar', 'PROVA LOTE ' || x.chave, 1000, current_date + 30, 'a_pagar'
from t_ids x where x.chave in ('lanc_a', 'lanc_b', 'lanc_c', 'lanc_d');

-- A: duas parcelas em aberto, sem conta
insert into public.lancamento_parcelas
  (lancamento_id, numero, valor, data_vencimento, status, conta_bancaria_id)
values
  (pg_temp.id('lanc_a'), 1, 500, current_date + 30, 'a_pagar', null),
  (pg_temp.id('lanc_a'), 2, 500, current_date + 60, 'a_pagar', null);

-- B: parcial (uma com conta velha, uma sem)
insert into public.lancamento_parcelas
  (lancamento_id, numero, valor, data_vencimento, status, conta_bancaria_id)
values
  (pg_temp.id('lanc_b'), 1, 500, current_date + 30, 'a_pagar', pg_temp.id('conta_velha')),
  (pg_temp.id('lanc_b'), 2, 500, current_date + 60, 'a_pagar', null);

-- C: as duas ja com conta velha
insert into public.lancamento_parcelas
  (lancamento_id, numero, valor, data_vencimento, status, conta_bancaria_id)
values
  (pg_temp.id('lanc_c'), 1, 500, current_date + 30, 'a_pagar', pg_temp.id('conta_velha')),
  (pg_temp.id('lanc_c'), 2, 500, current_date + 60, 'a_pagar', pg_temp.id('conta_velha'));

-- D: paga, sem conta. Parcela paga nunca pode ser tocada.
insert into public.lancamento_parcelas
  (lancamento_id, numero, valor, data_vencimento, status, conta_bancaria_id)
values
  (pg_temp.id('lanc_d'), 1, 1000, current_date - 10, 'pago', null);

-- ---------- Execucao ----------

create temporary table t_resultado (r jsonb) on commit drop;

insert into t_resultado (r)
select public.fn_definir_conta_lancamentos_lote(
  array[
    pg_temp.id('lanc_a'), pg_temp.id('lanc_b'),
    pg_temp.id('lanc_c'), pg_temp.id('lanc_d'),
    pg_temp.id('fantasma')
  ]::uuid[],
  pg_temp.id('conta_nova')
);

-- ---------- 1. O resumo conta a verdade ----------

do $$
declare v jsonb;
begin
  select r into v from t_resultado;
  assert (v->>'definidos')::int = 2,
    format('definidos deveria ser 2 (A e B), veio %s', v->>'definidos');
  assert (v->>'pulados_com_conta')::int = 1,
    format('pulados_com_conta deveria ser 1 (C), veio %s', v->>'pulados_com_conta');
  assert (v->>'pulados_sem_parcela_pendente')::int = 1,
    format('pulados_sem_pendente deveria ser 1 (D), veio %s', v->>'pulados_sem_parcela_pendente');
  assert (v->>'nao_encontrados')::int = 1,
    format('nao_encontrados deveria ser 1 (fantasma), veio %s', v->>'nao_encontrados');
end $$;

-- ---------- 2. A gravou nas duas ----------

do $$ begin
  assert (
    select count(*) from public.lancamento_parcelas
    where lancamento_id = pg_temp.id('lanc_a')
      and conta_bancaria_id = pg_temp.id('conta_nova')
  ) = 2, 'A deveria ter as duas parcelas com a conta nova';
end $$;

-- ---------- 3. B foi COMPLETADO, e a parcela que ja tinha conta nao mudou ----------
-- Esta e a linha `conta_bancaria_id is null` do where. Sem ela, o lote
-- sobrescreveria a escolha de quem veio antes.

do $$ begin
  assert (
    select count(*) from public.lancamento_parcelas
    where lancamento_id = pg_temp.id('lanc_b')
      and conta_bancaria_id = pg_temp.id('conta_velha')
  ) = 1, 'o lote sobrescreveu a conta que alguem ja tinha escolhido no B';
  assert (
    select count(*) from public.lancamento_parcelas
    where lancamento_id = pg_temp.id('lanc_b')
      and conta_bancaria_id = pg_temp.id('conta_nova')
  ) = 1, 'o lote nao completou a parcela vazia do B';
end $$;

-- ---------- 4. C intocado ----------

do $$ begin
  assert (
    select count(*) from public.lancamento_parcelas
    where lancamento_id = pg_temp.id('lanc_c')
      and conta_bancaria_id = pg_temp.id('conta_nova')
  ) = 0, 'C foi sobrescrito, e ele ja tinha conta em todas as parcelas';
end $$;

-- ---------- 5. Parcela PAGA nunca e tocada ----------
-- Esta e a linha `status <> 'pago'` do where.

do $$ begin
  assert (
    select count(*) from public.lancamento_parcelas
    where lancamento_id = pg_temp.id('lanc_d')
      and conta_bancaria_id is not null
  ) = 0, 'a parcela PAGA do D ganhou conta, e nao devia';
end $$;

-- ---------- 6. Teto de 500 ----------

do $$
declare v_passou boolean := false;
begin
  begin
    perform public.fn_definir_conta_lancamentos_lote(
      (select array_agg(gen_random_uuid()) from generate_series(1, 501))::uuid[],
      pg_temp.id('conta_nova')
    );
    v_passou := true;
  exception when others then
    null;
  end;
  assert not v_passou, 'aceitou 501 lancamentos, e o teto e 500';
end $$;

-- ---------- 7. Lista vazia e recusada ----------

do $$
declare v_passou boolean := false;
begin
  begin
    perform public.fn_definir_conta_lancamentos_lote('{}'::uuid[], pg_temp.id('conta_nova'));
    v_passou := true;
  exception when others then null;
  end;
  assert not v_passou, 'aceitou lista vazia';
end $$;

-- ---------- 8. Conta inativa e recusada ----------

do $$
declare v_passou boolean := false;
begin
  update public.contas_bancarias set ativo = false where id = pg_temp.id('conta_nova');
  begin
    perform public.fn_definir_conta_lancamentos_lote(
      array[pg_temp.id('lanc_a')]::uuid[], pg_temp.id('conta_nova')
    );
    v_passou := true;
  exception when others then null;
  end;
  assert not v_passou, 'aceitou conta bancaria INATIVA';
  update public.contas_bancarias set ativo = true where id = pg_temp.id('conta_nova');
end $$;

rollback;
