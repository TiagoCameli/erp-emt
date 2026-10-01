-- Cadastros: "BRITA 0\"" (em t) vira "BRITA 0". O nome igual ao do "BRITA 0" em m3
-- passa a valer porque, desde 30/09/2026, dois insumos podem ter o mesmo nome se a
-- unidade for outra, e todo seletor mostra "BRITA 0 - t" / "BRITA 0 - m3".
-- As aspas eram o jeito de diferenciar os dois pelo nome. Fretes, pedidos e a OC
-- apontam pelo id, então nada além do texto muda.
do $$
declare
  alterados int;
begin
  update public.insumos
     set nome = 'BRITA 0'
   where id = '07c7266e-3620-4bc0-98a9-a4eb8798958b'
     and nome = 'BRITA 0"';
  get diagnostics alterados = row_count;
  if alterados <> 1 then
    raise exception 'esperava renomear 1 insumo, renomeou %', alterados;
  end if;
end $$;
