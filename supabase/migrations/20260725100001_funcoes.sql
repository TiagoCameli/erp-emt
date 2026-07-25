-- Cadastro de funcoes (cargos) com salario base e CBO — FASE EXPAND do Bloco 3.
-- Espelha o cadastro-modelo vivo public.unidades_medida (lido via MCP em 2026-07-25):
--   RLS on; 3 policies (select/insert/update) gated por tem_permissao(recurso, acao);
--   grants explicitos so ao authenticated (select/insert/update — SEM delete; anon sem DML);
--   triggers genericos fn_audit / fn_set_created_by / fn_set_updated_at;
--   exclusao (soft delete) e via lixeira em public.fn_excluir_cadastro(p_tabela,p_id,p_motivo),
--   que resolve o recurso por public.fn_recurso_do_cadastro(p_tabela) — por isso NAO ha policy
--   nem grant de DELETE, e a fn de mapeamento precisa passar a conhecer 'funcoes'.
--
-- Rollback:
--   drop table if exists public.funcoes;
--   -- e recriar public.fn_recurso_do_cadastro removendo a linha when 'funcoes' then 'cadastros.funcoes'.

create table public.funcoes (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null unique,
  salario_base numeric(14,2),
  cbo          text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid
);

alter table public.funcoes enable row level security;

-- Policies espelhando unidades_medida (troca so o recurso p/ cadastros.funcoes).
create policy funcoes_select on public.funcoes
  for select to authenticated
  using ((select public.tem_permissao('cadastros.funcoes', 'ver')));

create policy funcoes_insert on public.funcoes
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.funcoes', 'criar')));

create policy funcoes_update on public.funcoes
  for update to authenticated
  using ((select public.tem_permissao('cadastros.funcoes', 'editar')))
  with check ((select public.tem_permissao('cadastros.funcoes', 'editar')));

-- Grants explicitos: authenticated so do que as policies permitem; SEM delete; anon sem DML.
grant select, insert, update on public.funcoes to authenticated;

-- Triggers genericos (iguais ao modelo).
create trigger trg_audit_funcoes
  after insert or update or delete on public.funcoes
  for each row execute function public.fn_audit();

create trigger trg_set_created_by
  before insert on public.funcoes
  for each row execute function public.fn_set_created_by();

create trigger trg_funcoes_updated_at
  before update on public.funcoes
  for each row execute function public.fn_set_updated_at();

-- Soft delete via lixeira: mapear a nova tabela ao recurso no dispatcher de cadastros.
-- public.fn_excluir_cadastro e public.fn_restaurar_cadastro resolvem o recurso por esta fn,
-- entao estende-se o CASE existente (create or replace) para aceitar 'funcoes'.
create or replace function public.fn_recurso_do_cadastro(p_tabela text)
  returns text
  language sql
  immutable
  set search_path to ''
as $function$
  select case p_tabela
    when 'unidades_medida'   then 'cadastros.unidades'
    when 'categorias_insumo' then 'cadastros.categorias'
    when 'clientes'          then 'cadastros.clientes'
    when 'fornecedores'      then 'cadastros.fornecedores'
    when 'insumos'           then 'cadastros.insumos'
    when 'colaboradores'     then 'cadastros.colaboradores'
    when 'funcoes'           then 'cadastros.funcoes'
    else null
  end;
$function$;
