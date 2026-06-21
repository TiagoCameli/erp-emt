-- =============================================================
-- Fase 6 / Migration: estrutura da Medição
-- planilhas_contratuais (por obra) + planilha_itens (código/descrição/
-- unidade/quantidade contratada/preço) + medicoes (período + reajuste) +
-- medicao_itens (quantidade do período por item) + medicao_anexos (Storage)
-- + faturas (gerada na aprovação, vira a receber no financeiro).
-- Escrita das transições e da fatura SEMPRE via função definer.
-- =============================================================

-- ---------- Planilha contratual ----------
create table public.planilhas_contratuais (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id),
  nome text not null,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (obra_id)
);
comment on table public.planilhas_contratuais is 'Planilha contratual de uma obra (uma por obra). Itens em planilha_itens.';
create trigger trg_planilhas_updated_at before update on public.planilhas_contratuais for each row execute function public.fn_set_updated_at();
create trigger trg_planilhas_created_by before insert on public.planilhas_contratuais for each row execute function public.fn_set_created_by();
create trigger trg_audit_planilhas after insert or update or delete on public.planilhas_contratuais for each row execute function public.fn_audit();
alter table public.planilhas_contratuais enable row level security;
create policy planilhas_select on public.planilhas_contratuais for select to authenticated using (
  (select public.tem_permissao('medicao.planilha-contratual', 'ver')) or (select public.tem_permissao('medicao.medicoes', 'ver'))
);
create policy planilhas_insert on public.planilhas_contratuais for insert to authenticated with check ((select public.tem_permissao('medicao.planilha-contratual', 'criar')));
create policy planilhas_update on public.planilhas_contratuais for update to authenticated using ((select public.tem_permissao('medicao.planilha-contratual', 'editar'))) with check ((select public.tem_permissao('medicao.planilha-contratual', 'editar')));
grant select, insert, update on table public.planilhas_contratuais to authenticated;

create table public.planilha_itens (
  id uuid primary key default gen_random_uuid(),
  planilha_id uuid not null references public.planilhas_contratuais(id) on delete cascade,
  codigo text,
  descricao text not null,
  unidade_id uuid references public.unidades_medida(id),
  quantidade_contratada numeric(14, 3) not null check (quantidade_contratada >= 0),
  preco_unitario numeric(14, 2) not null check (preco_unitario >= 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.planilha_itens is 'Item da planilha contratual: código, descrição, unidade, quantidade contratada, preço.';
create index idx_planilha_itens_planilha on public.planilha_itens (planilha_id, ordem);
create trigger trg_planilha_itens_updated_at before update on public.planilha_itens for each row execute function public.fn_set_updated_at();
create trigger trg_audit_planilha_itens after insert or update or delete on public.planilha_itens for each row execute function public.fn_audit();
alter table public.planilha_itens enable row level security;
create policy planilha_itens_select on public.planilha_itens for select to authenticated using (
  (select public.tem_permissao('medicao.planilha-contratual', 'ver')) or (select public.tem_permissao('medicao.medicoes', 'ver'))
);
create policy planilha_itens_insert on public.planilha_itens for insert to authenticated with check ((select public.tem_permissao('medicao.planilha-contratual', 'criar')) or (select public.tem_permissao('medicao.planilha-contratual', 'editar')));
create policy planilha_itens_update on public.planilha_itens for update to authenticated using ((select public.tem_permissao('medicao.planilha-contratual', 'editar'))) with check ((select public.tem_permissao('medicao.planilha-contratual', 'editar')));
create policy planilha_itens_delete on public.planilha_itens for delete to authenticated using ((select public.tem_permissao('medicao.planilha-contratual', 'editar')));
grant select, insert, update, delete on table public.planilha_itens to authenticated;

-- ---------- Medições ----------
create table public.medicoes (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  obra_id uuid not null references public.obras(id),
  planilha_id uuid not null references public.planilhas_contratuais(id),
  competencia date not null,
  descricao text,
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovada', 'cancelada')),
  reajuste_tipo text not null default 'nenhum' check (reajuste_tipo in ('nenhum', 'percentual', 'valor')),
  reajuste_valor numeric(14, 4) not null default 0,
  valor_bruto numeric(14, 2) not null default 0,
  valor_reajuste numeric(14, 2) not null default 0,
  valor_total numeric(14, 2) not null default 0,
  data_aprovacao date,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.medicoes is 'Medição de um período por obra. Aprovação gera fatura no contas a receber.';
create index idx_medicoes_obra on public.medicoes (obra_id, competencia desc);
create index idx_medicoes_status on public.medicoes (status);
create trigger trg_medicoes_updated_at before update on public.medicoes for each row execute function public.fn_set_updated_at();
create trigger trg_medicoes_created_by before insert on public.medicoes for each row execute function public.fn_set_created_by();
create trigger trg_audit_medicoes after insert or update or delete on public.medicoes for each row execute function public.fn_audit();
alter table public.medicoes enable row level security;
create policy medicoes_select on public.medicoes for select to authenticated using ((select public.tem_permissao('medicao.medicoes', 'ver')));
create policy medicoes_insert on public.medicoes for insert to authenticated with check ((select public.tem_permissao('medicao.medicoes', 'criar')));
-- Update direto só de campos editáveis no rascunho (status/valores via função).
create policy medicoes_update on public.medicoes for update to authenticated
  using ((select public.tem_permissao('medicao.medicoes', 'editar')) and status = 'rascunho')
  with check ((select public.tem_permissao('medicao.medicoes', 'editar')) and status = 'rascunho');
grant select, insert on table public.medicoes to authenticated;
grant update (competencia, descricao, reajuste_tipo, reajuste_valor) on table public.medicoes to authenticated;

create table public.medicao_itens (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null references public.medicoes(id) on delete cascade,
  planilha_item_id uuid not null references public.planilha_itens(id),
  quantidade numeric(14, 3) not null check (quantidade >= 0),
  memoria_calculo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (medicao_id, planilha_item_id)
);
comment on table public.medicao_itens is 'Quantidade medida no período por item contratual. Valida contra o saldo.';
create index idx_medicao_itens_medicao on public.medicao_itens (medicao_id);
create index idx_medicao_itens_item on public.medicao_itens (planilha_item_id);
create trigger trg_medicao_itens_updated_at before update on public.medicao_itens for each row execute function public.fn_set_updated_at();
create trigger trg_audit_medicao_itens after insert or update or delete on public.medicao_itens for each row execute function public.fn_audit();
alter table public.medicao_itens enable row level security;
create policy medicao_itens_select on public.medicao_itens for select to authenticated using ((select public.tem_permissao('medicao.medicoes', 'ver')));
-- Só mexe nos itens com a medição em rascunho.
create policy medicao_itens_insert on public.medicao_itens for insert to authenticated
  with check ((select public.tem_permissao('medicao.medicoes', 'editar')) and exists (select 1 from public.medicoes m where m.id = medicao_id and m.status = 'rascunho'));
create policy medicao_itens_update on public.medicao_itens for update to authenticated
  using ((select public.tem_permissao('medicao.medicoes', 'editar')) and exists (select 1 from public.medicoes m where m.id = medicao_id and m.status = 'rascunho'))
  with check ((select public.tem_permissao('medicao.medicoes', 'editar')) and exists (select 1 from public.medicoes m where m.id = medicao_id and m.status = 'rascunho'));
create policy medicao_itens_delete on public.medicao_itens for delete to authenticated
  using ((select public.tem_permissao('medicao.medicoes', 'editar')) and exists (select 1 from public.medicoes m where m.id = medicao_id and m.status = 'rascunho'));
grant select, insert, update, delete on table public.medicao_itens to authenticated;

create table public.medicao_anexos (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null references public.medicoes(id) on delete cascade,
  nome text not null,
  caminho text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.medicao_anexos is 'Anexos da medição (memória de cálculo etc) no Storage.';
create index idx_medicao_anexos_medicao on public.medicao_anexos (medicao_id);
create trigger trg_medicao_anexos_created_by before insert on public.medicao_anexos for each row execute function public.fn_set_created_by();
create trigger trg_audit_medicao_anexos after insert or update or delete on public.medicao_anexos for each row execute function public.fn_audit();
alter table public.medicao_anexos enable row level security;
create policy medicao_anexos_select on public.medicao_anexos for select to authenticated using ((select public.tem_permissao('medicao.medicoes', 'ver')));
create policy medicao_anexos_insert on public.medicao_anexos for insert to authenticated with check ((select public.tem_permissao('medicao.medicoes', 'editar')));
create policy medicao_anexos_delete on public.medicao_anexos for delete to authenticated using ((select public.tem_permissao('medicao.medicoes', 'editar')));
grant select, insert, delete on table public.medicao_anexos to authenticated;

-- ---------- Faturas ----------
create table public.faturas (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  medicao_id uuid references public.medicoes(id),
  obra_id uuid not null references public.obras(id),
  cliente_id uuid references public.clientes(id),
  lancamento_id uuid references public.lancamentos(id),
  competencia date not null,
  valor numeric(14, 2) not null check (valor >= 0),
  data_vencimento date,
  status text not null default 'aberta' check (status in ('aberta', 'cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.faturas is 'Fatura de medição: gerada na aprovação, espelha um lançamento a receber.';
create index idx_faturas_obra on public.faturas (obra_id);
create index idx_faturas_medicao on public.faturas (medicao_id);
create trigger trg_faturas_updated_at before update on public.faturas for each row execute function public.fn_set_updated_at();
create trigger trg_audit_faturas after insert or update or delete on public.faturas for each row execute function public.fn_audit();
alter table public.faturas enable row level security;
create policy faturas_select on public.faturas for select to authenticated using (
  (select public.tem_permissao('medicao.faturas', 'ver')) or (select public.tem_permissao('medicao.medicoes', 'ver'))
);
grant select on table public.faturas to authenticated;
