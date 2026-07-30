-- Cada pessoa arruma as tabelas do jeito dela, e isso segue ela em qualquer
-- maquina.
--
-- Antes a preferencia (colunas visiveis, ordem, larguras) ficava no localStorage.
-- Era individual e invisivel para os outros, mas morria ao trocar de navegador,
-- limpar cache ou usar outro perfil do Chrome. Com 20 a 30 pessoas e maquina
-- compartilhada no escritorio, isso significa reconfigurar toda hora.
--
-- Escrita passa por SECURITY DEFINER como todo o resto do projeto; a tabela
-- recebe grant so de SELECT, e a policy limita ao proprio usuario.

create table if not exists public.preferencias_tabela (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  tabela text not null,
  preferencia jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (usuario_id, tabela)
);

comment on table public.preferencias_tabela is
  'Como cada pessoa arrumou cada tabela: colunas visiveis, ordem, larguras e filtros visiveis. Uma linha por usuario e por tabela. Ninguem ve nem muda a do outro.';

alter table public.preferencias_tabela enable row level security;

drop policy if exists preferencias_tabela_select on public.preferencias_tabela;
create policy preferencias_tabela_select
  on public.preferencias_tabela for select
  to authenticated
  using (usuario_id = (select auth.uid()));

revoke all on table public.preferencias_tabela from anon, authenticated;
grant select on table public.preferencias_tabela to authenticated;

create or replace function public.fn_salvar_preferencia_tabela(
  p_tabela text,
  p_preferencia jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Sem sessao';
  end if;
  if coalesce(btrim(p_tabela), '') = '' then
    raise exception 'Informe a tabela';
  end if;
  if p_preferencia is null or jsonb_typeof(p_preferencia) <> 'object' then
    raise exception 'Preferencia invalida';
  end if;
  -- Teto de tamanho: preferencia e' um punhado de ids e numeros. Qualquer coisa
  -- perto disso e' bug ou abuso, nao configuracao de tela.
  if length(p_preferencia::text) > 20000 then
    raise exception 'Preferencia grande demais';
  end if;

  insert into public.preferencias_tabela (usuario_id, tabela, preferencia)
  values (v_uid, btrim(p_tabela), p_preferencia)
  on conflict (usuario_id, tabela)
  do update set preferencia = excluded.preferencia, updated_at = now();
end;
$$;

revoke all on function public.fn_salvar_preferencia_tabela(text, jsonb) from public;
grant execute on function public.fn_salvar_preferencia_tabela(text, jsonb) to authenticated;

create or replace function public.fn_limpar_preferencia_tabela(p_tabela text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Sem sessao'; end if;
  delete from public.preferencias_tabela
  where usuario_id = v_uid and tabela = btrim(p_tabela);
end;
$$;

revoke all on function public.fn_limpar_preferencia_tabela(text) from public;
grant execute on function public.fn_limpar_preferencia_tabela(text) to authenticated;

notify pgrst, 'reload schema';
