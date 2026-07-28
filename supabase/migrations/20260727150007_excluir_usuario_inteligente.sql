-- Excluir usuário "inteligente" (regra do Tiago):
--  - Usuário que NUNCA fez nada no app (0 registros em audit_log): apaga de
--    vez. A função só sinaliza (return true); a Server Action apaga o auth.user
--    via admin API, que cascateia public.usuarios, permissões e provisória.
--  - Usuário que JÁ fez ações: vira "tombstone" — mantém só id + nome para o
--    histórico ("quem fez o quê") não quebrar; email vira null, perfil e
--    permissões saem, e é marcado como excluído/inativo.
--
-- email passa a aceitar null (o tombstone guarda só id + nome).

alter table public.usuarios alter column email drop not null;

-- Muda o tipo de retorno (void -> boolean), então drop + create.
drop function if exists public.fn_excluir_usuario(uuid);

create function public.fn_excluir_usuario(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tem_atividade boolean;
begin
  if not public.tem_permissao('administracao.usuarios', 'excluir') then
    raise exception 'Sem permissao para excluir usuarios';
  end if;
  if p_id = (select auth.uid()) then
    raise exception 'Voce nao pode excluir a sua propria conta';
  end if;

  v_tem_atividade := exists (
    select 1 from public.audit_log a where a.usuario_id = p_id
  );

  -- Permissoes e senha provisoria saem em qualquer caso.
  delete from public.usuario_permissoes where usuario_id = p_id;
  delete from public.usuario_senha_provisoria where usuario_id = p_id;

  -- Marca como excluido. Se fez acoes, guarda so id+nome (email=null =
  -- tombstone). Se nao fez, deixa o registro pro caller apagar de vez.
  update public.usuarios
    set excluido_em = coalesce(excluido_em, now()),
        excluido_por = (select auth.uid()),
        ativo = false,
        perfil_id = null,
        email = case when v_tem_atividade then null else email end
    where id = p_id;

  -- true => sem atividade => o caller apaga o auth.user (cascateia o resto).
  return not v_tem_atividade;
end $$;

revoke all on function public.fn_excluir_usuario(uuid) from public, anon;
grant execute on function public.fn_excluir_usuario(uuid) to authenticated;
