-- "Pago por" do pagamento de frete: a origem listava os funcionários para quem lança pagamento.
-- No ERP a RLS de colaboradores só abre para quem tem o cadastro de colaboradores (RH), e quem
-- lança frete não via os nomes. Decisão do Tiago (24/09/2026): "pode liberar os nomes".
-- Só id e nome dos ativos, só para quem vê o Frete; salário, documento e o resto do RH seguem
-- fechados pela RLS da tabela.
create or replace function public.nomes_colaboradores_frete()
returns table(id uuid, nome text) language sql stable security definer set search_path to '' as $$
  select c.id, c.nome from public.colaboradores c
  where c.ativo and public.fn_ve_frete()
  order by c.nome, c.id;
$$;
revoke all on function public.nomes_colaboradores_frete() from public, anon;
grant execute on function public.nomes_colaboradores_frete() to authenticated;
