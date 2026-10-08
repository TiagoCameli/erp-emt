-- A conta corrente de cada aplicação também para quem vê Transferências.
--
-- O seletor "Aplicação" da transferência mostra a conta onde a aplicação está
-- (o Rende Fácil existe em duas contas do BB). A tabela `aplicacoes` só é
-- legível por quem vê a aba Aplicações; a função devolve só o nome da conta,
-- que não é saldo, e quem lança transferência já escolhe essas contas.

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
     or (select public.tem_permissao('financeiro.transferencias', 'ver'));
$function$;

revoke all on function public.fn_aplicacoes_das_etapas() from public, anon;
grant execute on function public.fn_aplicacoes_das_etapas() to authenticated;
