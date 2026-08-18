-- Espelha nomes_usuarios_compras (não nomes_usuarios_auditoria): quem já
-- pode ver o evento de parcela (financeiro.lancamentos:ver OU
-- financeiro.aprovacao-pagamentos:ver) resolve o nome de quem o causou.
-- nomes_usuarios_auditoria é gated em administracao.auditoria/lixeira, que
-- Financeiro e Gestor não têm: reusá-la apagaria o autor para quem
-- realmente usa esta trilha.
create or replace function public.nomes_usuarios_financeiro(p_ids uuid[])
returns table(id uuid, nome text)
language sql
stable
security definer
set search_path = ''
as $function$
  select u.id, u.nome
  from public.usuarios u
  where u.id = any (p_ids)
    and (
      public.tem_permissao('financeiro.lancamentos', 'ver')
      or public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver')
    );
$function$;

grant execute on function public.nomes_usuarios_financeiro(uuid[]) to authenticated;
