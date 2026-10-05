-- D3 (Tiago, 03/10/2026): CAPEX ganha natureza propria. `investimento` e
-- dinheiro que sai do caixa (entra no saldo e no fluxo) mas nao e custo do mes
-- nem da obra: fica fora do resultado operacional e do custo por centro, salvo
-- quando a tela pede "Incluir investimentos".
alter table public.categorias_financeiras
  drop constraint categorias_financeiras_natureza_check;

alter table public.categorias_financeiras
  add constraint categorias_financeiras_natureza_check
  check (natureza = any (array['operacional', 'financeira', 'movimentacao', 'investimento']));
