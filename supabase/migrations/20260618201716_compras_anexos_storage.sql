-- =============================================================
-- Fase 2 / Migration 16: anexos + Storage
-- Tabela generica de anexos (tabela + registro_id) e bucket privado.
-- A RLS da tabela espelha a permissao da aba de origem; o bucket so e
-- acessivel a autenticados, e o download usa signed URL gerada no server.
-- As policies do Storage tambem checam a permissao por aba derivada do
-- path (tabela/registro_id/uuid), pra fechar o objeto, nao so a linha.
-- =============================================================

create or replace function public.fn_recurso_do_anexo(p_tabela text)
returns text language sql immutable set search_path = '' as $$
  select case p_tabela
    when 'pedidos'       then 'compras.pedidos'
    when 'cotacoes'      then 'compras.cotacoes'
    when 'ordens_compra' then 'compras.ordens'
    when 'recebimentos'  then 'compras.recebimentos'
    else null
  end;
$$;
revoke all on function public.fn_recurso_do_anexo(text) from public, anon, authenticated;
grant execute on function public.fn_recurso_do_anexo(text) to authenticated;

-- Recurso de compras derivado do primeiro segmento do path no Storage
-- (formato tabela/registro_id/uuid). Null se o path nao casar com o padrao
-- ou a tabela nao for de compras. Usada pelas policies de storage.objects.
create or replace function public.fn_recurso_do_path_anexo(p_path text)
returns text language sql immutable set search_path = '' as $$
  select public.fn_recurso_do_anexo(split_part(p_path, '/', 1));
$$;
revoke all on function public.fn_recurso_do_path_anexo(text) from public, anon, authenticated;
grant execute on function public.fn_recurso_do_path_anexo(text) to authenticated;

create table public.anexos (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid not null,
  nome_arquivo text not null,
  path_storage text not null unique,
  tipo_mime text,
  tamanho_bytes bigint,
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.anexos is 'Anexos genericos (NF, documentos). Vinculados a um registro por tabela + registro_id. Arquivo no bucket Storage anexos.';
create index idx_anexos_registro on public.anexos (tabela, registro_id);

create trigger trg_audit_anexos after insert or update or delete on public.anexos for each row execute function public.fn_audit();

alter table public.anexos enable row level security;
create policy anexos_select on public.anexos
  for select to authenticated
  using ((select public.tem_permissao(public.fn_recurso_do_anexo(tabela), 'ver')));
create policy anexos_insert on public.anexos
  for insert to authenticated
  with check (
    public.fn_recurso_do_anexo(tabela) is not null and (
      (select public.tem_permissao(public.fn_recurso_do_anexo(tabela), 'criar'))
      or (select public.tem_permissao(public.fn_recurso_do_anexo(tabela), 'editar'))
    )
  );
create policy anexos_delete on public.anexos
  for delete to authenticated
  using ((select public.tem_permissao(public.fn_recurso_do_anexo(tabela), 'editar')));
grant select, insert, delete on table public.anexos to authenticated;

-- Bucket privado de anexos
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

-- Policies do Storage: derivam o recurso de compras do path (tabela/...) e
-- exigem a permissao da aba, igual a RLS da tabela anexos. Fecha o objeto,
-- nao so a linha de metadados. select/delete exigem ver; insert exige criar
-- ou editar (mesma regra do insert da tabela anexos). O download sai por
-- signed URL gerada no servidor.
create policy "anexos storage select" on storage.objects
  for select to authenticated using (
    bucket_id = 'anexos'
    and (select public.tem_permissao(public.fn_recurso_do_path_anexo(name), 'ver'))
  );
create policy "anexos storage insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'anexos'
    and public.fn_recurso_do_path_anexo(name) is not null
    and (
      (select public.tem_permissao(public.fn_recurso_do_path_anexo(name), 'criar'))
      or (select public.tem_permissao(public.fn_recurso_do_path_anexo(name), 'editar'))
    )
  );
create policy "anexos storage delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'anexos'
    and (select public.tem_permissao(public.fn_recurso_do_path_anexo(name), 'editar'))
  );
