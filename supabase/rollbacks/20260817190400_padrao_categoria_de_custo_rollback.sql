-- Rollback do padrão de categoria de custo.
--
-- Atenção: a importação de insumos por planilha depende desta função. Sem ela, a
-- importação passa a falhar (é o que se quer: melhor falhar que criar insumo sem
-- categoria de custo).

drop function if exists public.fn_padrao_categoria_de_custo();
