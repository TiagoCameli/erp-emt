-- As policies de rh_ferias ficaram apontando para um recurso que nao existe mais.
--
-- Em 12/09/2026 a migration 20260912103000 renomeou o recurso de ferias
-- (`rh.ferias` -> `rh.decimo-terceiro-ferias`) nas DUAS tabelas de permissao, e
-- ate conferiu que nao sobrou linha. O que ela nao mexeu foram as quatro
-- policies de 20260621120001, que chamam `tem_permissao('rh.ferias', ...)`.
--
-- Com o recurso renomeado, essa chamada passou a devolver FALSE para todo
-- mundo, inclusive o Admin. Efeito: a tabela rh_ferias virou invisivel e
-- imutavel pelo app. A aba nao acusou nada, porque RLS nao da erro: ela devolve
-- zero linha, que a tela mostra como "nenhuma ferias cadastrada".
--
-- Nao houve perda: a tabela esta vazia (conferido em 18/09/2026, 0 linhas).
-- Mas o recibo de ferias grava e le exatamente aqui, entao sem isto o bloco 8d
-- nasce morto.
--
-- A licao: renomear recurso e trabalho de DUAS metades. As permissoes e as
-- policies que as consultam. Quem renomeia so as permissoes desliga a tabela.

drop policy if exists rh_ferias_select on public.rh_ferias;
drop policy if exists rh_ferias_insert on public.rh_ferias;
drop policy if exists rh_ferias_update on public.rh_ferias;
drop policy if exists rh_ferias_delete on public.rh_ferias;

create policy rh_ferias_select on public.rh_ferias
  for select to authenticated
  using ((select public.tem_permissao('rh.decimo-terceiro-ferias', 'ver')));

create policy rh_ferias_insert on public.rh_ferias
  for insert to authenticated
  with check ((select public.tem_permissao('rh.decimo-terceiro-ferias', 'criar')));

create policy rh_ferias_update on public.rh_ferias
  for update to authenticated
  using ((select public.tem_permissao('rh.decimo-terceiro-ferias', 'editar')))
  with check ((select public.tem_permissao('rh.decimo-terceiro-ferias', 'editar')));

create policy rh_ferias_delete on public.rh_ferias
  for delete to authenticated
  using ((select public.tem_permissao('rh.decimo-terceiro-ferias', 'excluir')));

-- Trava: se sobrar QUALQUER policy desta tabela citando o recurso morto, a
-- migration falha em vez de deixar o buraco aberto de novo.
do $$
declare v_sobrou int;
begin
  select count(*) into v_sobrou
    from pg_policy p
   where p.polrelid = 'public.rh_ferias'::regclass
     and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%''rh.ferias''%'
       or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%''rh.ferias''%');

  if v_sobrou > 0 then
    raise exception 'Sobraram % policies de rh_ferias no recurso morto rh.ferias', v_sobrou;
  end if;
end $$;
