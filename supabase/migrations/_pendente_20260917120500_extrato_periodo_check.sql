-- NÃO APLICADA. Esta é a metade que FECHA, e vai depois do deploy.
--
-- O que faz: proíbe no banco o período de extrato de trás para frente, que é o
-- defeito que a Caixa produziu em 01/2025 e 02/2025.
--
-- Por que está separada: hoje o código em produção grava o par como o arquivo
-- manda. Aplicar este CHECK antes de o parser normalizado estar no ar faz a
-- IMPORTAÇÃO DE UM EXTRATO DA CAIXA FALHAR, com erro cru, no meio da
-- conciliação do mês. Ver [[feedback_estreitar_privilegio_derruba_producao]]:
-- em 27/08 uma migration que estreitava privilégio antes do deploy derrubou
-- quatro telas.
--
-- CHECKLIST antes de aplicar:
--   1. O PR "OFX tem que ser um mês fechado" está mergeado no main?
--   2. A Vercel terminou o build do main e a produção já está com ele?
--      (conferir em /financeiro/conciliacao, importando um extrato qualquer:
--       o período tem que aparecer na ordem certa)
--   3. `select count(*) from extratos_ofx where periodo_inicio > periodo_fim`
--      devolve 0? (a migration 20260917120000 já deve ter zerado)
--   4. Só então aplicar por MCP e rodar os advisors.

alter table public.extratos_ofx
  drop constraint if exists extratos_ofx_periodo_na_ordem;

alter table public.extratos_ofx
  add constraint extratos_ofx_periodo_na_ordem
  check (
    periodo_inicio is null
    or periodo_fim is null
    or periodo_inicio <= periodo_fim
  );
