-- Task 3 transforma condicoes_pagamento de simples lookup interno de
-- Compras (só descrição, criado inline pelo campo da OC/Cotação) num
-- cadastro próprio (recurso cadastros.condicoes-pagamento) com tela de
-- CRUD e parcelas (condicao_parcelas, Task 1-2).
--
-- Checado no banco vivo antes de escrever esta migration (MCP execute_sql,
-- 2026-07-22): condicoes_pagamento só tinha policy de SELECT e INSERT,
-- ambas condicionadas a compras.ordens/compras.cotacoes; NÃO havia policy
-- nem grant de UPDATE. Sem isso, editarCondicao/desativarCondicao (que
-- fazem update de descricao/ativo) seriam bloqueados pelo RLS mesmo com a
-- permissão nova concedida. Também não havia trigger de auditoria na
-- tabela (diverge do padrão dos outros cadastros, ex. unidades_medida,
-- categorias_insumo).
--
-- Esta migration é aditiva: cria policies NOVAS para o recurso
-- cadastros.condicoes-pagamento, que valem em OU com as policies de
-- compras já existentes (múltiplas policies permissivas para o mesmo
-- comando são combinadas com OR pelo Postgres). Isso preserva a criação
-- inline pelo campo de condição de pagamento na OC/Cotação
-- (src/modules/compras/condicoes-pagamento), que continua liberada por
-- quem cria/edita Ordens ou Cotações, e passa a liberar o cadastro
-- completo (com parcelas) por quem tem cadastros.condicoes-pagamento.
--
-- Rollback:
--   drop trigger if exists trg_audit_condicoes_pagamento on public.condicoes_pagamento;
--   drop policy if exists condicoes_pagamento_select_cadastro on public.condicoes_pagamento;
--   drop policy if exists condicoes_pagamento_insert_cadastro on public.condicoes_pagamento;
--   drop policy if exists condicoes_pagamento_update_cadastro on public.condicoes_pagamento;
--   revoke update on public.condicoes_pagamento from authenticated;

create policy condicoes_pagamento_select_cadastro on public.condicoes_pagamento
  for select to authenticated
  using ((select public.tem_permissao('cadastros.condicoes-pagamento', 'ver')));

create policy condicoes_pagamento_insert_cadastro on public.condicoes_pagamento
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.condicoes-pagamento', 'criar')));

create policy condicoes_pagamento_update_cadastro on public.condicoes_pagamento
  for update to authenticated
  using ((select public.tem_permissao('cadastros.condicoes-pagamento', 'editar')))
  with check ((select public.tem_permissao('cadastros.condicoes-pagamento', 'editar')));

-- Grant explícito (rule 1): só update, que é o que faltava. Select/insert
-- já eram concedidos pela migration original.
grant update on public.condicoes_pagamento to authenticated;

-- Auditoria universal (rule 6), no mesmo padrão de todo cadastro do projeto.
create trigger trg_audit_condicoes_pagamento
  after insert or update or delete on public.condicoes_pagamento
  for each row execute function public.fn_audit();
