-- ===================================================================
-- NAO APLICAR JUNTO COM O PR DO BLOCO 8d.
-- ===================================================================
--
-- Esta migration FECHA privilegio: tira INSERT/UPDATE/DELETE de
-- `authenticated` em rh_ferias e derruba as policies de escrita.
--
-- Migration neste projeto vai direto para PRODUCAO: nao ha branch de banco.
-- Entao revogar nao e "preparar o terreno", e quebrar na hora o codigo que
-- esta no ar. A ordem que funciona:
--
--   1. subir o codigo que para de usar o acesso (bloco 8d, Tasks 4 a 8);
--   2. CONFIRMAR o deploy em producao;
--   3. so entao aplicar esta.
--
-- Aplicar so depois de confirmar em producao que:
--
--   [ ] o deploy do 8d subiu (conferir o sha em
--       `gh api repos/:owner/:repo/deployments`);
--   [ ] `grep -rn 'from("rh_ferias")' src` nao devolve NENHUM
--       `.insert(`, `.update(` ou `.delete(` — so `.select(`;
--   [ ] a tela de ferias abre, programa, edita e exclui em producao;
--   [ ] o recibo lanca, edita, envia, aprova e desaprova em producao.
--
-- Com qualquer item aberto, NAO aplicar: em 27/08/2026 um revoke assim
-- derrubou quatro telas para todos os usuarios, inclusive Admin, e outra
-- frente teve que aplicar migration de emergencia.
--
-- O QUE ESTA ABERTO ATE ELA SER APLICADA: com o grant de escrita de pe,
-- qualquer usuario autenticado manda um PATCH direto no PostgREST trocando
-- `valor_bruto` ou `status_recibo` de um recibo JA APROVADO, sem passar por
-- nenhuma das travas de status das RPCs. Grant de tabela nao se reduz por
-- coluna, entao nao ha meio termo: ou a escrita direta existe inteira, ou nao
-- existe.
--
-- Depois de aplicar, conferir que a forma ficou igual a de
-- rh_decimo_terceiro: `authenticated` so com SELECT, `anon` sem nada.

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
