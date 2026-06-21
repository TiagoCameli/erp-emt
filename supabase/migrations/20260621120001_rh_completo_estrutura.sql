-- =============================================================
-- Fase 7 (2o corte) / Migration: RH-admin
-- rh_ferias, rh_ocorrencias, rh_epis, rh_documentos (ASO e documentos com
-- vencimento) e banco_horas_movimentos. CRUD direto (RLS), sem funções
-- transacionais. Alertas de vencimento são calculados na leitura.
-- =============================================================

-- Helper de CRUD padrão por recurso: select/insert/update/delete via tem_permissao.
-- (Escrito por tabela abaixo.)

create table public.rh_ferias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  periodo_aquisitivo_inicio date not null,
  periodo_aquisitivo_fim date not null,
  data_inicio date,
  data_fim date,
  dias integer not null default 0 check (dias >= 0),
  status text not null default 'programada' check (status in ('programada', 'gozada')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.rh_ferias is 'Períodos aquisitivos e programação de férias. Limite de gozo = fim aquisitivo + 12 meses.';
create index idx_rh_ferias_colab on public.rh_ferias (colaborador_id);
create trigger trg_rh_ferias_updated_at before update on public.rh_ferias for each row execute function public.fn_set_updated_at();
create trigger trg_rh_ferias_created_by before insert on public.rh_ferias for each row execute function public.fn_set_created_by();
create trigger trg_audit_rh_ferias after insert or update or delete on public.rh_ferias for each row execute function public.fn_audit();
alter table public.rh_ferias enable row level security;
create policy rh_ferias_select on public.rh_ferias for select to authenticated using ((select public.tem_permissao('rh.ferias', 'ver')));
create policy rh_ferias_insert on public.rh_ferias for insert to authenticated with check ((select public.tem_permissao('rh.ferias', 'criar')));
create policy rh_ferias_update on public.rh_ferias for update to authenticated using ((select public.tem_permissao('rh.ferias', 'editar'))) with check ((select public.tem_permissao('rh.ferias', 'editar')));
create policy rh_ferias_delete on public.rh_ferias for delete to authenticated using ((select public.tem_permissao('rh.ferias', 'excluir')));
grant select, insert, update, delete on table public.rh_ferias to authenticated;

create table public.rh_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  data date not null default (now() at time zone 'America/Rio_Branco')::date,
  tipo text not null check (tipo in ('advertencia', 'suspensao', 'atestado', 'acidente', 'elogio', 'outro')),
  descricao text not null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.rh_ocorrencias is 'Ausências e ocorrências do colaborador (advertência, atestado, acidente etc).';
create index idx_rh_ocorrencias_colab on public.rh_ocorrencias (colaborador_id, data desc);
create trigger trg_rh_ocorrencias_updated_at before update on public.rh_ocorrencias for each row execute function public.fn_set_updated_at();
create trigger trg_rh_ocorrencias_created_by before insert on public.rh_ocorrencias for each row execute function public.fn_set_created_by();
create trigger trg_audit_rh_ocorrencias after insert or update or delete on public.rh_ocorrencias for each row execute function public.fn_audit();
alter table public.rh_ocorrencias enable row level security;
create policy rh_ocorrencias_select on public.rh_ocorrencias for select to authenticated using ((select public.tem_permissao('rh.ocorrencias', 'ver')));
create policy rh_ocorrencias_insert on public.rh_ocorrencias for insert to authenticated with check ((select public.tem_permissao('rh.ocorrencias', 'criar')));
create policy rh_ocorrencias_update on public.rh_ocorrencias for update to authenticated using ((select public.tem_permissao('rh.ocorrencias', 'editar'))) with check ((select public.tem_permissao('rh.ocorrencias', 'editar')));
create policy rh_ocorrencias_delete on public.rh_ocorrencias for delete to authenticated using ((select public.tem_permissao('rh.ocorrencias', 'excluir')));
grant select, insert, update, delete on table public.rh_ocorrencias to authenticated;

create table public.rh_epis (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  descricao text not null,
  ca text,
  quantidade integer not null default 1 check (quantidade > 0),
  data_entrega date not null default (now() at time zone 'America/Rio_Branco')::date,
  data_devolucao date,
  assinado boolean not null default false,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.rh_epis is 'Entregas de EPI ao colaborador, com termo assinado e devolução.';
create index idx_rh_epis_colab on public.rh_epis (colaborador_id, data_entrega desc);
create trigger trg_rh_epis_updated_at before update on public.rh_epis for each row execute function public.fn_set_updated_at();
create trigger trg_rh_epis_created_by before insert on public.rh_epis for each row execute function public.fn_set_created_by();
create trigger trg_audit_rh_epis after insert or update or delete on public.rh_epis for each row execute function public.fn_audit();
alter table public.rh_epis enable row level security;
create policy rh_epis_select on public.rh_epis for select to authenticated using ((select public.tem_permissao('rh.epis', 'ver')));
create policy rh_epis_insert on public.rh_epis for insert to authenticated with check ((select public.tem_permissao('rh.epis', 'criar')));
create policy rh_epis_update on public.rh_epis for update to authenticated using ((select public.tem_permissao('rh.epis', 'editar'))) with check ((select public.tem_permissao('rh.epis', 'editar')));
create policy rh_epis_delete on public.rh_epis for delete to authenticated using ((select public.tem_permissao('rh.epis', 'excluir')));
grant select, insert, update, delete on table public.rh_epis to authenticated;

create table public.rh_documentos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  tipo text not null check (tipo in ('aso', 'contrato', 'rg', 'cpf', 'ctps', 'cnh', 'certificado', 'outro')),
  descricao text not null,
  data_emissao date,
  data_vencimento date,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.rh_documentos is 'Documentos e ASO do colaborador, com vencimento para o painel de alertas.';
create index idx_rh_documentos_colab on public.rh_documentos (colaborador_id);
create index idx_rh_documentos_venc on public.rh_documentos (data_vencimento) where data_vencimento is not null;
create trigger trg_rh_documentos_updated_at before update on public.rh_documentos for each row execute function public.fn_set_updated_at();
create trigger trg_rh_documentos_created_by before insert on public.rh_documentos for each row execute function public.fn_set_created_by();
create trigger trg_audit_rh_documentos after insert or update or delete on public.rh_documentos for each row execute function public.fn_audit();
alter table public.rh_documentos enable row level security;
create policy rh_documentos_select on public.rh_documentos for select to authenticated using ((select public.tem_permissao('rh.documentos', 'ver')));
create policy rh_documentos_insert on public.rh_documentos for insert to authenticated with check ((select public.tem_permissao('rh.documentos', 'criar')));
create policy rh_documentos_update on public.rh_documentos for update to authenticated using ((select public.tem_permissao('rh.documentos', 'editar'))) with check ((select public.tem_permissao('rh.documentos', 'editar')));
create policy rh_documentos_delete on public.rh_documentos for delete to authenticated using ((select public.tem_permissao('rh.documentos', 'excluir')));
grant select, insert, update, delete on table public.rh_documentos to authenticated;

create table public.banco_horas_movimentos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  data date not null default (now() at time zone 'America/Rio_Branco')::date,
  tipo text not null check (tipo in ('credito', 'debito')),
  horas numeric(6, 2) not null check (horas > 0),
  motivo text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.banco_horas_movimentos is 'Banco de horas (opcional): créditos e débitos; saldo = soma dos créditos menos débitos.';
create index idx_banco_horas_colab on public.banco_horas_movimentos (colaborador_id, data desc);
create trigger trg_banco_horas_updated_at before update on public.banco_horas_movimentos for each row execute function public.fn_set_updated_at();
create trigger trg_banco_horas_created_by before insert on public.banco_horas_movimentos for each row execute function public.fn_set_created_by();
create trigger trg_audit_banco_horas after insert or update or delete on public.banco_horas_movimentos for each row execute function public.fn_audit();
alter table public.banco_horas_movimentos enable row level security;
create policy banco_horas_select on public.banco_horas_movimentos for select to authenticated using ((select public.tem_permissao('rh.banco-horas', 'ver')));
create policy banco_horas_insert on public.banco_horas_movimentos for insert to authenticated with check ((select public.tem_permissao('rh.banco-horas', 'criar')));
create policy banco_horas_update on public.banco_horas_movimentos for update to authenticated using ((select public.tem_permissao('rh.banco-horas', 'editar'))) with check ((select public.tem_permissao('rh.banco-horas', 'editar')));
create policy banco_horas_delete on public.banco_horas_movimentos for delete to authenticated using ((select public.tem_permissao('rh.banco-horas', 'editar')));
grant select, insert, update, delete on table public.banco_horas_movimentos to authenticated;

-- ---------- Permissões ----------
create temporary table _rh2_pares (recurso text, acao text) on commit drop;
insert into _rh2_pares (recurso, acao) values
  ('rh.ferias','ver'),('rh.ferias','criar'),('rh.ferias','editar'),('rh.ferias','excluir'),
  ('rh.ocorrencias','ver'),('rh.ocorrencias','criar'),('rh.ocorrencias','editar'),('rh.ocorrencias','excluir'),
  ('rh.epis','ver'),('rh.epis','criar'),('rh.epis','editar'),('rh.epis','excluir'),
  ('rh.documentos','ver'),('rh.documentos','criar'),('rh.documentos','editar'),('rh.documentos','excluir'),
  ('rh.banco-horas','ver'),('rh.banco-horas','criar'),('rh.banco-horas','editar');

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, r.recurso, r.acao from public.perfis p cross join _rh2_pares r
where p.nome in ('Admin', 'RH')
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, r.recurso, 'ver' from public.perfis p cross join _rh2_pares r
where p.nome = 'Gestor' and r.acao = 'ver'
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
join public.perfil_permissoes pp on pp.recurso in ('rh.ferias','rh.ocorrencias','rh.epis','rh.documentos','rh.banco-horas') and pp.perfil_id = p.id
on conflict (usuario_id, recurso, acao) do nothing;
