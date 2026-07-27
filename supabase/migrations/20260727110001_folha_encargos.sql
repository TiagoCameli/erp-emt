-- Cadastro de encargos da folha (INSS patronal, FGTS, RAT, Terceiros ...) — Bloco 6.
-- A folha passa a discriminar os encargos em vez de aplicar um % unico; esta tabela e a
-- config editavel onde o Tiago cadastra cada encargo e sua aliquota. NENHUMA aliquota e
-- semeada aqui — o cadastro nasce vazio e o Tiago cadastra depois.
--
-- Espelha o cadastro-modelo vivo public.jornadas / public.funcoes (lidos via MCP 2026-07-27):
--   RLS on; 3 policies (select/insert/update) gated por tem_permissao(recurso, acao);
--   grants explicitos so ao authenticated (select/insert/update — SEM delete; anon sem DML);
--   triggers genericos fn_audit / fn_set_created_by / fn_set_updated_at;
--   exclusao (soft delete) via lixeira em public.fn_excluir_cadastro(p_tabela,p_id,p_motivo),
--   que resolve o recurso por public.fn_recurso_do_cadastro(p_tabela) — por isso NAO ha policy
--   nem grant de DELETE, e a fn de mapeamento passa a conhecer 'folha_encargos'.
-- Permissao do cadastro: recurso rh.encargos (registrado em config/recursos.ts nesta task).
--
-- Rollback:
--   drop table if exists public.folha_encargos;
--   -- e recriar public.fn_recurso_do_cadastro removendo a linha
--   --   when 'folha_encargos' then 'rh.encargos'.

create table public.folha_encargos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  percentual  numeric(6,3) not null check (percentual >= 0 and percentual <= 100),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);

alter table public.folha_encargos enable row level security;

-- Policies espelhando jornadas/funcoes (troca so o recurso p/ rh.encargos).
create policy folha_encargos_select on public.folha_encargos
  for select to authenticated
  using ((select public.tem_permissao('rh.encargos', 'ver')));

create policy folha_encargos_insert on public.folha_encargos
  for insert to authenticated
  with check ((select public.tem_permissao('rh.encargos', 'criar')));

create policy folha_encargos_update on public.folha_encargos
  for update to authenticated
  using ((select public.tem_permissao('rh.encargos', 'editar')))
  with check ((select public.tem_permissao('rh.encargos', 'editar')));

-- Grants explicitos: authenticated so do que as policies permitem; SEM delete; anon sem DML.
grant select, insert, update on public.folha_encargos to authenticated;

-- Triggers genericos (iguais ao modelo).
create trigger trg_audit_folha_encargos
  after insert or update or delete on public.folha_encargos
  for each row execute function public.fn_audit();

create trigger trg_set_created_by
  before insert on public.folha_encargos
  for each row execute function public.fn_set_created_by();

create trigger trg_folha_encargos_updated_at
  before update on public.folha_encargos
  for each row execute function public.fn_set_updated_at();

-- Soft delete via lixeira: mapear a nova tabela ao recurso no dispatcher de cadastros.
-- public.fn_excluir_cadastro e public.fn_restaurar_cadastro resolvem o recurso por esta fn;
-- estende-se o CASE existente (create or replace) para aceitar 'folha_encargos',
-- preservando TODOS os cases ja existentes (lidos do vivo em 2026-07-27).
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
    when 'jornadas'          then 'cadastros.jornadas'
    when 'folha_encargos'    then 'rh.encargos'
    else null
  end;
$function$;

-- SEM seed de aliquota: o Tiago cadastra cada encargo e sua taxa depois.
