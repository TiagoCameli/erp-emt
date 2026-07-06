-- Trava anti-lockout no aplicar_perfil (achado M1 da varredura 06/07/2026).
-- salvar_matriz_usuario ja impede o editor de remover a propria permissao de
-- editar usuarios, mas aplicar_perfil nao tinha a mesma trava: um admin podia
-- aplicar em si mesmo um perfil sem administracao.usuarios/editar e travar a
-- administracao inteira (grave com admin unico). Mesmo padrao da trava da
-- migration 20260612120001.

create or replace function public.aplicar_perfil(p_usuario_id uuid, p_perfil_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('administracao.usuarios', 'editar') then
    raise exception 'Sem permissao para editar permissoes de usuarios';
  end if;

  -- Trava de auto-lockout: quem aplica um perfil em si mesmo nao pode
  -- perder a propria permissao de editar usuarios.
  if p_usuario_id = (select auth.uid()) and not exists (
    select 1 from public.perfil_permissoes pp
    where pp.perfil_id = p_perfil_id
      and pp.recurso = 'administracao.usuarios'
      and pp.acao = 'editar'
  ) then
    raise exception 'Voce nao pode aplicar em si mesmo um perfil sem a permissao de editar usuarios';
  end if;

  delete from public.usuario_permissoes where usuario_id = p_usuario_id;

  insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
  select p_usuario_id, pp.recurso, pp.acao, (select auth.uid())
  from public.perfil_permissoes pp
  where pp.perfil_id = p_perfil_id;

  update public.usuarios set perfil_id = p_perfil_id where id = p_usuario_id;
end $$;
