-- =============================================================
-- A subconta da BB 30.893-5 ganha a aplicacao do BB Rende Facil
--
-- PEDIDO DO TIAGO (08/10/2026): "a subconta da BANCO DO BRASIL 30.893-5 deve
-- ter a aplicacao do bb rende facil".
--
-- Uma aplicacao e uma etapa do centro Investimentos (centro_custo_id e unico em
-- aplicacoes), e a etapa "Banco do Brasil - Rende Facil" ja e da subconta da
-- 102.124-9. A 30.893-5 ganha etapa propria, com o numero da conta no nome para
-- as duas nao se confundirem na escolha da etapa.
--
-- Cadastro igual ao da 102.124-9: CDB, CDI, liquidez diaria, IR regressivo, sem
-- taxa (varia por faixa de saldo).
--
-- SALDO INICIAL ZERO, de proposito. O saldo inicial da 30.893-5 (1.406.246,33 em
-- 21/08/2026) e corrente (-140.000,00) + aplicado (1.546.246,33): o aplicado ja
-- esta na conta principal. Por na subconta sem tirar da principal contaria duas
-- vezes. Mover o aplicado e decisao do Tiago, e se faz pela tela (saldo inicial
-- da principal e da subconta).
--
-- Nada de dinheiro muda: a subconta nao tem transferencia nem posicao.
--
-- Rollback: apagar a aplicacao e a etapa (so se continuarem sem movimento):
--   delete from public.aplicacoes where centro_custo_id = <etapa>;
--   delete from public.centros_custo where id = <etapa>;
-- =============================================================

do $rende$
declare
  v_raiz uuid;
  v_sub public.contas_bancarias;
  v_etapa uuid;
  v_saldo_antes numeric(14, 2);
begin
  select r.id into v_raiz
  from public.centros_custo r
  where r.nivel = 1 and r.tipo = 'investimento';

  select s.* into v_sub
  from public.contas_bancarias s
  join public.contas_bancarias c on c.id = s.conta_pai_id
  where c.nome = 'BANCO DO BRASIL 30.893-5';

  if v_raiz is null or v_sub.id is null then
    raise exception 'Faltou o centro Investimentos (%) ou a subconta da BB 30.893-5 (%)', v_raiz, v_sub.id;
  end if;
  if exists (select 1 from public.aplicacoes a where a.conta_bancaria_id = v_sub.id) then
    raise exception 'A subconta da BB 30.893-5 ja tem aplicacao: conferir antes';
  end if;

  v_saldo_antes := public.fn_saldo_conta(v_sub.id);

  insert into public.centros_custo (nome, pai_id, nivel, tipo, sistema, orcamento, ativo)
  values ('Banco do Brasil 30.893-5 - Rende Fácil', v_raiz, 2, null, false, null, true)
  returning id into v_etapa;

  insert into public.aplicacoes (
    centro_custo_id, conta_bancaria_id, produto, indexador, taxa_percentual,
    liquidez, tipo_ir, ativa, saldo_inicial, observacoes
  ) values (
    v_etapa, v_sub.id, 'cdb', 'cdi', null, 'diaria', 'regressivo', true, 0,
    'Aplicacao automatica do BB: aplica o saldo da conta corrente e resgata quando falta. A taxa varia por faixa de saldo.'
  );

  if public.fn_saldo_conta(v_sub.id) <> v_saldo_antes then
    raise exception 'O saldo da subconta mudou de R$ % para R$ %', v_saldo_antes, public.fn_saldo_conta(v_sub.id);
  end if;
end $rende$;
