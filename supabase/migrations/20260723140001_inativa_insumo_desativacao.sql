-- Task 7 (QA melhoria #8): inativar de verdade o insumo marcado "em desativação".
--
-- Causa raiz: o seletor de insumo da OC (listarInsumos) já filtra ativo=true,
-- mas o insumo abaixo foi "desativado" só no nome (prefixo "!EM PROCESSO DE
-- DESATIVACAO!"), permanecendo ativo=true no banco. Por isso ainda aparecia
-- (no topo, por ordenação alfabética) no seletor de insumo da OC.
--
-- Confirmado via execute_sql antes desta migration:
--   select id, nome, ativo from insumos
--   where nome ilike '%EM PROCESSO DE DESATIVACAO%' or nome ilike '%DESATIVAC%';
-- -> único registro: id 8907f1f6-024e-43d4-bc30-9bea77b73c35, ativo=true.
--
-- Inativar (ativo=false) não apaga nada: histórico em OCs antigas permanece
-- intacto, o insumo só some do seletor (comportamento correto para item
-- descontinuado).
--
-- Rollback: update insumos set ativo = true
--           where id in ('8907f1f6-024e-43d4-bc30-9bea77b73c35');

update insumos
set ativo = false
where id in ('8907f1f6-024e-43d4-bc30-9bea77b73c35');
