-- Tira TRUNCATE, TRIGGER e REFERENCES de anon e authenticated, e fecha a origem
-- para as proximas tabelas nascerem limpas.
--
-- APLICADA EM PRODUCAO em 05/08/2026, versao 20260805205011. Este arquivo e o
-- texto que rodou; se divergir, o banco e a verdade.
--
-- POR QUE: TRUNCATE NAO PASSA POR RLS. A policy que protege linha a linha nao
-- impede ninguem de esvaziar a tabela inteira. Com 20 a 30 usuarios no ERP, basta
-- uma credencial vazada. E anon e o papel de quem NAO esta logado: pela regra de
-- ouro 1 do CLAUDE.md, "anon nunca recebe nada".
--
-- RETRATO DO ANTES (medido em 05/08/2026): 324 combinacoes tabela x papel x
-- privilegio entre anon e authenticated para os tres. A escrita legitima de
-- authenticated era SELECT 61 | INSERT 40 | UPDATE 38 | DELETE 17, e TEM que
-- continuar identica. Depois de aplicar, continuou.
--
-- A ORIGEM, e aqui existe um detalhe que custou uma tentativa: pg_default_acl tem
-- DUAS entradas para tabelas em public.
--   postgres       -> anon=Dxtm, authenticated=Dxtm, service_role=Dxtm
--   supabase_admin -> anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm
-- A que importa aqui e a do postgres, porque TODAS as tabelas de public sao dele
-- (pg_tables.tableowner = postgres em 100%), ou seja e como papel postgres que as
-- migrations criam tabela. A do supabase_admin e padrao da plataforma e nao e nosso
-- para mexer; ela so entra em jogo se alguem criar tabela COMO supabase_admin, o que
-- nao acontece pelo caminho das migrations. Fica registrado como limite conhecido.
--
-- Depois deste arquivo sobra `m` (MAINTAIN, do Postgres 17) para anon e
-- authenticated no default do postgres. MAINTAIN deixa rodar VACUUM, ANALYZE e
-- REINDEX na tabela: nao apaga nem le dado, entao nao entra no escopo do que o
-- Tiago pediu. Fica anotado como coisa a decidir separado, nao como esquecimento.
--
-- NAO E revoke all, de proposito: rh_pontos tem grant POR COLUNA (11 colunas em
-- SELECT e 11 em INSERT) e um revoke amplo quebraria RH > Apontamentos, botao
-- Editar ponto. Aqui os tres privilegios saem NOMINALMENTE e o resto fica intocado.
--
-- service_role NAO e tocado: e a chave do cliente administrativo
-- (src/lib/supabase/admin.ts), roda so no servidor e nunca vai ao navegador. Tirar
-- TRUNCATE dele nao protege de nada, porque quem tem a chave ja pode tudo.
--
-- PROVADO antes de aplicar, em begin...rollback, 11 casos: truncate recusado como
-- authenticated ("permission denied for table lancamento_parcelas") e como anon;
-- SELECT (1.596 lancamentos), UPDATE direto (o que editarOrdem faz) e RPC security
-- definer continuando a passar; os quatro privilegios de escrita e os 11 grants por
-- coluna do rh_pontos identicos ao antes; e tabela criada depois do alter default
-- privileges nascendo sem os tres.

revoke truncate, trigger, references on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from authenticated;

-- Trava: migration que "deu tudo certo" e deixou o furo aberto e pior que migration
-- que falha, porque ninguem volta para conferir.
--
-- O teste olha SO as letras de privilegio, entre o '=' e o '/'. A primeira versao
-- deste arquivo comparava o acl inteiro com like '%t%' e casava o "t" de "postgres",
-- reprovando um estado correto. Erro de quem escreve a trava, mas custaria uma
-- migration fantasma para quem viesse depois.
do $$
declare
  v_sobrou text;
  v_default text;
begin
  select string_agg(distinct grantee || ' ' || privilege_type, ', ')
  into v_sobrou
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES');

  if v_sobrou is not null then
    raise exception 'Sobrou privilegio de tabela: %', v_sobrou;
  end if;

  select string_agg(acl::text, ', ') into v_default
  from pg_default_acl d, unnest(d.defaclacl) acl
  where d.defaclnamespace = 'public'::regnamespace
    and d.defaclobjtype = 'r'
    and d.defaclrole = 'postgres'::regrole
    and split_part(acl::text, '=', 1) in ('anon', 'authenticated')
    and split_part(split_part(acl::text, '=', 2), '/', 1) ~ '[Dxt]';

  if v_default is not null then
    raise exception 'Default privilege do postgres ainda concede os tres: %', v_default;
  end if;
end $$;
