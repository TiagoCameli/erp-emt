-- Fecha a escrita direta em rh_ferias: `authenticated` fica so com SELECT.
--
-- APLICADA EM 18/09/2026, versao 20260918221453, DEPOIS do deploy do bloco 8d.
--
-- Nasceu como `_PENDENTE_` de proposito. Migration neste projeto vai direto
-- para PRODUCAO: nao ha branch de banco. Entao revogar nao e "preparar o
-- terreno", e quebrar na hora o codigo que esta no ar. Em 27/08/2026 um revoke
-- assim derrubou quatro telas para todos os usuarios, inclusive Admin, e outra
-- frente teve que aplicar migration de emergencia.
--
-- A ordem que funciona, e que foi seguida aqui:
--
--   1. subir o codigo que para de usar o acesso (PR #287);
--   2. CONFIRMAR o deploy em producao;
--   3. so entao aplicar esta.
--
-- Checklist rodado em 18/09/2026, antes de aplicar:
--
--   [x] deploy do 8d em producao no commit 331b203. A Vercel tinha PERDIDO o
--       gatilho do merge: o CI passou no commit, mas ela nao criou deployment
--       nenhum por 20 minutos, enquanto deployava os commits vizinhos. Foi
--       preciso disparar o deploy de producao na mao apontando para o sha.
--       Conferir o deploy nao e formalidade.
--   [x] `grep -rn 'rh_ferias' src` nao devolve nenhum `.insert(`, `.update(`
--       nem `.delete(`: sobram dois `.from("rh_ferias")`, os dois com
--       `.select(`;
--   [x] provado como `authenticated` DEPOIS do revoke, em transacao desfeita:
--       o `update` direto na tabela leva `permission denied`, e o caminho da
--       tela continua inteiro pelas RPCs — lancar, editar, definir vencimento,
--       enviar, devolver, aprovar (1 lancamento de 900,00 na competencia
--       2026-03-01, no centro do colaborador), desaprovar e excluir, pelas
--       DUAS portas de criacao;
--   [x] a linha gravada continua VISIVEL para quem gravou, que e o que o
--       SELECT e a policy de leitura garantem.
--
-- O que estava aberto ate aqui: com o grant de escrita de pe, qualquer usuario
-- autenticado mandava um PATCH direto no PostgREST trocando `valor_bruto` ou
-- `status_recibo` de um recibo JA APROVADO, sem passar por nenhuma das travas
-- de status das RPCs. Grant de tabela nao se reduz por coluna, entao nao havia
-- meio termo: ou a escrita direta existia inteira, ou nao existia.
--
-- Depois de aplicada, a forma ficou igual a de rh_decimo_terceiro:
-- `authenticated` so com SELECT, `anon` sem nada.

revoke insert, update, delete on public.rh_ferias from authenticated;

drop policy if exists "rh_ferias_insert" on public.rh_ferias;
drop policy if exists "rh_ferias_update" on public.rh_ferias;
drop policy if exists "rh_ferias_delete" on public.rh_ferias;

-- Conferencia, dentro da propria migration: se sobrou privilegio de escrita,
-- estoura e desfaz em vez de deixar meio fechado.
do $$
declare v_extra text;
begin
  select string_agg(privilege_type, ',') into v_extra
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'rh_ferias'
     and grantee = 'authenticated' and privilege_type <> 'SELECT';
  if v_extra is not null then
    raise exception 'Sobrou privilegio de escrita em rh_ferias: %', v_extra;
  end if;
end $$;

-- A outra metade: SELECT tem que CONTINUAR de pe. Fechar demais aqui
-- esconderia a tabela de novo, que e exatamente o que a migration
-- 20260918100000 acabou de consertar.
do $$
begin
  if not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'rh_ferias'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception 'authenticated perdeu o SELECT de rh_ferias: a tela ficaria vazia';
  end if;

  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.rh_ferias'::regclass and polname = 'rh_ferias_select'
  ) then
    raise exception 'a policy de SELECT de rh_ferias sumiu: a tela ficaria vazia';
  end if;
end $$;
