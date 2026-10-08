-- A conta corrente de cada aplicação também para quem vê Conciliação.
--
-- "Lançar como transferência" e as regras da conciliação escolhem a aplicação
-- (o Rende Fácil existe em duas contas do BB). A função devolve só o nome da
-- conta, que não é saldo.

create or replace function public.fn_aplicacoes_das_etapas()
returns table(centro_custo_id uuid, conta_id uuid, conta_nome text, produto text)
language sql
stable security definer
set search_path to ''
as $function$
  select a.centro_custo_id, c.id, c.nome, a.produto
  from public.aplicacoes a
  join public.contas_bancarias s on s.id = a.conta_bancaria_id
  join public.contas_bancarias c on c.id = s.conta_pai_id
  where (select public.tem_permissao('cadastros.centros-custo', 'ver'))
     or (select public.tem_permissao('financeiro.transferencias', 'ver'))
     or (select public.tem_permissao('financeiro.conciliacao', 'ver'));
$function$;

revoke all on function public.fn_aplicacoes_das_etapas() from public, anon;
grant execute on function public.fn_aplicacoes_das_etapas() to authenticated;
