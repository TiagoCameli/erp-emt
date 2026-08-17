-- Rollback de 20260817160000_oc_ajustes_e_preco_com_4_casas.sql
--
-- ATENÇÃO, LEIA ANTES DE RODAR. Este rollback PERDE DADO em dois pontos, e não
-- tem como não perder:
--
-- 1. Voltar `preco_unitario` para NUMERIC(14,2) arredonda os preços de 4 casas
--    que já estiverem gravados. O diesel a R$ 6,5770 vira R$ 6,58, e o
--    valor_total das OCs de combustível muda (na carga do Mais Controle isso dava
--    R$ 41,56 de erro numa OC só).
-- 2. Derrubar as 4 colunas de ajuste apaga frete, outras despesas, impostos e
--    desconto de todas as OCs que os tiverem.
--
-- Confira antes o que seria perdido:
--   select numero, frete, outras_despesas, impostos, desconto
--     from ordens_compra
--    where frete <> 0 or outras_despesas <> 0 or impostos <> 0 or desconto <> 0;
--   select count(*) from oc_itens where preco_unitario <> round(preco_unitario, 2);

drop trigger if exists trg_total_oc_cabecalho on public.ordens_compra;
drop function if exists public.fn_total_oc_cabecalho();

-- Volta a trigger de item ao cálculo antigo (só a soma dos itens).
create or replace function public.fn_recalcular_total_oc()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_oc uuid := coalesce(new.ordem_compra_id, old.ordem_compra_id);
begin
  if coalesce(current_setting('oc.recalc_suprimido', true), '') = '1' then
    return null;
  end if;

  update public.ordens_compra o
  set valor_total = coalesce((select sum(i.quantidade * i.preco_unitario)
                                from public.oc_itens i
                               where i.ordem_compra_id = v_oc), 0)
  where o.id = v_oc;
  return null;
end $function$;

drop function if exists public.fn_total_da_oc(uuid, numeric, numeric, numeric, numeric);

alter table public.ordens_compra
  drop column if exists frete,
  drop column if exists outras_despesas,
  drop column if exists impostos,
  drop column if exists desconto;

alter table public.oc_itens
  alter column preco_unitario type numeric(14,2);
