-- Config das faixas de INSS/IRRF + parametros da folha — Bloco 7 (holerite).
-- A folha vai calcular INSS/IRRF por faixa progressiva. Esta migration cria SO as
-- tabelas de config que o Tiago vai preencher; NENHUM valor fiscal (aliquota, faixa,
-- parcela, deducao, fgts) e semeado aqui — o cadastro nasce vazio.
--
-- Espelha o cadastro-modelo vivo public.folha_encargos (Bloco 6, que por sua vez copia
-- public.funcoes/jornadas; lido via MCP 2026-07-27):
--   RLS on; 3 policies (select/insert/update) gated por tem_permissao(recurso, acao);
--   grants explicitos so ao authenticated (select/insert/update — SEM delete; anon sem DML);
--   triggers genericos fn_audit / fn_set_created_by / fn_set_updated_at;
--   exclusao (soft delete) via lixeira em public.fn_excluir_cadastro(p_tabela,p_id,p_motivo),
--   que resolve o recurso por public.fn_recurso_do_cadastro(p_tabela) — por isso as FAIXAS
--   NAO tem policy nem grant de DELETE, e a fn de mapeamento passa a conhecer as duas.
-- Permissao de todas as tres tabelas: recurso rh.parametros-folha
-- (registrado em config/recursos.ts e semeado em _perm_parametros_folha.sql nesta task).
--
-- folha_parametros e SINGLETON (config de 1 linha, id fixo = 1 travado por check + PK).
-- NAO e cadastro: sem soft delete, fora do dispatcher fn_recurso_do_cadastro. A tela de
-- parametros faz UPSERT da unica linha, por isso ha policy/grant de INSERT (1a vez) e
-- UPDATE — ambas gateadas por 'editar' (nao ha "criar" numa config singular) — e SEM
-- DELETE. Nenhuma linha e inserida aqui: nasce vazia e o Tiago salva os parametros depois.
--
-- Rollback:
--   drop table if exists public.folha_parametros;
--   drop table if exists public.folha_irrf_faixas;
--   drop table if exists public.folha_inss_faixas;
--   -- e recriar public.fn_recurso_do_cadastro removendo as duas linhas
--   --   when 'folha_inss_faixas' then 'rh.parametros-folha'
--   --   when 'folha_irrf_faixas' then 'rh.parametros-folha'.

-- =========================================================================
-- 1) folha_inss_faixas — faixas progressivas do INSS (limite + aliquota).
-- =========================================================================
create table public.folha_inss_faixas (
  id          uuid primary key default gen_random_uuid(),
  limite_ate  numeric(14,2) not null check (limite_ate >= 0),
  aliquota    numeric(6,3) not null check (aliquota >= 0 and aliquota <= 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);

alter table public.folha_inss_faixas enable row level security;

create policy folha_inss_faixas_select on public.folha_inss_faixas
  for select to authenticated
  using ((select public.tem_permissao('rh.parametros-folha', 'ver')));

create policy folha_inss_faixas_insert on public.folha_inss_faixas
  for insert to authenticated
  with check ((select public.tem_permissao('rh.parametros-folha', 'criar')));

create policy folha_inss_faixas_update on public.folha_inss_faixas
  for update to authenticated
  using ((select public.tem_permissao('rh.parametros-folha', 'editar')))
  with check ((select public.tem_permissao('rh.parametros-folha', 'editar')));

-- Grants explicitos: authenticated so do que as policies permitem; SEM delete; anon sem DML.
grant select, insert, update on public.folha_inss_faixas to authenticated;

create trigger trg_audit_folha_inss_faixas
  after insert or update or delete on public.folha_inss_faixas
  for each row execute function public.fn_audit();

create trigger trg_set_created_by
  before insert on public.folha_inss_faixas
  for each row execute function public.fn_set_created_by();

create trigger trg_folha_inss_faixas_updated_at
  before update on public.folha_inss_faixas
  for each row execute function public.fn_set_updated_at();

-- =========================================================================
-- 2) folha_irrf_faixas — faixas progressivas do IRRF (limite + aliquota + parcela a deduzir).
-- =========================================================================
create table public.folha_irrf_faixas (
  id              uuid primary key default gen_random_uuid(),
  limite_ate      numeric(14,2) not null check (limite_ate >= 0),
  aliquota        numeric(6,3) not null check (aliquota >= 0 and aliquota <= 100),
  parcela_deduzir numeric(14,2) not null check (parcela_deduzir >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid
);

alter table public.folha_irrf_faixas enable row level security;

create policy folha_irrf_faixas_select on public.folha_irrf_faixas
  for select to authenticated
  using ((select public.tem_permissao('rh.parametros-folha', 'ver')));

create policy folha_irrf_faixas_insert on public.folha_irrf_faixas
  for insert to authenticated
  with check ((select public.tem_permissao('rh.parametros-folha', 'criar')));

create policy folha_irrf_faixas_update on public.folha_irrf_faixas
  for update to authenticated
  using ((select public.tem_permissao('rh.parametros-folha', 'editar')))
  with check ((select public.tem_permissao('rh.parametros-folha', 'editar')));

grant select, insert, update on public.folha_irrf_faixas to authenticated;

create trigger trg_audit_folha_irrf_faixas
  after insert or update or delete on public.folha_irrf_faixas
  for each row execute function public.fn_audit();

create trigger trg_set_created_by
  before insert on public.folha_irrf_faixas
  for each row execute function public.fn_set_created_by();

create trigger trg_folha_irrf_faixas_updated_at
  before update on public.folha_irrf_faixas
  for each row execute function public.fn_set_updated_at();

-- =========================================================================
-- 3) folha_parametros — SINGLETON de parametros da folha (1 linha, id travado = 1).
--    Sem soft delete (nao e cadastro); UPSERT gateado por 'editar'.
-- =========================================================================
create table public.folha_parametros (
  id                           smallint primary key default 1 check (id = 1),
  irrf_deducao_por_dependente  numeric(14,2) not null default 0 check (irrf_deducao_por_dependente >= 0),
  irrf_desconto_simplificado   numeric(14,2) not null default 0 check (irrf_desconto_simplificado >= 0),
  fgts_percentual              numeric(6,3) not null default 0 check (fgts_percentual >= 0 and fgts_percentual <= 100),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  created_by                   uuid
);

alter table public.folha_parametros enable row level security;

create policy folha_parametros_select on public.folha_parametros
  for select to authenticated
  using ((select public.tem_permissao('rh.parametros-folha', 'ver')));

-- INSERT so pra criar a 1a (e unica) linha; gateado por 'editar' (upsert da config).
create policy folha_parametros_insert on public.folha_parametros
  for insert to authenticated
  with check ((select public.tem_permissao('rh.parametros-folha', 'editar')));

create policy folha_parametros_update on public.folha_parametros
  for update to authenticated
  using ((select public.tem_permissao('rh.parametros-folha', 'editar')))
  with check ((select public.tem_permissao('rh.parametros-folha', 'editar')));

-- Grants: authenticated select/insert/update (SEM delete); anon sem DML.
grant select, insert, update on public.folha_parametros to authenticated;

create trigger trg_audit_folha_parametros
  after insert or update or delete on public.folha_parametros
  for each row execute function public.fn_audit();

create trigger trg_set_created_by
  before insert on public.folha_parametros
  for each row execute function public.fn_set_created_by();

create trigger trg_folha_parametros_updated_at
  before update on public.folha_parametros
  for each row execute function public.fn_set_updated_at();

-- =========================================================================
-- 4) Soft delete das FAIXAS via lixeira: mapear as duas novas tabelas ao recurso
--    no dispatcher de cadastros (create or replace preservando TODOS os cases
--    existentes lidos do vivo em 2026-07-27, incluindo folha_encargos do Bloco 6).
--    folha_parametros NAO entra (nao usa fn_excluir_cadastro).
-- =========================================================================
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
    when 'folha_inss_faixas' then 'rh.parametros-folha'
    when 'folha_irrf_faixas' then 'rh.parametros-folha'
    else null
  end;
$function$;

-- SEM seed de valor fiscal: faixas nascem vazias e folha_parametros sem linha;
-- o Tiago cadastra faixas/aliquotas/parametros depois pela tela de parametros da folha.
