-- Anexos com arquivo unico e vinculos por documento.
--
-- Antes: uma tabela `anexos` com (tabela, registro_id, path). O binario existia
-- uma vez por documento e a permissao do Storage vinha do PRIMEIRO PEDACO DO
-- PATH (fn_recurso_do_path_anexo). Isso impede arquivo compartilhado: o objeto
-- ficaria sob 'cotacoes/' mas precisa ser visivel para quem ve a OC.
--
-- Agora: `arquivos` (um registro por binario, com hash para dedup) e
-- `anexo_vinculos` (liga arquivo a documento). O path passa a ser neutro e a
-- permissao vem SEMPRE do vinculo, nunca do caminho.

create or replace function public.fn_recurso_da_entidade(p_tipo text)
returns text language sql immutable set search_path to '' as $function$
  select case p_tipo
    when 'cotacao'        then 'compras.cotacoes'
    when 'ordem_compra'   then 'compras.ordens'
    when 'lancamento'     then 'financeiro.lancamentos'
    when 'pagamento'      then 'financeiro.pagamentos'
    when 'rh_documento'   then 'rh.documentos'
    when 'rh_epi'         then 'rh.epis'
    when 'rh_ocorrencia'  then 'rh.ocorrencias'
    else null
  end;
$function$;

comment on function public.fn_recurso_da_entidade(text) is
  'Recurso de permissao dono dos anexos de um tipo de entidade. Fonte unica: RLS e funcoes derivam a permissao daqui.';

create table if not exists public.arquivos (
  id uuid primary key default gen_random_uuid(),
  path_storage text not null unique,
  nome_original text not null,
  tipo_mime text,
  tamanho_bytes bigint not null,
  hash_sha256 text,
  orfao_em timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint arquivos_tamanho_positivo check (tamanho_bytes >= 0)
);

comment on table public.arquivos is
  'Um registro por arquivo fisico no bucket. Dedup por (hash_sha256, tamanho_bytes): o binario existe UMA vez.';

create unique index if not exists arquivos_hash_tamanho_unico
  on public.arquivos (hash_sha256, tamanho_bytes) where hash_sha256 is not null;
create index if not exists idx_arquivos_orfao_em
  on public.arquivos (orfao_em) where orfao_em is not null;

create table if not exists public.anexo_vinculos (
  id uuid primary key default gen_random_uuid(),
  arquivo_id uuid not null references public.arquivos (id) on delete cascade,
  entidade_tipo text not null,
  entidade_id uuid not null,
  origem text not null default 'upload_direto',
  vinculo_origem_id uuid references public.anexo_vinculos (id) on delete set null,
  nome_exibicao text,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint anexo_vinculos_unico unique (arquivo_id, entidade_tipo, entidade_id),
  constraint anexo_vinculos_origem_valida check (origem in ('upload_direto', 'propagado')),
  constraint anexo_vinculos_tipo_valido check (public.fn_recurso_da_entidade(entidade_tipo) is not null)
);

comment on table public.anexo_vinculos is
  'Liga um arquivo a um documento (cotacao, ordem_compra, lancamento, pagamento e os registros de RH). Escrita so pelas funcoes definer.';

create index if not exists idx_anexo_vinculos_entidade on public.anexo_vinculos (entidade_tipo, entidade_id);
create index if not exists idx_anexo_vinculos_arquivo on public.anexo_vinculos (arquivo_id);
create index if not exists idx_anexo_vinculos_origem on public.anexo_vinculos (vinculo_origem_id) where vinculo_origem_id is not null;

alter table public.arquivos enable row level security;
alter table public.anexo_vinculos enable row level security;

drop policy if exists anexo_vinculos_select on public.anexo_vinculos;
create policy anexo_vinculos_select on public.anexo_vinculos
  for select using ((select public.tem_permissao(public.fn_recurso_da_entidade(entidade_tipo), 'ver')));

drop policy if exists arquivos_select on public.arquivos;
create policy arquivos_select on public.arquivos
  for select using (
    exists (
      select 1 from public.anexo_vinculos v
      where v.arquivo_id = arquivos.id
        and (select public.tem_permissao(public.fn_recurso_da_entidade(v.entidade_tipo), 'ver'))
    )
  );

revoke all on table public.arquivos from anon;
revoke all on table public.arquivos from authenticated;
grant select on table public.arquivos to authenticated;
revoke all on table public.anexo_vinculos from anon;
revoke all on table public.anexo_vinculos from authenticated;
grant select on table public.anexo_vinculos to authenticated;

drop trigger if exists trg_audit_arquivos on public.arquivos;
create trigger trg_audit_arquivos after insert or update or delete on public.arquivos
  for each row execute function public.fn_audit();
drop trigger if exists trg_audit_anexo_vinculos on public.anexo_vinculos;
create trigger trg_audit_anexo_vinculos after insert or update or delete on public.anexo_vinculos
  for each row execute function public.fn_audit();
drop trigger if exists trg_set_created_by on public.arquivos;
create trigger trg_set_created_by before insert on public.arquivos
  for each row execute function public.fn_set_created_by();
drop trigger if exists trg_set_created_by on public.anexo_vinculos;
create trigger trg_set_created_by before insert on public.anexo_vinculos
  for each row execute function public.fn_set_created_by();

-- Migracao dos anexos existentes: 1 arquivo + 1 vinculo por linha.
do $migracao$
declare v_linha record; v_arquivo uuid; v_tipo text;
begin
  for v_linha in select * from public.anexos order by created_at loop
    v_tipo := case v_linha.tabela
      when 'cotacoes' then 'cotacao' when 'ordens_compra' then 'ordem_compra'
      when 'rh_documentos' then 'rh_documento' when 'rh_epis' then 'rh_epi'
      when 'rh_ocorrencias' then 'rh_ocorrencia' else null end;
    if v_tipo is null then
      raise exception 'Anexo % com tabela desconhecida: %', v_linha.id, v_linha.tabela;
    end if;

    select id into v_arquivo from public.arquivos where path_storage = v_linha.path_storage;
    if v_arquivo is null then
      insert into public.arquivos (path_storage, nome_original, tipo_mime, tamanho_bytes, created_at, created_by)
      values (v_linha.path_storage, v_linha.nome_arquivo, v_linha.tipo_mime,
              coalesce(v_linha.tamanho_bytes, 0), v_linha.created_at, v_linha.created_by)
      returning id into v_arquivo;
    end if;

    insert into public.anexo_vinculos (arquivo_id, entidade_tipo, entidade_id, origem, nome_exibicao, created_at, created_by)
    values (v_arquivo, v_tipo, v_linha.registro_id, 'upload_direto', v_linha.nome_arquivo, v_linha.created_at, v_linha.created_by)
    on conflict (arquivo_id, entidade_tipo, entidade_id) do nothing;
  end loop;
end $migracao$;
