-- =============================================================
-- `fn_rel_custo_por_grupo` e `fn_rel_custo_por_mes` fecham a porta do PUBLIC
--
-- ============================================================
-- O QUE ESTAVA ERRADO
-- ============================================================
-- Medido em 28/08/2026, em `pg_proc.proacl`:
--
--   fn_rel_custo_por_grupo(date,date,uuid,uuid)
--     {=X/postgres, postgres=X/postgres, authenticated=X/postgres}
--   fn_rel_custo_por_mes(integer,date,date,uuid,uuid)
--     {=X/postgres, postgres=X/postgres, authenticated=X/postgres}
--
-- A primeira entrada, `=X/postgres`, e o PUBLIC: qualquer role, `anon`
-- inclusive. Conferido pela pergunta direta ao banco, e nao pela leitura do
-- ACL: `has_function_privilege('anon', oid, 'execute')` devolvia `true` nas
-- duas, e `false` em todas as outras `fn_rel_custo_*`.
--
-- A causa e a que o CLAUDE.md ja avisa: funcao nasce com EXECUTE para PUBLIC, e
-- `grant ... to authenticated` sozinho NAO fecha nada. Alguma migration antiga
-- revogou de PUBLIC, mas na assinatura que existia naquele dia -- e a assinatura
-- mudou depois. `revoke` e por assinatura: revogar de uma que nao existe mais
-- nao tem efeito nenhum e nao da erro.
--
-- Na pratica as duas sao SECURITY INVOKER e o RLS ainda barraria `anon`, entao
-- isto nao vazou dinheiro. Mas a funcao aparece no OpenAPI do PostgREST e e
-- chamavel sem login: e superficie que nao deveria existir.
--
-- ============================================================
-- POR QUE ESTE REVOKE NAO DERRUBA A TELA
-- ============================================================
-- A regra "revoke vai DEPOIS do deploy" vale quando o revoke estreita o que a
-- aplicacao usa. Aqui nao: quem chama e o usuario logado, que e `authenticated`,
-- e o grant dele e reafirmado na linha seguinte, na assinatura ATUAL. Sai so o
-- PUBLIC, que nenhuma tela usa.
-- =============================================================

revoke execute on function public.fn_rel_custo_por_grupo(date, date, uuid, uuid) from public;
grant execute on function public.fn_rel_custo_por_grupo(date, date, uuid, uuid) to authenticated;

revoke execute on function public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid) from public;
grant execute on function public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid) to authenticated;
