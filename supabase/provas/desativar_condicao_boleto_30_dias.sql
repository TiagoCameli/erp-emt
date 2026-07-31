-- Prova de aceite: condicao de pagamento "Boleto 30 dias" desativada
-- (migration 20260731140001_desativar_condicao_boleto_30_dias).
--
-- Roda contra o banco vivo dentro de BEGIN ... ROLLBACK: a ordem de compra que a
-- prova cria para simular historico nao fica, nem as linhas de audit_log (o
-- trigger grava na mesma transacao, entao o rollback leva tudo).
--
-- Lista de aceite:
--   1. a condicao continua existindo, apenas com ativo = false (nao foi apagada)
--   2. ela sai da lista de ativas, que e exatamente o que os dropdowns leem
--      (todas as consultas de combobox filtram ativo = true)
--   3. a divisao em parcelas dela (condicao_parcelas) continua no banco, nada foi
--      apagado em cascata
--   4. documento que aponta para ela continua mostrando "Boleto 30 dias", porque a
--      leitura do historico junta por id e nao filtra por ativo
--   5. a referencia para uma condicao desativada continua valida, ou seja, a
--      desativacao nao invalidou documento nenhum
--
-- Rodada em 31/07/2026 contra o banco de producao: 5 casos, 5 passaram.
--   1. existe, ativo = false                                              ok
--   2. 0 ocorrencia entre as 12 condicoes ativas (eram 13)                ok
--   3. 1 parcela definida continua no banco                               ok
--   4. o documento mostra "Boleto 30 dias"                                ok
--   5. ordem gravada com a condicao desativada                            ok
--
-- Depois do ROLLBACK: 0 ordens de compra [PROVA-BOLETO], 0 linhas de audit_log da
-- prova, tabela temporaria inexistente, e a condicao segue existindo com
-- ativo = false (o efeito da migration, que e permanente, nao da prova).
--
-- Antes da migration, conferido no banco: essa condicao nao era referenciada por
-- nenhuma ordem de compra (0), nenhuma cotacao (0) e nenhum lancamento (0). O
-- caso 4 cria a referencia dentro da transacao justamente porque nao existia
-- nenhuma de verdade para observar.
--
-- Nao precisa de sessao autenticada: a prova le e escreve direto nas tabelas, sem
-- passar por funcao security definer que dependa de auth.uid().

begin;

create temp table prova_boleto (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
) on commit drop;

do $prova$
declare
  v_cond uuid; v_ativo boolean; v_forn uuid; v_oc uuid;
  v_na_lista int; v_total_ativas int; v_descricao_no_historico text;
  v_parcelas_da_condicao int;
begin
  select id, ativo into v_cond, v_ativo
  from public.condicoes_pagamento
  where descricao = 'Boleto 30 dias';

  insert into prova_boleto (caso, esperado, obtido, passou)
  values (
    '1. a condicao continua existindo, so desativada',
    'existe, ativo = false',
    case when v_cond is null then 'nao existe mais (foi apagada)'
         else 'existe, ativo = ' || v_ativo::text end,
    v_cond is not null and v_ativo = false
  );

  -- 2. o que os dropdowns leem: select ... where ativo = true
  select count(*) into v_na_lista
  from public.condicoes_pagamento
  where ativo and descricao = 'Boleto 30 dias';

  select count(*) into v_total_ativas
  from public.condicoes_pagamento where ativo;

  insert into prova_boleto (caso, esperado, obtido, passou)
  values (
    '2. sumiu da lista de ativas (o que alimenta os dropdowns)',
    '0 ocorrencia entre as ' || v_total_ativas::text || ' condicoes ativas',
    v_na_lista::text || ' ocorrencia(s)',
    v_na_lista = 0
  );

  -- 3. a divisao em parcelas dela continua no banco (nada foi apagado em cascata)
  select count(*) into v_parcelas_da_condicao
  from public.condicao_parcelas where condicao_id = v_cond;

  insert into prova_boleto (caso, esperado, obtido, passou)
  values (
    '3. condicao_parcelas dela continua no banco (sem cascata)',
    '1 parcela definida',
    v_parcelas_da_condicao::text || ' parcela(s)',
    v_parcelas_da_condicao = 1
  );

  -- 4. historico apontando para ela continua legivel: uma OC criada aqui dentro
  -- da transacao, exatamente como um documento antigo que ja tinha escolhido a
  -- condicao antes da desativacao.
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;

  insert into public.ordens_compra (
    fornecedor_id, condicao_pagamento_id, valor_total, status, data_compra,
    mes_competencia, observacoes
  )
  values (
    v_forn, v_cond, 100.00, 'rascunho', '2026-07-10', '2026-07-01',
    '[PROVA-BOLETO] documento apontando para condicao desativada'
  )
  returning id into v_oc;

  select c.descricao into v_descricao_no_historico
  from public.ordens_compra o
  join public.condicoes_pagamento c on c.id = o.condicao_pagamento_id
  where o.id = v_oc;

  insert into prova_boleto (caso, esperado, obtido, passou)
  values (
    '4. documento que aponta para ela ainda mostra a descricao',
    'Boleto 30 dias',
    coalesce(v_descricao_no_historico, 'null (historico ilegivel)'),
    v_descricao_no_historico = 'Boleto 30 dias'
  );

  -- 5. e a FK aceitou a condicao desativada, ou seja, documento existente nao
  -- virou invalido por causa da desativacao
  insert into prova_boleto (caso, esperado, obtido, passou)
  values (
    '5. a referencia para a condicao desativada continua valida',
    'ordem gravada com a condicao desativada',
    case when v_oc is null then 'nao gravou' else 'gravada' end,
    v_oc is not null
  );
end $prova$;

select ordem, caso, esperado, obtido, passou from prova_boleto order by ordem;

rollback;
