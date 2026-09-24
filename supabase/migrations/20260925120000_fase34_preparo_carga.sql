-- Fase 3/4 (carga do Combustível e do Frete, virada no mesmo dia): preparo.
--
-- Staging da carga no schema legado, no padrão da 2d (20260923160000 + 20260923161000, aqui
-- juntas): RLS ligada, nenhuma policy e nenhum grant. Ninguém do app lê; a carga roda como
-- postgres. Os lotes vêm do retrato da origem (scripts/migracao-gestao-obras/
-- gerar_carga_fase34.py) e são dado, não migration: a 20260925130000 lê daqui, grava e confere.
--
-- Não precisa de de-para novo: os ids de texto da origem viram uuid por legado.fn_uid (o mesmo
-- md5 do gerador), e fornecedor, equipamento, obra e insumo usam os de-paras da Fase 1. O
-- material do frete (brita, BGS...) entra em legado.de_para_insumos pela própria carga.

create table if not exists legado.carga_fase34 (
  tabela text not null,
  parte integer not null,
  dados jsonb not null,
  carregado_em timestamptz not null default now(),
  primary key (tabela, parte)
);
alter table legado.carga_fase34 enable row level security;
revoke all on legado.carga_fase34 from public, anon, authenticated;

create or replace function legado.fn_staging34(p_tabela text)
returns setof jsonb
language sql
stable
set search_path to ''
as $$
  select e from legado.carga_fase34 c, jsonb_array_elements(c.dados) e
  where c.tabela = p_tabela
$$;
revoke all on function legado.fn_staging34(text) from public, anon, authenticated;
