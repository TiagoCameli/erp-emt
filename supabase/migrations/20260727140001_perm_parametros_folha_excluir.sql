-- Fecha o gap de permissao do recurso rh.parametros-folha (Bloco 7, Task 2).
-- A Task 1 semeou rh.parametros-folha espelhando EXATAMENTE rh.folha (ver/criar/editar),
-- que NAO tem a acao 'excluir'. Sem 'excluir', excluir uma faixa de INSS/IRRF (soft delete
-- via fn_excluir_cadastro, gated por exigirPermissao('rh.parametros-folha', 'excluir')) falha
-- na Server Action mesmo pro usuario que ja cria/edita faixas.
--
-- config/recursos.ts ja registra rh.parametros-folha com acoes: CRUD (inclui 'excluir'),
-- entao so falta a linha de dado. Copia a acao 'excluir' para os MESMOS perfis/usuarios que
-- ja tem 'criar' do recurso, direto de perfil_permissoes/usuario_permissoes (sem redepender
-- de perfil_id, cobre tambem eventual grant avulso de usuario). Lido via MCP (2026-07-27):
-- perfil_permissoes com recurso='rh.parametros-folha' e acao='criar' = 2 linhas; mesmo em
-- usuario_permissoes = 2 linhas. Idempotente (on conflict do nothing).
--
-- Rollback:
--   delete from public.usuario_permissoes where recurso = 'rh.parametros-folha' and acao = 'excluir';
--   delete from public.perfil_permissoes where recurso = 'rh.parametros-folha' and acao = 'excluir';

-- 1) Matriz de perfil: mesmos perfis que ja tem 'criar' de rh.parametros-folha, com 'excluir'.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select perfil_id, recurso, 'excluir'
from public.perfil_permissoes
where recurso = 'rh.parametros-folha' and acao = 'criar'
on conflict (perfil_id, recurso, acao) do nothing;

-- 2) Mesmos usuarios que ja tem 'criar' de rh.parametros-folha, com 'excluir'.
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select usuario_id, recurso, 'excluir', created_by
from public.usuario_permissoes
where recurso = 'rh.parametros-folha' and acao = 'criar'
on conflict (usuario_id, recurso, acao) do nothing;
