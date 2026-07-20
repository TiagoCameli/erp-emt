-- Reforma A: enxuga Compras (remove Pedidos e Recebimentos do banco).

-- 1) Sever FKs cruzadas e dropar as colunas pedido_id (origem fica, destino dropa).
alter table public.cotacoes       drop constraint if exists cotacoes_pedido_id_fkey;
alter table public.cotacoes       drop column     if exists pedido_id;
alter table public.ordens_compra  drop constraint if exists ordens_compra_pedido_id_fkey;
alter table public.ordens_compra  drop column     if exists pedido_id;

-- 2) fn_desaprovar_ordem_compra sem a checagem de recebimentos.
create or replace function public.fn_desaprovar_ordem_compra(p_oc_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_status text;
begin
  if not public.tem_permissao('compras.ordens', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar ordens de compra';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da desaprovacao';
  end if;
  select status into v_status from public.ordens_compra where id = p_oc_id;
  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'aprovado' then
    raise exception 'So da para desaprovar uma OC aprovada e ainda sem recebimento';
  end if;
  update public.ordens_compra set status = 'pendente_aprovacao', aprovado_por = null, aprovado_em = null where id = p_oc_id;
  update public.lancamentos set status = 'cancelado' where origem = 'oc' and origem_id = p_oc_id and status = 'previsto';
end $function$;

-- 3) Dropar a função de recebimento (referencia estoque + recebimentos).
drop function if exists public.fn_registrar_recebimento(uuid, text, numeric, date, date, jsonb, text) cascade;

-- 4) Dropar as tabelas de Pedidos e Recebimentos (filha -> pai).
drop table if exists public.recebimento_itens;
drop table if exists public.recebimentos;
drop table if exists public.pedido_itens;
drop table if exists public.pedidos;

-- 5) Recriar o CHECK de status da OC sem recebido/recebido_parcial.
alter table public.ordens_compra drop constraint if exists ordens_compra_status_check;
alter table public.ordens_compra add  constraint ordens_compra_status_check
  check (status in ('rascunho','pendente_aprovacao','aprovado','rejeitado','cancelado'));

-- 6) Recriar fn_recurso_do_anexo e fn_recurso_do_path_anexo sem pedidos/recebimentos.
create or replace function public.fn_recurso_do_anexo(p_tabela text)
returns text language sql immutable set search_path to '' as $function$
  select case p_tabela
    when 'cotacoes'      then 'compras.cotacoes'
    when 'ordens_compra' then 'compras.ordens'
    else null
  end;
$function$;

create or replace function public.fn_recurso_do_path_anexo(p_path text)
returns text language sql immutable set search_path to '' as $function$
  select public.fn_recurso_do_anexo(split_part(p_path, '/', 1));
$function$;
