-- Nomes de quem lançou e aprovou no Frete ("Criado por", "Aprovado por", trilha). A RLS de
-- usuarios só mostra a própria linha (ou a Administração); mesmo molde de
-- nomes_usuarios_manutencao: só id e nome, só para quem vê o Frete.
create or replace function public.nomes_usuarios_frete(p_ids uuid[])
returns table(id uuid, nome text) language sql stable security definer set search_path to '' as $$
  select u.id, u.nome from public.usuarios u
  where u.id = any (p_ids) and public.fn_ve_frete();
$$;
revoke all on function public.nomes_usuarios_frete(uuid[]) from public, anon;
grant execute on function public.nomes_usuarios_frete(uuid[]) to authenticated;
