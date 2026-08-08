-- Fix round 1 da Task 1 do Bloco 8a. Migration corretiva (nunca editar migration
-- ja aplicada). Tres coisas:
--   1) fn_gerar_folha volta a ter guarda de status (a antiga checava 'fechada',
--      que deixou de existir, e o trg_guarda_status_folha e BEFORE UPDATE OF status,
--      entao nao cobre esse caminho: a fn_gerar_folha apaga/recria folha_itens sem
--      tocar em status). Sem isso, regerar folha aprovada descola os itens dos
--      lancamentos que as Tasks 4 e 5 vao criar.
--   2) fn_guarda_status_folha perde o EXECUTE default para PUBLIC (=> anon),
--      espelhando fn_guarda_status_oc (proacl = {postgres=X/postgres}).
--   3) travas de presenca no seed de permissao (as antigas so provavam excesso).

-- ============ 1) guarda de status da fn_gerar_folha ============
-- A funcao e recriada a partir da PROPRIA definicao viva via replace(), para
-- garantir corpo byte a byte identico: a unica diferenca possivel e a guarda.
-- Idempotente e fail-loud: se nao achar nem a guarda antiga nem a nova, aborta.
do $$
declare
  v_old text; v_new text;
  c_antiga constant text := '  if v_status = ''fechada'' then raise exception ''A folha desta competencia ja esta fechada''; end if;';
  c_nova constant text :=
    '  if v_status is not null and v_status <> ''rascunho'' then' || E'\n' ||
    '    raise exception ''A folha de %/% esta em "%": só da para gerar em rascunho. Rejeite ou desaprove antes de regerar.'',' || E'\n' ||
    '      to_char(v_ini, ''MM''), to_char(v_ini, ''YYYY''), v_status;' || E'\n' ||
    '  end if;';
begin
  select pg_get_functiondef(p.oid) into v_old
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  if v_old is null then
    raise exception 'ABORTA: public.fn_gerar_folha nao existe';
  end if;

  if position(c_antiga in v_old) > 0 then
    execute replace(v_old, c_antiga, c_nova);
  elsif position('só da para gerar em rascunho' in v_old) > 0 then
    null; -- já aplicada: nada a fazer
  else
    raise exception 'ABORTA: fn_gerar_folha nao tem a guarda antiga nem a nova; revisar a mao';
  end if;

  select pg_get_functiondef(p.oid) into v_new
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  if position('v_status is not null and v_status <> ''rascunho''' in v_new) = 0 then
    raise exception 'ABORTA: a guarda nova nao ficou na definicao final';
  end if;
  if position('ja esta fechada' in v_new) > 0 then
    raise exception 'ABORTA: sobrou referencia ao status fechada na fn_gerar_folha';
  end if;
end $$;

-- ============ 2) anon nunca recebe nada ============
revoke all on function public.fn_guarda_status_folha() from public;

-- ============ 3a) trava de EXECUTE das funcoes novas ============
do $$
declare v_ruim text;
begin
  -- proacl nulo = default do create function = PUBLIC com EXECUTE.
  -- aclexplode(null) nao retorna linha, por isso esse caso vem antes e separado.
  select string_agg(p.proname, ', ' order by p.proname) into v_ruim
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('fn_aprovar_folha','fn_desaprovar_folha','fn_guarda_status_folha')
    and p.proacl is null;
  if v_ruim is not null then
    raise exception 'EXECUTE no default (PUBLIC/anon) em: %', v_ruim;
  end if;

  -- Nenhum EXECUTE fora de postgres/authenticated.
  select string_agg(format('%s -> %s', x.proname, x.papel), ', ') into v_ruim
  from (
    select p.proname,
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as papel
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname in ('fn_aprovar_folha','fn_desaprovar_folha','fn_guarda_status_folha')
      and a.privilege_type = 'EXECUTE'
  ) x
  where x.papel not in ('postgres','authenticated');
  if v_ruim is not null then
    raise exception 'EXECUTE indevido: %', v_ruim;
  end if;

  -- A guarda e trigger: nao deve ter EXECUTE nem para authenticated.
  select string_agg(x.papel, ', ') into v_ruim
  from (
    select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as papel
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) a
    where n.nspname = 'public' and p.proname = 'fn_guarda_status_folha'
      and a.privilege_type = 'EXECUTE'
  ) x
  where x.papel <> 'postgres';
  if v_ruim is not null then
    raise exception 'fn_guarda_status_folha com EXECUTE fora do postgres: %', v_ruim;
  end if;
end $$;

-- ============ 3b) travas de PRESENCA do seed ============
-- As travas da migration folha_permissao_aprovar so contavam vazamento e
-- estouravam com > 0: um insert que casasse zero linha (perfil renomeado, ou
-- 'rh.folha' digitado errado nos dois lugares) comitaria com nada semeado.
do $$
declare v_falta text;
begin
  -- Precisa existir Admin ativo, senao as assercoes abaixo passam por vacuidade.
  if not exists (
    select 1 from public.usuarios u
    join public.perfis p on p.id = u.perfil_id
    where p.nome = 'Admin' and u.excluido_em is null
  ) then
    raise exception 'Nenhum usuario Admin ativo: ninguem poderia aprovar folha';
  end if;

  -- Template: Admin tem as duas acoes.
  select string_agg(a.acao, ', ') into v_falta
  from (values ('aprovar'),('desaprovar')) as a(acao)
  where not exists (
    select 1 from public.perfil_permissoes pp
    join public.perfis p on p.id = pp.perfil_id
    where p.nome = 'Admin' and pp.recurso = 'rh.folha' and pp.acao = a.acao
  );
  if v_falta is not null then
    raise exception 'perfil_permissoes: Admin sem % em rh.folha', v_falta;
  end if;

  -- Efetiva (a unica que tem_permissao le): todo usuario Admin tem as duas.
  select string_agg(format('%s sem %s', u.nome, a.acao), '; ') into v_falta
  from public.usuarios u
  join public.perfis p on p.id = u.perfil_id
  cross join (values ('aprovar'),('desaprovar')) as a(acao)
  where p.nome = 'Admin' and u.excluido_em is null
    and not exists (
      select 1 from public.usuario_permissoes up
      where up.usuario_id = u.id and up.recurso = 'rh.folha' and up.acao = a.acao
    );
  if v_falta is not null then
    raise exception 'usuario_permissoes: %', v_falta;
  end if;

  -- Mantem a trava de excesso das migrations anteriores (fail-closed nos dois sentidos).
  if exists (
    select 1 from public.perfil_permissoes pp
    join public.perfis p on p.id = pp.perfil_id
    where pp.recurso = 'rh.folha' and pp.acao in ('aprovar','desaprovar') and p.nome <> 'Admin'
  ) then
    raise exception 'aprovar/desaprovar de rh.folha vazou para perfil fora do Admin';
  end if;
  if exists (
    select 1 from public.usuario_permissoes up
    join public.usuarios u on u.id = up.usuario_id
    left join public.perfis p on p.id = u.perfil_id
    where up.recurso = 'rh.folha' and up.acao in ('aprovar','desaprovar')
      and coalesce(p.nome,'') <> 'Admin'
  ) then
    raise exception 'aprovar/desaprovar de rh.folha vazou para usuario fora do Admin';
  end if;
end $$;
