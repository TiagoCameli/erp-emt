-- =============================================================
-- Bloqueio de exclusao em lote, para a listagem.
--
-- As queries do app usam o client do Supabase (PostgREST), nao SQL
-- cru, entao nao da para fazer LEFT JOIN LATERAL com as contagens.
-- Chamar fn_obra_dependencias por linha seria N+1. Estas funcoes
-- devolvem o mapa id -> codigo de bloqueio numa unica chamada.
--
-- Security definer pelo mesmo motivo das funcoes de dependencia:
-- sob RLS o usuario pode nao ver lancamentos/folha e a contagem
-- sairia zerada, habilitando um botao que vai falhar. Exige 'ver'.
-- =============================================================

create or replace function public.fn_obras_bloqueios()
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
    select o.id, public.fn_obra_bloqueio(o.id) from public.obras o;
end $$;

revoke all on function public.fn_obras_bloqueios() from public, anon;
grant execute on function public.fn_obras_bloqueios() to authenticated;

create or replace function public.fn_centros_custo_bloqueios()
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
    select c.id, public.fn_centro_custo_bloqueio(c.id) from public.centros_custo c;
end $$;

revoke all on function public.fn_centros_custo_bloqueios() from public, anon;
grant execute on function public.fn_centros_custo_bloqueios() to authenticated;
