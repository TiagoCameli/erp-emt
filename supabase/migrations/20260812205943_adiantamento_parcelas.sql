-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-12, versão
-- 20260812205943 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 2 do adiantamento parcelado, parte 1 de 2.

-- Plano de desconto do adiantamento: uma linha por parcela, com o previsto por
-- competencia e o realizado (quanto a folha descontou e qual folha descontou).
-- O dinheiro continua saindo inteiro na concessao; o que e parcelado aqui e so
-- o desconto na folha.
create table if not exists public.rh_adiantamento_parcelas (
  id uuid primary key default gen_random_uuid(),
  adiantamento_id uuid not null
    references public.rh_adiantamentos(id) on delete cascade,
  numero integer not null
    constraint rh_adiant_parcelas_numero_positivo check (numero >= 1),
  competencia date not null
    constraint rh_adiant_parcelas_competencia_dia1
      check (extract(day from competencia) = 1),
  valor_previsto numeric(14,2) not null
    constraint rh_adiant_parcelas_previsto_positivo check (valor_previsto > 0),
  valor_descontado numeric(14,2) not null default 0
    constraint rh_adiant_parcelas_descontado_nao_negativo
      check (valor_descontado >= 0),
  folha_id uuid references public.folhas(id),
  gerada_por_folha_id uuid references public.folhas(id),
  created_at timestamptz not null default now(),
  constraint rh_adiant_parcelas_numero_unico unique (adiantamento_id, numero),
  -- Nao da para descontar mais do que a parcela preve.
  constraint rh_adiant_parcelas_descontado_ate_previsto
    check (valor_descontado <= valor_previsto),
  -- Descontado sem folha, ou folha sem valor, seria estado meio gravado.
  constraint rh_adiant_parcelas_descontado_com_folha
    check ((valor_descontado > 0) = (folha_id is not null))
);

-- Sem indice avulso em adiantamento_id: o unique (adiantamento_id, numero) ja e
-- um btree com adiantamento_id na frente, entao ele atende tanto a busca das
-- parcelas de um adiantamento quanto o cascade da FK.
create index if not exists idx_rh_adiant_parcelas_competencia_aberta
  on public.rh_adiantamento_parcelas (competencia) where folha_id is null;
create index if not exists idx_rh_adiant_parcelas_folha
  on public.rh_adiantamento_parcelas (folha_id);
create index if not exists idx_rh_adiant_parcelas_gerada_por
  on public.rh_adiantamento_parcelas (gerada_por_folha_id);

alter table public.rh_adiantamento_parcelas enable row level security;

create policy rh_adiant_parcelas_select on public.rh_adiantamento_parcelas
  for select to authenticated
  using ((select public.tem_permissao('rh.adiantamentos', 'ver')));

-- Escrita so pelas funcoes definer: sem policy e sem grant de DML.
grant select on public.rh_adiantamento_parcelas to authenticated;

create trigger trg_audit_rh_adiant_parcelas
  after insert or update or delete on public.rh_adiantamento_parcelas
  for each row execute function public.fn_audit();

do $$
declare v_ruim integer;
begin
  select count(*) into v_ruim
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'rh_adiantamento_parcelas'
    and (grantee = 'anon'
      or (grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')));
  if v_ruim > 0 then
    raise exception 'rh_adiantamento_parcelas tem % grant indevido (anon com acesso ou authenticated com DML)', v_ruim;
  end if;
end $$;
