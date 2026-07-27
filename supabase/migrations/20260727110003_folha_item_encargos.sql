-- Quebra de encargos por item da folha — Bloco 6.
-- Uma linha por encargo aplicado a um item da folha (folha_itens): guarda nome,
-- percentual e valor em R$ apurados no momento da geracao da folha.
-- Escrita SOMENTE pela fn_gerar_folha (SECURITY DEFINER); a limpeza acompanha o item
-- pai via ON DELETE CASCADE. Por isso NAO ha policy nem grant de insert/update/delete
-- pro authenticated — igual ao modelo public.folha_itens (lido via MCP 2026-07-27:
-- 1 unica policy folha_itens_select gated por tem_permissao('rh.folha','ver'); grant
-- so SELECT ao authenticated).
--
-- Rollback:
--   drop table if exists public.folha_item_encargos;

create table public.folha_item_encargos (
  id             uuid primary key default gen_random_uuid(),
  folha_item_id  uuid not null references public.folha_itens(id) on delete cascade,
  nome           text not null,
  percentual     numeric(6,3) not null,
  valor          numeric(14,2) not null
);

alter table public.folha_item_encargos enable row level security;

-- Indice na FK: o cascade e os joins da fn varrem por folha_item_id.
create index idx_folha_item_encargos_folha_item_id
  on public.folha_item_encargos (folha_item_id);

-- Leitura gateada por rh.folha ver — ESPELHA exatamente a policy de select de folha_itens.
create policy folha_item_encargos_select on public.folha_item_encargos
  for select to authenticated
  using ((select public.tem_permissao('rh.folha', 'ver')));

-- SEM policy de insert/update/delete: a fn_gerar_folha (SECURITY DEFINER) escreve;
-- o ON DELETE CASCADE limpa junto com o item pai.

-- Grant: so SELECT ao authenticated (nada de DML; anon sem nada).
grant select on public.folha_item_encargos to authenticated;
