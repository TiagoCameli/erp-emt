-- =============================================================
-- Fase 5 / Migration: planos preventivos, leituras e checklists
-- planos_preventivos + plano_atividades (intervalo por horímetro/km/dias) +
-- equipamento_planos (atribuição com base de cálculo) + leituras_equipamento
-- (horímetro/km que alimentam a previsão) + checklists + perguntas +
-- execuções + respostas (item reprovado pode abrir OS).
-- =============================================================

-- ---------- Planos preventivos ----------
create table public.planos_preventivos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.planos_preventivos is 'Modelo de plano preventivo (conjunto de atividades por intervalo).';
create trigger trg_planos_prev_updated_at before update on public.planos_preventivos for each row execute function public.fn_set_updated_at();
create trigger trg_planos_prev_created_by before insert on public.planos_preventivos for each row execute function public.fn_set_created_by();
create trigger trg_audit_planos_prev after insert or update or delete on public.planos_preventivos for each row execute function public.fn_audit();
alter table public.planos_preventivos enable row level security;
create policy planos_prev_select on public.planos_preventivos for select to authenticated using ((select public.tem_permissao('manutencao.planos-preventivos', 'ver')));
create policy planos_prev_insert on public.planos_preventivos for insert to authenticated with check ((select public.tem_permissao('manutencao.planos-preventivos', 'criar')));
create policy planos_prev_update on public.planos_preventivos for update to authenticated using ((select public.tem_permissao('manutencao.planos-preventivos', 'editar'))) with check ((select public.tem_permissao('manutencao.planos-preventivos', 'editar')));
grant select, insert, update on table public.planos_preventivos to authenticated;

create table public.plano_atividades (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos_preventivos(id) on delete cascade,
  descricao text not null,
  intervalo_tipo text not null check (intervalo_tipo in ('horimetro', 'km', 'dias')),
  intervalo_valor numeric(14, 2) not null check (intervalo_valor > 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.plano_atividades is 'Atividade de um plano preventivo, com intervalo por horímetro, km ou dias.';
create index idx_plano_atividades_plano on public.plano_atividades (plano_id);
create trigger trg_audit_plano_atividades after insert or update or delete on public.plano_atividades for each row execute function public.fn_audit();
alter table public.plano_atividades enable row level security;
create policy plano_atividades_select on public.plano_atividades for select to authenticated using ((select public.tem_permissao('manutencao.planos-preventivos', 'ver')));
create policy plano_atividades_insert on public.plano_atividades for insert to authenticated with check ((select public.tem_permissao('manutencao.planos-preventivos', 'editar')));
create policy plano_atividades_update on public.plano_atividades for update to authenticated using ((select public.tem_permissao('manutencao.planos-preventivos', 'editar'))) with check ((select public.tem_permissao('manutencao.planos-preventivos', 'editar')));
create policy plano_atividades_delete on public.plano_atividades for delete to authenticated using ((select public.tem_permissao('manutencao.planos-preventivos', 'editar')));
grant select, insert, update, delete on table public.plano_atividades to authenticated;

create table public.equipamento_planos (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id),
  plano_id uuid not null references public.planos_preventivos(id),
  ativo boolean not null default true,
  base_horimetro numeric(14, 2),
  base_km numeric(14, 2),
  base_data date not null default (now() at time zone 'America/Rio_Branco')::date,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (equipamento_id, plano_id)
);
comment on table public.equipamento_planos is 'Plano preventivo atribuído a um equipamento, com a base de cálculo da próxima manutenção.';
create index idx_equip_planos_equip on public.equipamento_planos (equipamento_id);
create trigger trg_equip_planos_created_by before insert on public.equipamento_planos for each row execute function public.fn_set_created_by();
create trigger trg_audit_equip_planos after insert or update or delete on public.equipamento_planos for each row execute function public.fn_audit();
alter table public.equipamento_planos enable row level security;
create policy equip_planos_select on public.equipamento_planos for select to authenticated using (
  (select public.tem_permissao('manutencao.planos-preventivos', 'ver')) or (select public.tem_permissao('manutencao.painel', 'ver'))
);
create policy equip_planos_insert on public.equipamento_planos for insert to authenticated with check ((select public.tem_permissao('manutencao.planos-preventivos', 'editar')));
create policy equip_planos_update on public.equipamento_planos for update to authenticated using ((select public.tem_permissao('manutencao.planos-preventivos', 'editar'))) with check ((select public.tem_permissao('manutencao.planos-preventivos', 'editar')));
create policy equip_planos_delete on public.equipamento_planos for delete to authenticated using ((select public.tem_permissao('manutencao.planos-preventivos', 'editar')));
grant select, insert, update, delete on table public.equipamento_planos to authenticated;

create table public.leituras_equipamento (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id),
  tipo text not null check (tipo in ('horimetro', 'km')),
  valor numeric(14, 2) not null check (valor >= 0),
  data date not null default (now() at time zone 'America/Rio_Branco')::date,
  origem text not null default 'manual' check (origem in ('manual', 'os', 'checklist', 'abastecimento')),
  origem_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.leituras_equipamento is 'Leituras de horímetro/km. Alimentam a previsão dos planos preventivos.';
create index idx_leituras_equip on public.leituras_equipamento (equipamento_id, tipo, data desc);
create trigger trg_leituras_created_by before insert on public.leituras_equipamento for each row execute function public.fn_set_created_by();
create trigger trg_audit_leituras after insert or update or delete on public.leituras_equipamento for each row execute function public.fn_audit();
alter table public.leituras_equipamento enable row level security;
create policy leituras_select on public.leituras_equipamento for select to authenticated using (
  (select public.tem_permissao('manutencao.planos-preventivos', 'ver'))
  or (select public.tem_permissao('manutencao.ordens-servico', 'ver'))
  or (select public.tem_permissao('manutencao.painel', 'ver'))
);
create policy leituras_insert on public.leituras_equipamento for insert to authenticated
  with check ((select public.tem_permissao('manutencao.planos-preventivos', 'editar')));
grant select, insert on table public.leituras_equipamento to authenticated;

-- ---------- Checklists ----------
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.checklists is 'Modelo de checklist pré-uso (conjunto de perguntas).';
create trigger trg_checklists_updated_at before update on public.checklists for each row execute function public.fn_set_updated_at();
create trigger trg_checklists_created_by before insert on public.checklists for each row execute function public.fn_set_created_by();
create trigger trg_audit_checklists after insert or update or delete on public.checklists for each row execute function public.fn_audit();
alter table public.checklists enable row level security;
create policy checklists_select on public.checklists for select to authenticated using ((select public.tem_permissao('manutencao.checklists', 'ver')));
create policy checklists_insert on public.checklists for insert to authenticated with check ((select public.tem_permissao('manutencao.checklists', 'editar')));
create policy checklists_update on public.checklists for update to authenticated using ((select public.tem_permissao('manutencao.checklists', 'editar'))) with check ((select public.tem_permissao('manutencao.checklists', 'editar')));
grant select, insert, update on table public.checklists to authenticated;

create table public.checklist_perguntas (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  pergunta text not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.checklist_perguntas is 'Pergunta de um checklist (resposta ok/nok/na).';
create index idx_checklist_perguntas_cl on public.checklist_perguntas (checklist_id);
create trigger trg_audit_checklist_perguntas after insert or update or delete on public.checklist_perguntas for each row execute function public.fn_audit();
alter table public.checklist_perguntas enable row level security;
create policy checklist_perguntas_select on public.checklist_perguntas for select to authenticated using ((select public.tem_permissao('manutencao.checklists', 'ver')));
create policy checklist_perguntas_insert on public.checklist_perguntas for insert to authenticated with check ((select public.tem_permissao('manutencao.checklists', 'editar')));
create policy checklist_perguntas_update on public.checklist_perguntas for update to authenticated using ((select public.tem_permissao('manutencao.checklists', 'editar'))) with check ((select public.tem_permissao('manutencao.checklists', 'editar')));
create policy checklist_perguntas_delete on public.checklist_perguntas for delete to authenticated using ((select public.tem_permissao('manutencao.checklists', 'editar')));
grant select, insert, update, delete on table public.checklist_perguntas to authenticated;

create table public.checklist_execucoes (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id),
  equipamento_id uuid not null references public.equipamentos(id),
  operador_id uuid references public.colaboradores(id),
  data date not null default (now() at time zone 'America/Rio_Branco')::date,
  horimetro numeric(14, 2),
  km numeric(14, 2),
  status text not null default 'ok' check (status in ('ok', 'com_pendencia')),
  observacao text,
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.checklist_execucoes is 'Execução de um checklist pré-uso. Pendência pode abrir OS.';
create index idx_checklist_exec_equip on public.checklist_execucoes (equipamento_id, data desc);
create trigger trg_audit_checklist_exec after insert or update or delete on public.checklist_execucoes for each row execute function public.fn_audit();
alter table public.checklist_execucoes enable row level security;
create policy checklist_exec_select on public.checklist_execucoes for select to authenticated using (
  (select public.tem_permissao('manutencao.checklists', 'ver')) or (select public.tem_permissao('manutencao.painel', 'ver'))
);
grant select on table public.checklist_execucoes to authenticated;

create table public.checklist_respostas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.checklist_execucoes(id) on delete cascade,
  pergunta_id uuid not null references public.checklist_perguntas(id),
  resposta text not null check (resposta in ('ok', 'nok', 'na')),
  observacao text,
  os_id uuid references public.ordens_servico(id),
  created_at timestamptz not null default now()
);
comment on table public.checklist_respostas is 'Resposta de uma pergunta do checklist. Reprovado (nok) pode abrir OS.';
create index idx_checklist_respostas_exec on public.checklist_respostas (execucao_id);
create trigger trg_audit_checklist_respostas after insert or update or delete on public.checklist_respostas for each row execute function public.fn_audit();
alter table public.checklist_respostas enable row level security;
create policy checklist_respostas_select on public.checklist_respostas for select to authenticated using ((select public.tem_permissao('manutencao.checklists', 'ver')));
grant select on table public.checklist_respostas to authenticated;
