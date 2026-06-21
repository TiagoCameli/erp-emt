-- =============================================================
-- Fase 7 (espinha) / Migration: estrutura de RH
-- Completa o colaborador (salário, valor da diária) e cria a espinha:
-- rh_pontos + rh_apontamentos (ponto diário por obra/equipe, com aprovação do
-- dia), rh_adiantamentos, rh_diarias (diaristas), folhas + folha_itens
-- (folha gerencial mensal, custo por centro de custo).
-- Demais abas (férias, EPI, ASO, ocorrências, banco de horas) ficam para o PR seguinte.
-- =============================================================

-- Colaborador completo: salário (CLT) e valor da diária (diarista).
alter table public.colaboradores add column if not exists salario numeric(14, 2);
alter table public.colaboradores add column if not exists valor_diaria numeric(14, 2);

-- ---------- Ponto: cabeçalho do dia por obra/equipe ----------
create table public.rh_pontos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id),
  data date not null,
  encarregado_id uuid references public.colaboradores(id),
  status text not null default 'aberto' check (status in ('aberto', 'aprovado')),
  aprovado_por uuid,
  aprovado_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (obra_id, data)
);
comment on table public.rh_pontos is 'Ponto diário de uma equipe/obra. Aprovação do dia trava os apontamentos.';
create index idx_rh_pontos_obra on public.rh_pontos (obra_id, data desc);
create trigger trg_rh_pontos_updated_at before update on public.rh_pontos for each row execute function public.fn_set_updated_at();
create trigger trg_rh_pontos_created_by before insert on public.rh_pontos for each row execute function public.fn_set_created_by();
create trigger trg_audit_rh_pontos after insert or update or delete on public.rh_pontos for each row execute function public.fn_audit();
alter table public.rh_pontos enable row level security;
create policy rh_pontos_select on public.rh_pontos for select to authenticated using ((select public.tem_permissao('rh.apontamentos', 'ver')));
create policy rh_pontos_insert on public.rh_pontos for insert to authenticated with check ((select public.tem_permissao('rh.apontamentos', 'criar')));
-- Edição direta só de campos do cabeçalho enquanto aberto (status via função).
create policy rh_pontos_update on public.rh_pontos for update to authenticated
  using ((select public.tem_permissao('rh.apontamentos', 'editar')) and status = 'aberto')
  with check ((select public.tem_permissao('rh.apontamentos', 'editar')) and status = 'aberto');
grant select, insert on table public.rh_pontos to authenticated;
grant update (encarregado_id, observacao) on table public.rh_pontos to authenticated;

create table public.rh_apontamentos (
  id uuid primary key default gen_random_uuid(),
  ponto_id uuid not null references public.rh_pontos(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id),
  horas_normais numeric(5, 2) not null default 0 check (horas_normais >= 0 and horas_normais <= 24),
  horas_extras numeric(5, 2) not null default 0 check (horas_extras >= 0 and horas_extras <= 24),
  tipo text not null default 'normal' check (tipo in ('normal', 'falta', 'atestado', 'folga')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ponto_id, colaborador_id)
);
comment on table public.rh_apontamentos is 'Horas de um colaborador num dia. Editável só com o ponto aberto.';
create index idx_rh_apont_ponto on public.rh_apontamentos (ponto_id);
create index idx_rh_apont_colab on public.rh_apontamentos (colaborador_id);
create trigger trg_rh_apont_updated_at before update on public.rh_apontamentos for each row execute function public.fn_set_updated_at();
create trigger trg_audit_rh_apont after insert or update or delete on public.rh_apontamentos for each row execute function public.fn_audit();
alter table public.rh_apontamentos enable row level security;
create policy rh_apont_select on public.rh_apontamentos for select to authenticated using ((select public.tem_permissao('rh.apontamentos', 'ver')));
create policy rh_apont_insert on public.rh_apontamentos for insert to authenticated
  with check ((select public.tem_permissao('rh.apontamentos', 'editar')) and exists (select 1 from public.rh_pontos p where p.id = ponto_id and p.status = 'aberto'));
create policy rh_apont_update on public.rh_apontamentos for update to authenticated
  using ((select public.tem_permissao('rh.apontamentos', 'editar')) and exists (select 1 from public.rh_pontos p where p.id = ponto_id and p.status = 'aberto'))
  with check ((select public.tem_permissao('rh.apontamentos', 'editar')) and exists (select 1 from public.rh_pontos p where p.id = ponto_id and p.status = 'aberto'));
create policy rh_apont_delete on public.rh_apontamentos for delete to authenticated
  using ((select public.tem_permissao('rh.apontamentos', 'editar')) and exists (select 1 from public.rh_pontos p where p.id = ponto_id and p.status = 'aberto'));
grant select, insert, update, delete on table public.rh_apontamentos to authenticated;

-- ---------- Adiantamentos ----------
create table public.rh_adiantamentos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  competencia date not null,
  valor numeric(14, 2) not null check (valor > 0),
  data date not null default (now() at time zone 'America/Rio_Branco')::date,
  descricao text,
  folha_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.rh_adiantamentos is 'Adiantamento a um colaborador na competência. Descontado na folha gerencial.';
create index idx_rh_adiant_colab on public.rh_adiantamentos (colaborador_id, competencia);
create trigger trg_rh_adiant_updated_at before update on public.rh_adiantamentos for each row execute function public.fn_set_updated_at();
create trigger trg_rh_adiant_created_by before insert on public.rh_adiantamentos for each row execute function public.fn_set_created_by();
create trigger trg_audit_rh_adiant after insert or update or delete on public.rh_adiantamentos for each row execute function public.fn_audit();
alter table public.rh_adiantamentos enable row level security;
create policy rh_adiant_select on public.rh_adiantamentos for select to authenticated using ((select public.tem_permissao('rh.adiantamentos', 'ver')));
create policy rh_adiant_insert on public.rh_adiantamentos for insert to authenticated with check ((select public.tem_permissao('rh.adiantamentos', 'criar')));
-- Só mexe enquanto não consumido por uma folha.
create policy rh_adiant_update on public.rh_adiantamentos for update to authenticated
  using ((select public.tem_permissao('rh.adiantamentos', 'editar')) and folha_id is null)
  with check ((select public.tem_permissao('rh.adiantamentos', 'editar')) and folha_id is null);
create policy rh_adiant_delete on public.rh_adiantamentos for delete to authenticated
  using ((select public.tem_permissao('rh.adiantamentos', 'excluir')) and folha_id is null);
grant select, insert, update, delete on table public.rh_adiantamentos to authenticated;

-- ---------- Diaristas ----------
create table public.rh_diarias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  obra_id uuid references public.obras(id),
  data date not null default (now() at time zone 'America/Rio_Branco')::date,
  competencia date not null,
  valor numeric(14, 2) not null check (valor >= 0),
  lancamento_id uuid references public.lancamentos(id),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.rh_diarias is 'Diária de um diarista. O fechamento gera um lançamento a pagar.';
create index idx_rh_diarias_colab on public.rh_diarias (colaborador_id, competencia);
create trigger trg_rh_diarias_updated_at before update on public.rh_diarias for each row execute function public.fn_set_updated_at();
create trigger trg_rh_diarias_created_by before insert on public.rh_diarias for each row execute function public.fn_set_created_by();
create trigger trg_audit_rh_diarias after insert or update or delete on public.rh_diarias for each row execute function public.fn_audit();
alter table public.rh_diarias enable row level security;
create policy rh_diarias_select on public.rh_diarias for select to authenticated using ((select public.tem_permissao('rh.diaristas', 'ver')));
create policy rh_diarias_insert on public.rh_diarias for insert to authenticated with check ((select public.tem_permissao('rh.diaristas', 'criar')));
-- Só mexe enquanto não fechada (sem lançamento).
create policy rh_diarias_update on public.rh_diarias for update to authenticated
  using ((select public.tem_permissao('rh.diaristas', 'editar')) and lancamento_id is null)
  with check ((select public.tem_permissao('rh.diaristas', 'editar')) and lancamento_id is null);
create policy rh_diarias_delete on public.rh_diarias for delete to authenticated
  using ((select public.tem_permissao('rh.diaristas', 'editar')) and lancamento_id is null);
grant select, insert, update, delete on table public.rh_diarias to authenticated;

-- ---------- Folha gerencial ----------
create table public.folhas (
  id uuid primary key default gen_random_uuid(),
  competencia date not null unique,
  status text not null default 'rascunho' check (status in ('rascunho', 'fechada')),
  encargos_percentual numeric(5, 2) not null default 0 check (encargos_percentual >= 0),
  valor_bruto numeric(14, 2) not null default 0,
  valor_encargos numeric(14, 2) not null default 0,
  valor_adiantamentos numeric(14, 2) not null default 0,
  valor_liquido numeric(14, 2) not null default 0,
  custo_total numeric(14, 2) not null default 0,
  data_fechamento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.folhas is 'Folha gerencial mensal. Exporta planilha para o contador; não é a folha oficial.';
create index idx_folhas_competencia on public.folhas (competencia desc);
create trigger trg_folhas_updated_at before update on public.folhas for each row execute function public.fn_set_updated_at();
create trigger trg_folhas_created_by before insert on public.folhas for each row execute function public.fn_set_created_by();
create trigger trg_audit_folhas after insert or update or delete on public.folhas for each row execute function public.fn_audit();
alter table public.folhas enable row level security;
create policy folhas_select on public.folhas for select to authenticated using ((select public.tem_permissao('rh.folha', 'ver')));
grant select on table public.folhas to authenticated;

create table public.folha_itens (
  id uuid primary key default gen_random_uuid(),
  folha_id uuid not null references public.folhas(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id),
  centro_custo_id uuid references public.centros_custo(id),
  salario_base numeric(14, 2) not null default 0,
  horas_normais numeric(8, 2) not null default 0,
  horas_extras numeric(8, 2) not null default 0,
  valor_extras numeric(14, 2) not null default 0,
  encargos numeric(14, 2) not null default 0,
  adiantamentos numeric(14, 2) not null default 0,
  custo_total numeric(14, 2) not null default 0,
  valor_liquido numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (folha_id, colaborador_id)
);
comment on table public.folha_itens is 'Linha da folha gerencial por colaborador, com custo alocado ao centro de custo.';
create index idx_folha_itens_folha on public.folha_itens (folha_id);
create index idx_folha_itens_cc on public.folha_itens (centro_custo_id);
create trigger trg_audit_folha_itens after insert or update or delete on public.folha_itens for each row execute function public.fn_audit();
alter table public.folha_itens enable row level security;
create policy folha_itens_select on public.folha_itens for select to authenticated using ((select public.tem_permissao('rh.folha', 'ver')));
grant select on table public.folha_itens to authenticated;

-- FK do adiantamento para a folha (criada depois que folhas existe).
alter table public.rh_adiantamentos add constraint rh_adiantamentos_folha_id_fkey
  foreign key (folha_id) references public.folhas(id);
