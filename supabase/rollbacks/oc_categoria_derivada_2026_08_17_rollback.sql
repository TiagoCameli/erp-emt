-- Devolve as 17 ordens do Mais Controle ao estado anterior: sem categoria.
--
-- Não desfaz a categoria do lançamento nem do rateio da OC-2026-0008: ela está
-- aprovada e recebida, e deixar o rateio sem categoria só devolveria o furo no DRE.

update public.ordens_compra set categoria_id = null, updated_at = now()
where observacoes like '%Ordem de compra Mais Controle%';
