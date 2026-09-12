-- Abre duas origens novas em lancamentos e renomeia o recurso de ferias.
--
-- Origem nova e pre-requisito das RPCs do 13o: sem ela o insert do lancamento
-- estoura no CHECK, e estoura DEPOIS de o lote ja estar marcado como aprovado,
-- deixando metade do trabalho feito.
alter table public.lancamentos drop constraint lancamentos_origem_check;

alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem in ('oc','manual','diaria','folha','folha_guia',
                    'adiantamento','rescisao','decimo_terceiro','ferias'));

-- O recurso muda de nome junto com a rota (/rh/ferias -> /rh/decimo-terceiro-e-ferias).
-- As DUAS tabelas, porque getUsuarioLogado le usuario_permissoes (a permissao
-- EFETIVA do usuario), nao perfil_permissoes: renomear so uma tira o acesso de
-- todo mundo na pratica, mesmo com a matriz do perfil parecendo certa.
update public.perfil_permissoes
   set recurso = 'rh.decimo-terceiro-ferias'
 where recurso = 'rh.ferias';

update public.usuario_permissoes
   set recurso = 'rh.decimo-terceiro-ferias'
 where recurso = 'rh.ferias';

-- Acoes novas do recurso (aprovar/desaprovar) para o perfil Admin.
-- Em rh.encargos o catalogo declarou `excluir` e NENHUM perfil ganhou, nem o
-- Admin, e o conserto do dispatcher ficou inalcancavel pela tela. Molde do
-- conserto: 20260727140001.
--
-- So o Admin. O perfil RH fica com o CRUD que ja tinha: gera e edita o lote,
-- mas nao aprova. Se o Tiago quiser que o RH aprove, sao duas linhas depois.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'rh.decimo-terceiro-ferias', a.acao
  from public.perfis p
 cross join (values ('aprovar'), ('desaprovar')) as a(acao)
 where p.nome = 'Admin'
on conflict do nothing;

insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, 'rh.decimo-terceiro-ferias', a.acao
  from public.usuarios u
  join public.perfis p on p.id = u.perfil_id
 cross join (values ('aprovar'), ('desaprovar')) as a(acao)
 where p.nome = 'Admin'
on conflict do nothing;

-- Linha de controle DENTRO da migration. Se a renomeacao nao pegou ninguem,
-- e melhor estourar aqui e desfazer do que descobrir pela tela em branco de
-- 24 usuarios. Conferido antes de rodar: 9 linhas de perfil e 24 de usuario.
do $$
declare
  v_restou integer;
  v_perfil integer;
  v_usuario integer;
begin
  select count(*) into v_restou
    from public.usuario_permissoes where recurso = 'rh.ferias';
  if v_restou > 0 then
    raise exception 'Sobraram % permissoes em rh.ferias: a renomeacao nao fechou', v_restou;
  end if;

  select count(*) into v_perfil
    from public.perfil_permissoes where recurso = 'rh.decimo-terceiro-ferias';
  select count(*) into v_usuario
    from public.usuario_permissoes where recurso = 'rh.decimo-terceiro-ferias';

  -- Numero exato, nao ">=": assercao frouxa esconde a linha que nao foi
  -- renomeada. 9 + 2 (Admin) = 11, e 24 + 2x4 (usuarios Admin) = 32.
  if v_perfil <> 11 then
    raise exception 'Esperava 11 permissoes de perfil, vieram %', v_perfil;
  end if;
  if v_usuario <> 32 then
    raise exception 'Esperava 32 permissoes de usuario, vieram %', v_usuario;
  end if;
end $$;
