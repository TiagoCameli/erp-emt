-- Cadastro de jornadas de trabalho (horas por dia da semana) — Bloco 4 (jornada/escala).
-- Espelha o cadastro-modelo vivo public.funcoes (Bloco 3, ja em producao; lido via MCP 2026-07-25),
-- que por sua vez e a copia de public.unidades_medida:
--   RLS on; 3 policies (select/insert/update) gated por tem_permissao(recurso, acao);
--   grants explicitos so ao authenticated (select/insert/update — SEM delete; anon sem DML);
--   triggers genericos fn_audit / fn_set_created_by / fn_set_updated_at;
--   exclusao (soft delete) e via lixeira em public.fn_excluir_cadastro(p_tabela,p_id,p_motivo),
--   que resolve o recurso por public.fn_recurso_do_cadastro(p_tabela) — por isso NAO ha policy
--   nem grant de DELETE, e a fn de mapeamento precisa passar a conhecer 'jornadas'.
--
-- Rollback:
--   drop table if exists public.jornadas;
--   -- e recriar public.fn_recurso_do_cadastro removendo a linha
--   --   when 'jornadas' then 'cadastros.jornadas'.

create table public.jornadas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null unique,
  horas_segunda  numeric(4,2) not null default 0 check (horas_segunda >= 0 and horas_segunda <= 24),
  horas_terca    numeric(4,2) not null default 0 check (horas_terca   >= 0 and horas_terca   <= 24),
  horas_quarta   numeric(4,2) not null default 0 check (horas_quarta  >= 0 and horas_quarta  <= 24),
  horas_quinta   numeric(4,2) not null default 0 check (horas_quinta  >= 0 and horas_quinta  <= 24),
  horas_sexta    numeric(4,2) not null default 0 check (horas_sexta   >= 0 and horas_sexta   <= 24),
  horas_sabado   numeric(4,2) not null default 0 check (horas_sabado  >= 0 and horas_sabado  <= 24),
  horas_domingo  numeric(4,2) not null default 0 check (horas_domingo >= 0 and horas_domingo <= 24),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid
);

alter table public.jornadas enable row level security;

-- Policies espelhando funcoes (troca so o recurso p/ cadastros.jornadas).
create policy jornadas_select on public.jornadas
  for select to authenticated
  using ((select public.tem_permissao('cadastros.jornadas', 'ver')));

create policy jornadas_insert on public.jornadas
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.jornadas', 'criar')));

create policy jornadas_update on public.jornadas
  for update to authenticated
  using ((select public.tem_permissao('cadastros.jornadas', 'editar')))
  with check ((select public.tem_permissao('cadastros.jornadas', 'editar')));

-- Grants explicitos: authenticated so do que as policies permitem; SEM delete; anon sem DML.
grant select, insert, update on public.jornadas to authenticated;

-- Triggers genericos (iguais ao modelo).
create trigger trg_audit_jornadas
  after insert or update or delete on public.jornadas
  for each row execute function public.fn_audit();

create trigger trg_set_created_by
  before insert on public.jornadas
  for each row execute function public.fn_set_created_by();

create trigger trg_jornadas_updated_at
  before update on public.jornadas
  for each row execute function public.fn_set_updated_at();

-- Soft delete via lixeira: mapear a nova tabela ao recurso no dispatcher de cadastros.
-- public.fn_excluir_cadastro e public.fn_restaurar_cadastro resolvem o recurso por esta fn,
-- entao estende-se o CASE existente (create or replace) para aceitar 'jornadas',
-- preservando TODOS os cases ja existentes.
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
    else null
  end;
$function$;

-- Seed da jornada padrao da EMT: seg-sex 8h, sabado 5h, domingo folga.
insert into public.jornadas
  (nome, horas_segunda, horas_terca, horas_quarta, horas_quinta, horas_sexta, horas_sabado, horas_domingo, ativo)
values
  ('Padrão EMT', 8, 8, 8, 8, 8, 5, 0, true)
on conflict (nome) do nothing;
