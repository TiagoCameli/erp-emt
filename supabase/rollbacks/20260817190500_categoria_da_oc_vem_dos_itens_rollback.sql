-- Rollback: a categoria da OC volta a ser o que estiver gravado, sem se manter
-- sozinha pelos itens. Se o campo também já saiu do formulário, ordens novas passam a
-- nascer sem categoria — reverta junto a mudança do formulário.

drop trigger if exists trg_categoria_da_oc_pelos_itens on public.oc_itens;
drop function if exists public.fn_categoria_da_oc_pelos_itens();
