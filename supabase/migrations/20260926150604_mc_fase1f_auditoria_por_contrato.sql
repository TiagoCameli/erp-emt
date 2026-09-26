-- Medição de Contratos, Fase 1f: auditoria respeita a lista do contrato (D3). Aplicada em 26/09/2026
-- com o ok do Tiago, depois de conferir que a expressão viva da policy era a de baixo.
--
-- O fn_audit grava a linha inteira (to_jsonb) das tabelas mc_*, e a policy audit_log_select só
-- pede administracao.auditoria/ver: quem vê a auditoria veria todo contrato, inclusive fora da
-- lista de acesso dele. Esta migration parte da expressão VIVA da policy (lida com pg_get_expr em
-- 2026-09-25):
--   ( SELECT tem_permissao('administracao.auditoria'::text, 'ver'::text) AS tem_permissao)
-- e acrescenta: linha de tabela mc_* (menos mc_indices e mc_indice_valores, que são catálogo de
-- índice, sem contrato) só aparece quando o contrato dela está em fn_mc_meus_contratos().
-- O contrato sai de coalesce(dados_depois, dados_antes): ->>'id' em mc_contratos, ->>'contrato_id'
-- nas outras (todas as mc_* auditadas têm a coluna contrato_id, conferido no catálogo). A
-- comparação é por texto: um jsonb sem a chave vira null e a linha some (falha fechada), nunca erro
-- de cast. As outras tabelas seguem exatamente a regra de hoje.
--
-- Antes de aplicar: confira que a expressão viva ainda é a de cima (select pg_get_expr(polqual,
-- polrelid) from pg_policy where polname = 'audit_log_select'). Se mudou, refaça a partir dela.
-- Aplicar com apply_migration e salvar com a versão real, como as outras.

alter policy audit_log_select on public.audit_log
  using (
    (select public.tem_permissao('administracao.auditoria'::text, 'ver'::text) as tem_permissao)
    and (
      tabela not like 'mc\_%'
      or tabela in ('mc_indices', 'mc_indice_valores')
      or (case when tabela = 'mc_contratos'
               then coalesce(dados_depois, dados_antes) ->> 'id'
               else coalesce(dados_depois, dados_antes) ->> 'contrato_id' end)
         in (select c::text from public.fn_mc_meus_contratos() c)
    )
  );
