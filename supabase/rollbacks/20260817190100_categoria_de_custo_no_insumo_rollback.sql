-- Rollback da categoria de custo no insumo.
--
-- Apaga a coluna e o índice. A semeadura vai com ela: não há o que preservar, porque
-- o valor era derivado do mapa e refazer é rodar a migration de novo.
--
-- Atenção: a migration 20260817190300 (aprovação rateia por categoria) depende desta
-- coluna. Reverta as duas juntas, na ordem inversa.

drop index if exists public.idx_insumos_categoria_financeira;
alter table public.insumos drop column if exists categoria_financeira_id;
