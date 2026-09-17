-- Proíbe no banco o período de extrato de trás para frente.
--
-- É a metade que FECHA da obra "OFX tem que ser um mês fechado" (PR #283). Ela
-- ficou separada e fora do banco até o deploy, porque o código em produção
-- gravava o par como o arquivo mandava: aplicar antes faria a importação de um
-- extrato da Caixa falhar, com erro cru, no meio da conciliação do mês. Ver
-- [[feedback_estreitar_privilegio_derruba_producao]], onde uma migration que
-- estreitou privilégio antes do deploy derrubou quatro telas em 27/08.
--
-- CHECKLIST RODADO em 17/09/2026, nesta ordem:
--   1. PR #283 mergeado no main em 543d68b. OK
--   2. Vercel publicou o main (commit status "Vercel: success"). OK
--   3. `select count(*) from extratos_ofx where periodo_inicio > periodo_fim`
--      devolveu 0, depois da migration 20260917120000. OK
--   4. Aplicada por MCP.
--
-- Prova em transação desfeita, logo depois de aplicar:
--   - inserir período 31/01 -> 01/01 foi RECUSADO pelo CHECK;
--   - inserir 01/01 -> 31/01 entrou normalmente;
--   - `fn_importar_extrato` continuou importando (inseridas=1).
-- As duas últimas linhas são o controle: sem elas a prova não distingue
-- "trava funcionando" de "trava impedindo o trabalho".

alter table public.extratos_ofx
  drop constraint if exists extratos_ofx_periodo_na_ordem;

alter table public.extratos_ofx
  add constraint extratos_ofx_periodo_na_ordem
  check (
    periodo_inicio is null
    or periodo_fim is null
    or periodo_inicio <= periodo_fim
  );
