-- Tabelas do lote de 13o (Bloco 8c).
--
-- Estrutura espelha folhas/folha_itens; ciclo de vida espelha rh_rescisoes.
-- Toda escrita passa por RPC security definer: nao ha policy de insert,
-- update nem delete, e por isso nao ha grant deles.

create table if not exists public.rh_decimo_terceiro (
  id uuid primary key default gen_random_uuid(),
  ano smallint not null,
  parcela smallint not null,
  percentual numeric(7,4) not null,
  com_desconto boolean not null default false,
  status text not null default 'rascunho',
  data_vencimento date,
  valor_bruto numeric(14,2) not null default 0,
  valor_descontos numeric(14,2) not null default 0,
  valor_liquido numeric(14,2) not null default 0,
  aprovado_por uuid references public.usuarios(id),
  aprovado_em timestamptz,
  motivo_rejeicao text,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint rh_dt_parcela_check check (parcela in (1, 2)),
  constraint rh_dt_ano_check check (ano between 2000 and 2100),
  -- Teto de 1: percentual e FRACAO, nao porcentagem digitada. 1.5 aqui
  -- significaria 150% do 13o devido. A conversao 50 -> 0.5 e do schema Zod.
  constraint rh_dt_percentual_check check (percentual > 0 and percentual <= 1),
  constraint rh_dt_status_check check (status in
    ('rascunho','pendente_aprovacao','aprovado','rejeitado'))
);

-- Indice unico PARCIAL, nao constraint: o lote excluido libera o par
-- (ano, parcela) para ser gerado de novo.
create unique index if not exists rh_dt_ano_parcela_unico
  on public.rh_decimo_terceiro (ano, parcela) where excluido_em is null;

create table if not exists public.rh_decimo_terceiro_itens (
  id uuid primary key default gen_random_uuid(),
  decimo_terceiro_id uuid not null
    references public.rh_decimo_terceiro(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id),
  centro_custo_id uuid references public.centros_custo(id),
  salario_base numeric(14,2) not null,
  avos smallint not null,
  valor_bruto numeric(14,2) not null default 0,
  -- O BRUTO ja pago na 1a parcela. Gravado na linha em vez de recalculado na
  -- leitura: o lote da 1a pode ser excluido depois, e o numero da 2a nao pode
  -- mudar retroativamente.
  valor_ja_pago numeric(14,2) not null default 0,
  valor_inss numeric(14,2) not null default 0,
  valor_irrf numeric(14,2) not null default 0,
  valor_liquido numeric(14,2) not null default 0,
  editado_manualmente boolean not null default false,
  lancamento_id uuid references public.lancamentos(id),
  created_at timestamptz not null default now(),
  constraint rh_dt_itens_avos_check check (avos between 0 and 12),
  constraint rh_dt_itens_salario_check check (salario_base >= 0)
);

create unique index if not exists rh_dt_itens_lote_colaborador_unico
  on public.rh_decimo_terceiro_itens (decimo_terceiro_id, colaborador_id);

create index if not exists rh_dt_itens_lote_idx
  on public.rh_decimo_terceiro_itens (decimo_terceiro_id);

alter table public.rh_decimo_terceiro enable row level security;
alter table public.rh_decimo_terceiro_itens enable row level security;

drop policy if exists "rh_dt_select" on public.rh_decimo_terceiro;
create policy "rh_dt_select" on public.rh_decimo_terceiro
  for select to authenticated using (true);

drop policy if exists "rh_dt_itens_select" on public.rh_decimo_terceiro_itens;
create policy "rh_dt_itens_select" on public.rh_decimo_terceiro_itens
  for select to authenticated using (true);

-- Grants EXPLICITOS (regra de ouro 1 do CLAUDE.md). Tabela nova nao herda
-- privilegio nenhum, e o grant declara SO o que as policies permitem: ha
-- policy de SELECT e mais nada, logo grant de SELECT e mais nada.
--
-- O revoke vem ANTES do grant e nao e decoracao: PUBLIC nasce com privilegio
-- em alguns caminhos, e grant sem revoke nao fecha coisa nenhuma.
-- service_role fica de fora do revoke de proposito: as tabelas irmas
-- (rh_rescisoes, folha_itens) tem REFERENCES/TRIGGER/TRUNCATE nele e nada
-- mais, e a forma tem que ficar igual.
revoke all on public.rh_decimo_terceiro from public, anon, authenticated;
revoke all on public.rh_decimo_terceiro_itens from public, anon, authenticated;

grant select on public.rh_decimo_terceiro to authenticated;
grant select on public.rh_decimo_terceiro_itens to authenticated;

drop trigger if exists rh_dt_audit on public.rh_decimo_terceiro;
create trigger rh_dt_audit
  after insert or update or delete on public.rh_decimo_terceiro
  for each row execute function public.fn_audit();

drop trigger if exists rh_dt_itens_audit on public.rh_decimo_terceiro_itens;
create trigger rh_dt_itens_audit
  after insert or update or delete on public.rh_decimo_terceiro_itens
  for each row execute function public.fn_audit();
