-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-07, versão
-- 20260807181352 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- PROBLEMA
-- fn_aplicar_regra_pagamento é SECURITY DEFINER e não chama tem_permissao em
-- lugar nenhum, mas estava executável por `authenticated` via /rest/v1/rpc.
-- Ela aprova as parcelas quando a forma de pagamento é 'dinheiro' e as marca
-- como PAGO quando é 'cartao_credito', carimbando auth.uid() em aprovado_por /
-- pago_por. Era a porta dos fundos de duas RPCs que fazem o gate certo:
-- fn_aprovar_parcela (exige financeiro.aprovacao-pagamentos:aprovar) e
-- fn_pagar_parcela (exige financeiro.pagamentos:criar). Um usuário com
-- permissão apenas de VER lançamentos enxerga os uuid na tela, chama a RPC
-- direto e aprova ou quita o que não tem direito.
--
-- POR QUE REVOGAR, E NÃO ADICIONAR O GATE DENTRO DELA
-- Ela nunca foi feita para ser chamada de fora. As 7 funções que a usam
-- (fn_salvar_lancamento, fn_definir_conta_lancamento,
-- fn_definir_conta_lancamentos_lote, fn_definir_parcelas_lancamento,
-- fn_registrar_recebimento, fn_aprovar_ordem_compra e
-- fn_importar_br364_lote09) são todas SECURITY DEFINER com owner postgres, e
-- chamada interna roda com o privilégio do OWNER, não o do chamador — nenhuma
-- delas para de funcionar. As seis que o app usa já têm tem_permissao própria,
-- então o gate continua existindo, uma camada acima. O app não chama esta RPC
-- direto (conferido em src/: só aparece em comentário e nos types gerados).
--
-- Medido antes: o grant era explícito para `authenticated` (PUBLIC não tinha).
-- Revogo dos três mesmo assim, porque função no Postgres nasce com EXECUTE para
-- PUBLIC e um CREATE OR REPLACE futuro pode reintroduzir o caminho.
revoke execute on function public.fn_aplicar_regra_pagamento(uuid) from authenticated;
revoke execute on function public.fn_aplicar_regra_pagamento(uuid) from anon;
revoke execute on function public.fn_aplicar_regra_pagamento(uuid) from public;

-- Trava fail-closed: se o revoke não pegou, ou se derrubou de carona o acesso
-- às funções que o app precisa, a migration estoura e nada é gravado. É o mesmo
-- padrão da 20260805130001 (revoke de TRUNCATE): a presença desta versão no
-- ledger é, por si só, prova de que as duas condições passaram.
do $$
declare
  v_falha int;
  v_perdidas text;
begin
  select count(*) into v_falha
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aplicar_regra_pagamento'
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE'));

  if v_falha > 0 then
    raise exception
      'fn_aplicar_regra_pagamento ainda é executável por authenticated ou anon';
  end if;

  select string_agg(p.proname, ', ') into v_perdidas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and p.proname in (
      'fn_salvar_lancamento', 'fn_definir_conta_lancamento',
      'fn_definir_conta_lancamentos_lote', 'fn_definir_parcelas_lancamento',
      'fn_registrar_recebimento', 'fn_aprovar_ordem_compra'
    )
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if v_perdidas is not null then
    raise exception 'O revoke derrubou funções que o app precisa: %', v_perdidas;
  end if;
end $$;
