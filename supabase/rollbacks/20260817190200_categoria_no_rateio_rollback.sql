-- Rollback da categoria no rateio.
--
-- Atenção: a migration 20260817190300 (aprovação rateia por categoria) grava nesta
-- coluna. Reverta as duas juntas, na ordem inversa.

drop index if exists public.idx_lancamento_rateios_categoria;
alter table public.lancamento_rateios drop column if exists categoria_id;
