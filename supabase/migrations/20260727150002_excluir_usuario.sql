-- =============================================================
-- Excluir usuario (soft delete). Some da lista de usuarios e perde
-- acesso, mas o registro fica no banco: o nome continua sendo
-- resolvido nas acoes/auditoria que ele fez (nomes_usuarios_auditoria
-- le usuarios pelo id, sem filtrar ativo/excluido), e as FKs de outras
-- tabelas (aprovado_por, pago_por, created_by...) continuam validas.
-- =============================================================

alter table public.usuarios
  add column excluido_em timestamptz,
  add column excluido_por uuid references public.usuarios(id);

comment on column public.usuarios.excluido_em is
  'Soft delete: quando nao nulo, o usuario foi excluido (some da lista, sem acesso). O registro fica para resolver o nome no historico/auditoria.';

create index idx_usuarios_excluido_em on public.usuarios (excluido_em);

-- fn_excluir_usuario: soft delete com checagem da permissao 'excluir' e
-- trava anti-autoexclusao. Marca as colunas, corta o acesso (ativo=false)
-- e apaga a senha provisoria se houver. O ban na auth e feito na action.
create or replace function public.fn_excluir_usuario(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('administracao.usuarios', 'excluir') then
    raise exception 'Sem permissao para excluir usuarios';
  end if;

  if p_id = (select auth.uid()) then
    raise exception 'Voce nao pode excluir a sua propria conta';
  end if;

  update public.usuarios
    set excluido_em = now(),
        excluido_por = (select auth.uid()),
        ativo = false
    where id = p_id
      and excluido_em is null;

  delete from public.usuario_senha_provisoria where usuario_id = p_id;
end $$;

revoke all on function public.fn_excluir_usuario(uuid) from public, anon;
grant execute on function public.fn_excluir_usuario(uuid) to authenticated;
