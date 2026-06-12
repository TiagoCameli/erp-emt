-- =============================================================
-- Fase 0 / Migration 6: correcoes da revisao adversarial
-- 1. salvar_matriz_usuario: delete+insert atomico + trava de
--    auto-lockout (admin nao remove a propria permissao de editar)
-- 2. salvar_permissoes_perfil: delete+insert atomico
-- 3. nomes_usuarios_auditoria: nomes pra quem ve auditoria/lixeira
--    sem depender da permissao administracao.usuarios ver
-- 4. tabelas_auditadas: distinct no banco (sem cap de 1000 linhas)
-- 5. fn_audit: registro_id cai pra 'chave' quando nao ha 'id'
-- 6. proximo_numero_documento: sem execute direto por authenticated
-- 7. seeds: remove acoes do Admin fora do catalogo
-- =============================================================

-- 1. Matriz do usuario numa transacao so, com trava de lockout
create or replace function public.salvar_matriz_usuario(
  p_usuario_id uuid,
  p_permissoes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_editor uuid := (select auth.uid());
begin
  if not public.tem_permissao('administracao.usuarios', 'editar') then
    raise exception 'Sem permissao para editar permissoes de usuarios';
  end if;

  -- Trava de auto-lockout: quem edita a propria matriz nao pode
  -- remover a propria permissao de editar usuarios.
  if p_usuario_id = v_editor and not exists (
    select 1 from jsonb_array_elements(p_permissoes) par
    where par ->> 'recurso' = 'administracao.usuarios'
      and par ->> 'acao' = 'editar'
  ) then
    raise exception 'Voce nao pode remover sua propria permissao de editar usuarios';
  end if;

  delete from public.usuario_permissoes where usuario_id = p_usuario_id;

  insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
  select distinct p_usuario_id, par ->> 'recurso', par ->> 'acao', v_editor
  from jsonb_array_elements(p_permissoes) par
  where par ->> 'recurso' is not null
    and par ->> 'acao' in ('ver', 'criar', 'editar', 'excluir', 'aprovar', 'desaprovar');
end $$;

revoke all on function public.salvar_matriz_usuario(uuid, jsonb) from public, anon;
grant execute on function public.salvar_matriz_usuario(uuid, jsonb) to authenticated;

-- 2. Permissoes do perfil numa transacao so
create or replace function public.salvar_permissoes_perfil(
  p_perfil_id uuid,
  p_permissoes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('administracao.perfis', 'editar') then
    raise exception 'Sem permissao para editar perfis';
  end if;

  delete from public.perfil_permissoes where perfil_id = p_perfil_id;

  insert into public.perfil_permissoes (perfil_id, recurso, acao, created_by)
  select distinct p_perfil_id, par ->> 'recurso', par ->> 'acao', (select auth.uid())
  from jsonb_array_elements(p_permissoes) par
  where par ->> 'recurso' is not null
    and par ->> 'acao' in ('ver', 'criar', 'editar', 'excluir', 'aprovar', 'desaprovar');
end $$;

revoke all on function public.salvar_permissoes_perfil(uuid, jsonb) from public, anon;
grant execute on function public.salvar_permissoes_perfil(uuid, jsonb) to authenticated;

-- 3. Nomes de usuarios pra telas de auditoria e lixeira
create or replace function public.nomes_usuarios_auditoria(p_ids uuid[])
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.nome
  from public.usuarios u
  where u.id = any (p_ids)
    and (
      public.tem_permissao('administracao.auditoria', 'ver')
      or public.tem_permissao('administracao.lixeira', 'ver')
    );
$$;

revoke all on function public.nomes_usuarios_auditoria(uuid[]) from public, anon;
grant execute on function public.nomes_usuarios_auditoria(uuid[]) to authenticated;

-- 4. Tabelas distintas do audit_log direto no banco
create or replace function public.tabelas_auditadas()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.tabela
  from public.audit_log a
  where public.tem_permissao('administracao.auditoria', 'ver')
  order by 1;
$$;

revoke all on function public.tabelas_auditadas() from public, anon;
grant execute on function public.tabelas_auditadas() to authenticated;

-- 5. fn_audit: tabelas sem coluna id (configuracoes usa chave)
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registro jsonb;
begin
  v_registro := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  insert into public.audit_log (tabela, registro_id, acao, usuario_id, dados_antes, dados_depois)
  values (
    tg_table_name,
    coalesce(v_registro ->> 'id', v_registro ->> 'chave'),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- 6. Numeracao: sem chamada direta pela API; os modulos das fases
-- seguintes chamam por dentro das proprias funcoes security definer.
revoke execute on function public.proximo_numero_documento(text) from authenticated;

-- 7. Catalogo manda: configuracoes so tem ver e editar
delete from public.perfil_permissoes
where recurso = 'administracao.configuracoes' and acao in ('criar', 'excluir');

delete from public.usuario_permissoes
where recurso = 'administracao.configuracoes' and acao in ('criar', 'excluir');
