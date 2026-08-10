-- =============================================================
-- Bloqueios em lote passam a aceitar a lista de ids.
--
-- Motivo: a listagem raramente precisa do mapa inteiro, e passar os
-- ids da tela evita varrer a tabela toda. Como adicionar parametro
-- com default cria sobrecarga em vez de substituir, dropamos a
-- versao sem argumento antes.
--
-- p_ids nulo mantem o comportamento anterior (tudo).
-- =============================================================

drop function if exists public.fn_obras_bloqueios();
drop function if exists public.fn_centros_custo_bloqueios();

create or replace function public.fn_obras_bloqueios(p_ids uuid[] default null)
returns table (obra_id uuid, bloqueio text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('cadastros.obras', 'ver') then
    raise exception 'Sem permissao para ver obras';
  end if;
  return query
    select o.id, public.fn_obra_bloqueio(o.id)
    from public.obras o
    where p_ids is null or o.id = any(p_ids);
end $$;

revoke all on function public.fn_obras_bloqueios(uuid[]) from public, anon;
grant execute on function public.fn_obras_bloqueios(uuid[]) to authenticated;

create or replace function public.fn_centros_custo_bloqueios(p_ids uuid[] default null)
returns table (centro_custo_id uuid, bloqueio text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('cadastros.centros-custo', 'ver') then
    raise exception 'Sem permissao para ver centros de custo';
  end if;
  return query
    select c.id, public.fn_centro_custo_bloqueio(c.id)
    from public.centros_custo c
    where p_ids is null or c.id = any(p_ids);
end $$;

revoke all on function public.fn_centros_custo_bloqueios(uuid[]) from public, anon;
grant execute on function public.fn_centros_custo_bloqueios(uuid[]) to authenticated;
