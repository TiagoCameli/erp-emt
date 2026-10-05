-- D3: as tres categorias de CAPEX passam para `investimento`. So estas tres.
-- "Despesas financeiras" fica como esta (limpeza manual depois).
-- Antes (03/10/2026): as tres eram `operacional`.
update public.categorias_financeiras
set natureza = 'investimento'
where nome in ('Aquisição de Equipamento', 'Investimentos', 'Compra de Terreno')
  and natureza = 'operacional';
