-- Permissão de ver o SALDO, conta por conta. PARTE 2 de 2: FECHA AS PORTAS.
--
-- =====================================================================
-- !!! NÃO APLIQUE ANTES DO DEPLOY DA PARTE 1 ESTAR EM PRODUÇÃO !!!
-- =====================================================================
--
-- Esta migration REVOGA acesso. Migration neste projeto vai direto para o banco
-- de produção, então cada revoke aqui é uma quebra imediata para qualquer código
-- que ainda use o que foi revogado.
--
-- Isso não é hipótese: a primeira versão desta obra revogou junto com a parte 1,
-- em 27/08/2026 18:41, e derrubou Contas bancárias, Pagamentos, Transferências e
-- Relatórios para TODO MUNDO, inclusive Admin, com "permission denied for table
-- contas_bancarias". Outra frente teve que aplicar
-- `20260827185747_reabre_saldo_ate_o_codigo_do_saldo_por_conta_subir`.
--
-- CHECKLIST antes de aplicar:
--   1. o PR do saldo por conta está mergeado em `main`;
--   2. o deploy da Vercel para `main` terminou com sucesso;
--   3. /financeiro/contas-bancarias abre em produção (é a tela que quebra
--      primeiro se algo ainda pedir a coluna);
--   4. confirmado que nenhum código lê `saldo_inicial` nem chama as três
--      agregadas:
--        grep -rn "saldo_inicial\b" src | grep -v database.types | grep -v _data
--        grep -rn "fn_rel_posicao_bancaria\|fn_rel_movimento_antes_do_corte\|fn_rel_posicao_aplicacao" src | grep -v database.types
--      As duas buscas têm que voltar só comentário.
--
-- Enquanto esta migration não roda, a permissão FUNCIONA na tela (a query já não
-- pede a coluna e o saldo já vem filtrado), mas quem souber consultar o banco
-- direto ainda lê o saldo. É um estado intermediário conhecido, de horas, não um
-- esquecimento.

-- =====================================================================
-- 1. A coluna do saldo inicial sai do alcance do client
-- =====================================================================
--
-- O revoke tem que ser NO NÍVEL DA TABELA e depois grant por coluna: privilégio
-- de tabela cobre todas as colunas e NÃO é reduzido por revoke de coluna. Foi
-- por isso que a primeira tentativa de conferir isto passou — o `relacl` já
-- estava sem o `r` e as colunas tinham ACL própria, incluindo a proibida.
--
-- `saldo_inicial_data` FICA legível de propósito: é uma DATA, não conta dinheiro,
-- e `fn_rel_posicao_bancaria` e `fn_extrato_conta` (que não são SECURITY DEFINER)
-- precisam dela para aplicar o corte. Revogá-la quebraria as duas.

revoke select on table public.contas_bancarias from authenticated;
grant select (
  id, nome, banco, agencia, conta, tipo, ativo,
  saldo_inicial_data, created_at, updated_at, created_by
) on table public.contas_bancarias to authenticated;

-- =====================================================================
-- 2. As agregadas de dinheiro por conta viram uso interno
-- =====================================================================
--
-- Elas continuam VERDADEIRAS (não são filtradas por permissão, porque o guard de
-- `fn_pagar_parcela` depende disso — ver o cabeçalho da parte 1). O que muda é
-- quem pode chamá-las: só as funções SECURITY DEFINER, que rodam como owner.

revoke execute on function public.fn_rel_posicao_bancaria() from authenticated;
revoke execute on function public.fn_rel_movimento_antes_do_corte() from authenticated;
revoke execute on function public.fn_rel_posicao_aplicacao() from authenticated;

-- =====================================================================
-- 3. A trava de UPDATE do saldo inicial
-- =====================================================================
--
-- A função já existe (parte 1); aqui ela ganha o trigger. Fica para depois do
-- deploy pelo mesmo motivo dos revokes: ligada antes, ela recusa quem edita
-- contas e não é Admin (a Dora) ANTES de existir a tela que libera — foi o que
-- aconteceu, e a trava teve que ser removida do banco vivo em
-- `20260827190000_trava_do_saldo_inicial_espera_o_deploy`.

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_trava_saldo_inicial') then
    create trigger trg_trava_saldo_inicial
      before update on public.contas_bancarias
      for each row execute function public.fn_trava_saldo_inicial();
  end if;
end $$;

-- =====================================================================
-- 4. Conferência imediata
-- =====================================================================
--
-- Rodar logo depois, e conferir com os olhos: o `success` do apply não prova que
-- a porta fechou.
--
--   select relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relname='contas_bancarias';
--   -- authenticated tem que aparecer SEM o `r` (ex: authenticated=awm/postgres)
--
--   select a.attname, a.attacl::text from pg_attribute a
--   join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relname='contas_bancarias'
--     and a.attnum > 0 and not a.attisdropped order by a.attnum;
--   -- `saldo_inicial` tem que estar com attacl NULO (nenhum grant de coluna)
--
-- E a prova completa, com troca de role, está em
-- supabase/provas/saldo_por_conta_e_o_guard_do_pagamento.sql.
