-- A categoria de custo da ordem de compra passa a vir dos itens, sempre.
--
-- Ela saiu do formulário: quem escolhe "Diesel S10" já disse que o custo é
-- Combustível, e digitar de novo num select de 55 opções só cria chance de divergir.
-- Mas a coluna continua existindo e sendo útil — a listagem filtra e mostra por ela,
-- inclusive em rascunho, antes de existir lançamento.
--
-- Um trigger em `oc_itens` mantém a coluna certa por QUALQUER caminho: formulário,
-- carga por SQL, prefill de cotação. Sem ele, a ordem nasceria sem categoria e só
-- ganharia uma na aprovação — e as 17 carregadas do Mais Controle voltariam a ficar
-- em branco no primeiro item editado.
--
-- A regra é a mesma da aprovação (`fn_aprovar_ordem_compra`): a categoria de maior
-- valor entre os itens. Duas regras diferentes divergiriam.

create or replace function public.fn_categoria_da_oc_pelos_itens()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_oc uuid := coalesce(new.ordem_compra_id, old.ordem_compra_id);
begin
  update public.ordens_compra o
  set categoria_id = (
    select i.categoria_financeira_id
    from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where oi.ordem_compra_id = v_oc and i.categoria_financeira_id is not null
    group by i.categoria_financeira_id
    order by sum(oi.quantidade * oi.preco_unitario) desc, i.categoria_financeira_id
    limit 1
  )
  where o.id = v_oc
    -- ordem aprovada nao muda de categoria por edicao de item: o lancamento dela ja
    -- existe e o rateio dele e a verdade. Editar aprovado exige desaprovar primeiro.
    and o.status in ('rascunho', 'pendente_aprovacao', 'rejeitado');

  return null;
end;
$$;

comment on function public.fn_categoria_da_oc_pelos_itens() is
  'Mantem ordens_compra.categoria_id igual a categoria de maior valor entre os itens.';

revoke all on function public.fn_categoria_da_oc_pelos_itens() from public;
revoke all on function public.fn_categoria_da_oc_pelos_itens() from anon;
revoke all on function public.fn_categoria_da_oc_pelos_itens() from authenticated;

drop trigger if exists trg_categoria_da_oc_pelos_itens on public.oc_itens;

create trigger trg_categoria_da_oc_pelos_itens
after insert or update or delete on public.oc_itens
for each row execute function public.fn_categoria_da_oc_pelos_itens();
