-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-14, versão
-- 20260814145116 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Cadastro de provisões de 13º e férias da folha (Bloco 8b, Task 1) — config
-- editável, sem cálculo. Tabela separada de folha_encargos de propósito: as
-- duas guardam campos parecidos mas têm destinos opostos (encargo pode virar
-- guia no Financeiro; provisão só entra no custo do mês, nunca gera conta a
-- pagar). Espelha public.folha_encargos (lida via MCP 2026-08-14) menos
-- grupo_recolhimento, que não existe aqui.
--
-- Diferença deliberada: percentual > 0 (não >= 0 como em folha_encargos).
-- Provisão de 0% só geraria linha de valor zero no snapshot e sujaria a
-- conferência do contador; desligar uma provisão é ativo = false. O Zod em
-- provisaoSchema tem que casar com esse check, senão vaza erro cru do
-- Postgres na tela.
--
-- Grant de UPDATE por coluna (nome, percentual, ativo), mais restrito que o
-- de folha_encargos (arwm, tabela inteira, incluindo created_by/created_at).
-- Este é o padrão correto da casa (igual folhas e rh_pontos): não copiar o
-- grant frouxo do encargo, e não alterar o grant do encargo nesta migration.
--
-- Rollback:
--   drop table if exists public.folha_item_provisoes;
--   alter table public.folha_itens drop column if exists provisoes;
--   alter table public.folhas drop column if exists valor_provisoes;
--   drop table if exists public.folha_provisoes;

create table if not exists public.folha_provisoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  percentual numeric(6,3) not null check (percentual > 0 and percentual <= 100),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  unique (nome)
);

alter table public.folha_provisoes enable row level security;

-- Espelha folha_encargos: sem policy de DELETE (soft delete via fn_excluir_cadastro).
create policy folha_provisoes_select on public.folha_provisoes
  for select to authenticated using ((select public.tem_permissao('rh.encargos','ver')));
create policy folha_provisoes_insert on public.folha_provisoes
  for insert to authenticated with check ((select public.tem_permissao('rh.encargos','criar')));
create policy folha_provisoes_update on public.folha_provisoes
  for update to authenticated
  using ((select public.tem_permissao('rh.encargos','editar')))
  with check ((select public.tem_permissao('rh.encargos','editar')));

grant select, insert on public.folha_provisoes to authenticated;
grant update (nome, percentual, ativo) on public.folha_provisoes to authenticated;

-- Triggers genéricos (iguais ao modelo folha_encargos).
create trigger trg_audit_folha_provisoes
  after insert or update or delete on public.folha_provisoes
  for each row execute function public.fn_audit();

create trigger trg_set_created_by
  before insert on public.folha_provisoes
  for each row execute function public.fn_set_created_by();

create trigger trg_folha_provisoes_updated_at
  before update on public.folha_provisoes
  for each row execute function public.fn_set_updated_at();

-- Snapshot: escrita só pela definer (cálculo da folha, Task 2), leitura por rh.folha.
create table if not exists public.folha_item_provisoes (
  id uuid primary key default gen_random_uuid(),
  folha_item_id uuid not null references public.folha_itens(id) on delete cascade,
  nome text not null,
  percentual numeric(6,3) not null,
  valor_principal numeric(14,2) not null check (valor_principal >= 0),
  valor_encargos numeric(14,2) not null default 0 check (valor_encargos >= 0)
);

create index if not exists idx_folha_item_provisoes_item
  on public.folha_item_provisoes (folha_item_id);

alter table public.folha_item_provisoes enable row level security;

create policy folha_item_provisoes_select on public.folha_item_provisoes
  for select to authenticated using ((select public.tem_permissao('rh.folha','ver')));

grant select on public.folha_item_provisoes to authenticated;

-- folha_item_provisoes não tem updated_at nem created_by (snapshot escrito por
-- definer; quem fez fica no audit_log), espelhando folha_item_encargos: só o
-- trigger de auditoria.
create trigger trg_audit_folha_item_provisoes
  after insert or update or delete on public.folha_item_provisoes
  for each row execute function public.fn_audit();

-- Totais. Default 0 para folha antiga continuar somando certo.
alter table public.folha_itens add column if not exists provisoes numeric(14,2) not null default 0;
alter table public.folhas add column if not exists valor_provisoes numeric(14,2) not null default 0;

do $$
declare v_ruim integer;
begin
  select count(*) into v_ruim
  from information_schema.role_table_grants
  where table_schema = 'public'
    and ((table_name = 'folha_item_provisoes'
          and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE'))))
      or (table_name = 'folha_provisoes'
          and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type = 'DELETE'))));
  if v_ruim > 0 then
    raise exception 'grant indevido em folha_provisoes/folha_item_provisoes: % ocorrencia(s)', v_ruim;
  end if;
end $$;
