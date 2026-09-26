-- Fase 2 (carga do Lote 09, Medição de Contratos): preparo.
--
-- Staging da carga no schema legado, no padrão da Fase 3/4 (20260925120000_fase34_preparo_carga.sql):
-- RLS ligada, nenhuma policy e nenhum grant. Ninguém do app lê; a carga roda como postgres. Os
-- lotes vêm do retrato da origem (scripts/migracao-medicao/gerar_carga_lote09.py +
-- carregar_staging_lote09.py) e são dado, não migration: a migration de carga (Task 3) lê daqui,
-- grava pelas tabelas do módulo e confere contra a seção 'esperado'.

create table if not exists legado.carga_mc_l09 (
  secao text not null,
  parte integer not null,
  dados jsonb not null,
  carregado_em timestamptz not null default now(),
  primary key (secao, parte)
);
alter table legado.carga_mc_l09 enable row level security;
revoke all on legado.carga_mc_l09 from public, anon, authenticated;

create or replace function legado.fn_staging_mc_l09(p_secao text)
returns setof jsonb
language sql
stable
set search_path to ''
as $$
  select e from legado.carga_mc_l09 c, jsonb_array_elements(c.dados) e
  where c.secao = p_secao
$$;
revoke all on function legado.fn_staging_mc_l09(text) from public, anon, authenticated;
