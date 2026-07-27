-- Colunas onde a folha vai gravar os descontos legais por item — Bloco 7 (holerite).
-- A folha passa a calcular INSS/IRRF por faixa (folha_inss_faixas / folha_irrf_faixas)
-- e grava o valor apurado por colaborador em cada item da folha (folha_itens).
-- Sao SO colunas novas (expand): NAO mexem em policy nem grant de folha_itens — a policy
-- de select (rh.folha ver) e a escrita SECURITY DEFINER via fn_gerar_folha continuam valendo.
-- Dinheiro em NUMERIC(14,2); default 0 (item existente fica com 0 ate a folha recalcular).
--
-- Rollback:
--   alter table public.folha_itens drop column if exists irrf;
--   alter table public.folha_itens drop column if exists inss;

alter table public.folha_itens
  add column inss numeric(14,2) not null default 0,
  add column irrf numeric(14,2) not null default 0;
