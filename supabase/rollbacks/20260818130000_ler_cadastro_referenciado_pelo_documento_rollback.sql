-- Rollback de 20260818130000_ler_cadastro_referenciado_pelo_documento.sql.
--
-- Volta as três políticas a exigir SÓ a permissão do próprio cadastro. Rodar isto
-- traz de volta o defeito que a migration conserta: usuário com Compras e sem
-- Cadastros voltará a ver UUID no lugar de fornecedor, centro de custo e insumo
-- na ordem de compra.
--
-- Só faz sentido se a decisão for outra: dar `cadastros.*.ver` a quem precisa.

drop policy if exists fornecedores_select on public.fornecedores;
create policy fornecedores_select on public.fornecedores
for select using (
  (select public.tem_permissao('cadastros.fornecedores', 'ver'))
);

drop policy if exists centros_custo_select on public.centros_custo;
create policy centros_custo_select on public.centros_custo
for select using (
  (select public.tem_permissao('cadastros.centros-custo', 'ver'))
);

drop policy if exists insumos_select on public.insumos;
create policy insumos_select on public.insumos
for select using (
  (select public.tem_permissao('cadastros.insumos', 'ver'))
);
