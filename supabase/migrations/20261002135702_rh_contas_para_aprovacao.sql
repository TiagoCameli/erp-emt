-- Contas ativas para o modal de aprovacao do RH (folha, 13o, ferias).
-- A policy de contas_bancarias so abre para quem ve alguma tela do Financeiro;
-- quem aprova folha sem isso veria a lista vazia e nao conseguiria aprovar.
-- So id, nome e banco: saldo continua so para quem pode ve-lo.
create or replace function public.fn_contas_para_aprovacao_rh()
returns table (id uuid, nome text, banco text)
language sql
stable
security definer
set search_path to ''
as $$
  select c.id, c.nome::text, c.banco::text
    from public.contas_bancarias c
   where c.ativo
     and (public.tem_permissao('rh.folha', 'aprovar')
          or public.tem_permissao('rh.decimo-terceiro-ferias', 'aprovar'))
   order by c.nome;
$$;

revoke all on function public.fn_contas_para_aprovacao_rh() from public, anon;
grant execute on function public.fn_contas_para_aprovacao_rh() to authenticated;
