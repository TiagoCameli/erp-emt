-- Bloco 2 / Task 1: tabela de dependentes do colaborador (1:N).
-- Sub-cadastro do colaborador -> gateado pelo recurso cadastros.colaboradores
-- (SEM recurso novo). Espelha exatamente o padrao de public.rh_documentos:
-- triggers (updated_at, created_by, audit), RLS on, 4 policies, grant explicito
-- ao authenticated (anon nao recebe DML).

create table public.rh_dependentes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  nome text not null,
  data_nascimento date,
  parentesco text check (parentesco in ('conjuge','companheiro','filho','enteado','tutelado','pai','mae','outro')),
  cpf text,
  dependente_irrf boolean not null default false,
  dependente_salario_familia boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.rh_dependentes is 'Dependentes do colaborador (IRRF/salario-familia). Sub-cadastro gateado por cadastros.colaboradores.';
create index idx_rh_dependentes_colab on public.rh_dependentes (colaborador_id);

create trigger trg_rh_dependentes_updated_at before update on public.rh_dependentes for each row execute function public.fn_set_updated_at();
create trigger trg_rh_dependentes_created_by before insert on public.rh_dependentes for each row execute function public.fn_set_created_by();
create trigger trg_audit_rh_dependentes after insert or update or delete on public.rh_dependentes for each row execute function public.fn_audit();

alter table public.rh_dependentes enable row level security;
create policy rh_dependentes_select on public.rh_dependentes for select to authenticated using ((select public.tem_permissao('cadastros.colaboradores', 'ver')));
create policy rh_dependentes_insert on public.rh_dependentes for insert to authenticated with check ((select public.tem_permissao('cadastros.colaboradores', 'criar')));
create policy rh_dependentes_update on public.rh_dependentes for update to authenticated using ((select public.tem_permissao('cadastros.colaboradores', 'editar'))) with check ((select public.tem_permissao('cadastros.colaboradores', 'editar')));
create policy rh_dependentes_delete on public.rh_dependentes for delete to authenticated using ((select public.tem_permissao('cadastros.colaboradores', 'excluir')));
grant select, insert, update, delete on table public.rh_dependentes to authenticated;

-- ============================================================================
-- ROLLBACK (executar manualmente para desfazer):
-- ----------------------------------------------------------------------------
-- drop table if exists public.rh_dependentes;
-- ============================================================================
