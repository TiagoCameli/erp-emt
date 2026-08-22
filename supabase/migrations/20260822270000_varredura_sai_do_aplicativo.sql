-- =============================================================
-- A varredura sai do aplicativo, e nao so dos relatorios
--
-- PEDIDO DO TIAGO (22/08/2026): "pensava que iamos tirar as aplicacoes do
-- aplicativo como voce disse."
--
-- ============================================================
-- O QUE FALTAVA, E ELE ESTA CERTO
-- ============================================================
-- As migrations anteriores tiraram a varredura de onde ela MENTIA: do resultado
-- (natureza 'movimentacao'), do saldo bancario (opcao A), do fluxo de caixa, do
-- aging e dos KPIs de Gestao. Mas os 257 lancamentos continuaram na base, e
-- portanto continuaram ocupando linha em Lancamentos, em Pagamentos (pagas), em
-- Recebimentos (recebidos) e no extrato do cliente.
--
-- Um lancamento que nao e resultado, nao e caixa, nao e saldo e nao e divida nao
-- e um documento financeiro da empresa: e uma linha de extrato que a carga
-- trouxe. Ela nao deveria estar em `lancamentos`, e agora sai.
--
-- ============================================================
-- ARQUIVO MORTO, NAO EXCLUSAO SIMPLES
-- ============================================================
-- `fn_excluir_lancamento` nao serve aqui: ela recusa lancamento com parcela paga
-- (e os 257 estao todos pagos) e faz DELETE de verdade, porque `lancamentos` nao
-- tem soft delete. Entao o caminho e o mesmo padrao que este projeto ja usa em
-- `arquivo_morto` (ha tabelas *_20260807 la de uma limpeza anterior): copia
-- integral antes de apagar, com o dia no nome.
--
-- Copiar antes e o que torna isto REVERSIVEL. Sao 257 lancamentos, 257 parcelas
-- e 257 rateios, e a copia guarda todas as colunas: para voltar atras basta
-- reinserir das tres tabelas.
--
-- Parcelas, rateios e formas caem por CASCADE (conferido em pg_constraint), e
-- `parcela_eventos` tambem. Conferido antes: os 257 sao todos de origem
-- 'manual', nenhum tem anexo, nenhum esta na tabela `recebimentos` e
-- `extrato_transacoes` esta vazia (nada conciliado que ficasse orfao).
--
-- ============================================================
-- PROVADO EM TRANSACAO DESFEITA, ANTES DE APLICAR
-- ============================================================
-- O que NAO podia mudar, e nao mudou:
--   saldo das cinco contas ......... identico
--   fluxo de caixa ................. identico (R$ 92.247.411,92)
--   custo por centro de custo ...... 27 dos 28 centros identicos
--   DRE operacional e financeiro ... identicos ao centavo
--
-- A unica coisa que mudou no custo por centro foi o proprio centro
-- "Investimentos", que sai de R$ 10.854.817,87 para inexistente. Era o TERCEIRO
-- maior "centro de custo" de 2026, acima de obras reais como o Ramal do Gama, e
-- estava cadastrado com tipo 'obra' -- ou seja, aparecia junto das obras no
-- filtro e na escala do grafico. A primeira prova acusou "custo por centro
-- mudou: f" e eu refiz medindo centro por centro, porque "mudou" podia ser uma
-- obra perdendo custo. Nao era: sumiu so o Investimentos.
--
-- ============================================================
-- O QUE SE PERDE, E VALE DIZER
-- ============================================================
-- `fn_rel_posicao_aplicacao` media principal aplicado menos resgatado e acusava
-- -R$ 3.571.015,96 na Caixa, um impossivel que servia de sinal de "falta
-- importar extrato". Sem os lancamentos, ela zera e o sinal desaparece.
--
-- O PROBLEMA nao desaparece: o saldo da Caixa continua em -R$ 3.571.015,96 e
-- continua precisando de rebase com o saldo aplicado real. O que se perde e o
-- diagnostico automatico da causa, nao o sintoma.
--
-- A funcao, a natureza 'movimentacao' e as duas categorias FICAM. Elas sao o
-- mecanismo que impede o problema de voltar: se algum dia entrar uma aplicacao
-- de verdade, ela nasce fora do resultado, fora do saldo e fora do caixa por
-- construcao, em vez de precisar desta limpeza de novo.
-- =============================================================

-- ---------- 1. a copia, antes de qualquer delete ----------
drop table if exists arquivo_morto.lancamentos_varredura_20260822;
drop table if exists arquivo_morto.lancamento_parcelas_varredura_20260822;
drop table if exists arquivo_morto.lancamento_rateios_varredura_20260822;

create table arquivo_morto.lancamentos_varredura_20260822 as
  select l.* from public.lancamentos l
  join public.categorias_financeiras c on c.id = l.categoria_id
  where c.natureza = 'movimentacao';

create table arquivo_morto.lancamento_parcelas_varredura_20260822 as
  select p.* from public.lancamento_parcelas p
  where p.lancamento_id in (select id from arquivo_morto.lancamentos_varredura_20260822);

create table arquivo_morto.lancamento_rateios_varredura_20260822 as
  select r.* from public.lancamento_rateios r
  where r.lancamento_id in (select id from arquivo_morto.lancamentos_varredura_20260822);

comment on table arquivo_morto.lancamentos_varredura_20260822 is
  'Os 257 lancamentos da varredura automatica do banco (BB Rende Facil, CDB, resgate automatico), retirados de public.lancamentos em 22/08/2026 a pedido do Tiago. Copia integral: para desfazer, reinserir daqui e das duas tabelas irmas.';

-- ---------- 2. o delete, com as guardas ----------
do $limpeza$
declare
  v_saldos_antes jsonb; v_saldos_depois jsonb;
  v_custo_antes jsonb; v_custo_depois jsonb;
  v_fluxo_antes numeric; v_fluxo_depois numeric;
  v_copiados int; v_apagados int; v_centros_mudados jsonb;
begin
  select count(*) into v_copiados from arquivo_morto.lancamentos_varredura_20260822;
  if v_copiados = 0 then
    raise exception 'A copia ficou vazia: nao apago nada sem ter guardado antes.';
  end if;

  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_saldos_antes
    from public.contas_bancarias;
  select coalesce(sum(total), 0) into v_fluxo_antes from public.fn_rel_fluxo_caixa();
  select jsonb_object_agg(cc.nome, t.total) into v_custo_antes from (
    select r.centro_custo_id, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where l.status <> 'cancelado' and l.tipo = 'a_pagar'
    group by 1) t
    join public.centros_custo cc on cc.id = t.centro_custo_id;

  delete from public.lancamentos
   where id in (select id from arquivo_morto.lancamentos_varredura_20260822);
  get diagnostics v_apagados = row_count;

  execute 'set constraints all immediate';

  if v_apagados <> v_copiados then
    raise exception 'Copiei % e apaguei %: os dois numeros tem de ser iguais.',
      v_copiados, v_apagados;
  end if;

  -- O saldo bancario nao pode se mexer: a varredura ja estava fora dele desde a
  -- opcao A, entao apagar nao pode mudar um centavo.
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_saldos_depois
    from public.contas_bancarias;
  if v_saldos_antes <> v_saldos_depois then
    raise exception 'O saldo de alguma conta mudou. Antes: %. Depois: %.',
      v_saldos_antes, v_saldos_depois;
  end if;

  select coalesce(sum(total), 0) into v_fluxo_depois from public.fn_rel_fluxo_caixa();
  if v_fluxo_antes <> v_fluxo_depois then
    raise exception 'O fluxo de caixa mudou de R$ % para R$ %.',
      to_char(v_fluxo_antes,'FM999999999990.00'), to_char(v_fluxo_depois,'FM999999999990.00');
  end if;

  -- Custo por centro: SO o centro "Investimentos" pode desaparecer. Qualquer
  -- obra que mude de valor significa que apaguei custo real, e ai nao aplica.
  select jsonb_object_agg(cc.nome, t.total) into v_custo_depois from (
    select r.centro_custo_id, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where l.status <> 'cancelado' and l.tipo = 'a_pagar'
    group by 1) t
    join public.centros_custo cc on cc.id = t.centro_custo_id;

  select jsonb_agg(k) into v_centros_mudados
  from jsonb_object_keys(v_custo_antes) as k
  where coalesce(v_custo_antes->>k, '') is distinct from coalesce(v_custo_depois->>k, '');

  if v_centros_mudados <> '["Investimentos"]'::jsonb then
    raise exception
      'Esperava que so o centro Investimentos mudasse, e mudaram: %. Custo de obra foi apagado.',
      v_centros_mudados;
  end if;

  raise notice 'Varredura fora do aplicativo: % lancamentos guardados e apagados, saldo e custo de obra intactos.',
    v_apagados;
end $limpeza$;

-- ---------- 3. o centro de custo vazio sai da lista ----------
-- Desativado e nao excluido: e cadastro, o historico no arquivo morto aponta
-- para ele, e desativar e reversivel num clique. Ele estava com tipo 'obra',
-- entao aparecia entre as obras no filtro de centro de custo mesmo agora que
-- nao tem nenhum lancamento.
update public.centros_custo
set ativo = false, updated_at = now()
where nome = 'Investimentos'
  and not exists (
    select 1 from public.lancamento_rateios r where r.centro_custo_id = centros_custo.id
  );
