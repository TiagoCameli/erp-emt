-- =============================================================
-- Fase 5 / Migration: estrutura das Ordens de Serviço (manutenção)
-- ordens_servico + os_pecas (saída do almoxarifado) + os_mao_obra
-- (mecânico x horas) + os_terceiros (serviço externo -> financeiro) +
-- os_transicoes (histórico de status). Custo cai no centro de custo
-- Manutenção > Equipamento (etapa criada no cadastro do equipamento).
-- Escrita das transições e das peças SEMPRE via função definer.
-- =============================================================

create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  equipamento_id uuid not null references public.equipamentos(id),
  centro_custo_id uuid references public.centros_custo(id),
  tipo text not null check (tipo in ('corretiva', 'preventiva')),
  status text not null default 'aberta' check (status in ('aberta', 'em_execucao', 'concluida', 'cancelada')),
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  descricao text not null,
  horimetro_abertura numeric(14, 2),
  km_abertura numeric(14, 2),
  horimetro_fechamento numeric(14, 2),
  km_fechamento numeric(14, 2),
  data_abertura date not null default (now() at time zone 'America/Rio_Branco')::date,
  data_conclusao date,
  custo_pecas numeric(14, 2) not null default 0,
  custo_mao_obra numeric(14, 2) not null default 0,
  custo_terceiros numeric(14, 2) not null default 0,
  custo_total numeric(14, 2) not null default 0,
  origem text not null default 'manual' check (origem in ('manual', 'preventiva', 'checklist')),
  origem_id uuid,
  motivo_cancelamento text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.ordens_servico is 'Ordens de serviço de manutenção. Custo cai em Manutenção > Equipamento.';
create index idx_os_equipamento on public.ordens_servico (equipamento_id);
create index idx_os_status on public.ordens_servico (status);
create index idx_os_cc on public.ordens_servico (centro_custo_id);
create index idx_os_data on public.ordens_servico (data_abertura desc);
create trigger trg_os_updated_at before update on public.ordens_servico for each row execute function public.fn_set_updated_at();
create trigger trg_os_created_by before insert on public.ordens_servico for each row execute function public.fn_set_created_by();
create trigger trg_audit_os after insert or update or delete on public.ordens_servico for each row execute function public.fn_audit();
alter table public.ordens_servico enable row level security;
create policy os_select on public.ordens_servico for select to authenticated using (
  (select public.tem_permissao('manutencao.ordens-servico', 'ver'))
  or (select public.tem_permissao('manutencao.painel', 'ver'))
);
create policy os_update on public.ordens_servico for update to authenticated
  using ((select public.tem_permissao('manutencao.ordens-servico', 'editar')))
  with check ((select public.tem_permissao('manutencao.ordens-servico', 'editar')));
-- Insert e mudança de status/custos só via função definer. Update direto
-- limitado às colunas editáveis à mão (o grant de coluna restringe o resto).
grant select on table public.ordens_servico to authenticated;
grant update (descricao, prioridade, observacao, horimetro_abertura, km_abertura) on table public.ordens_servico to authenticated;

create table public.os_pecas (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id),
  insumo_id uuid not null references public.insumos(id),
  deposito_id uuid not null references public.depositos(id),
  movimento_id uuid references public.estoque_movimentos(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  custo_unitario numeric(14, 4) not null default 0,
  custo_total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.os_pecas is 'Peças aplicadas na OS, baixadas do almoxarifado por PEPS. Só via função definer.';
create index idx_os_pecas_os on public.os_pecas (ordem_servico_id);
create index idx_os_pecas_insumo on public.os_pecas (insumo_id);
create trigger trg_audit_os_pecas after insert or update or delete on public.os_pecas for each row execute function public.fn_audit();
alter table public.os_pecas enable row level security;
create policy os_pecas_select on public.os_pecas for select to authenticated using (
  (select public.tem_permissao('manutencao.ordens-servico', 'ver'))
);
grant select on table public.os_pecas to authenticated;

create table public.os_mao_obra (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id),
  colaborador_id uuid not null references public.colaboradores(id),
  horas numeric(14, 2) not null check (horas > 0),
  valor_hora numeric(14, 2) not null default 0 check (valor_hora >= 0),
  custo_total numeric(14, 2) generated always as (round(horas * valor_hora, 2)) stored,
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.os_mao_obra is 'Mão de obra interna na OS (mecânico x horas x valor/hora). Custo gerencial.';
create index idx_os_mao_obra_os on public.os_mao_obra (ordem_servico_id);
create index idx_os_mao_obra_colab on public.os_mao_obra (colaborador_id);
create trigger trg_os_mao_obra_created_by before insert on public.os_mao_obra for each row execute function public.fn_set_created_by();
create trigger trg_audit_os_mao_obra after insert or update or delete on public.os_mao_obra for each row execute function public.fn_audit();
alter table public.os_mao_obra enable row level security;
create policy os_mao_obra_select on public.os_mao_obra for select to authenticated using (
  (select public.tem_permissao('manutencao.ordens-servico', 'ver'))
);
create policy os_mao_obra_insert on public.os_mao_obra for insert to authenticated
  with check ((select public.tem_permissao('manutencao.ordens-servico', 'editar')));
create policy os_mao_obra_delete on public.os_mao_obra for delete to authenticated
  using ((select public.tem_permissao('manutencao.ordens-servico', 'editar')));
grant select, insert, delete on table public.os_mao_obra to authenticated;

create table public.os_terceiros (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id),
  fornecedor_id uuid references public.fornecedores(id),
  descricao text not null,
  valor numeric(14, 2) not null check (valor >= 0),
  lancamento_id uuid references public.lancamentos(id),
  data_vencimento date,
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.os_terceiros is 'Serviço de terceiro na OS. Gera lançamento a pagar na conclusão.';
create index idx_os_terceiros_os on public.os_terceiros (ordem_servico_id);
create index idx_os_terceiros_fornecedor on public.os_terceiros (fornecedor_id);
create trigger trg_os_terceiros_created_by before insert on public.os_terceiros for each row execute function public.fn_set_created_by();
create trigger trg_audit_os_terceiros after insert or update or delete on public.os_terceiros for each row execute function public.fn_audit();
alter table public.os_terceiros enable row level security;
create policy os_terceiros_select on public.os_terceiros for select to authenticated using (
  (select public.tem_permissao('manutencao.ordens-servico', 'ver'))
);
create policy os_terceiros_insert on public.os_terceiros for insert to authenticated
  with check ((select public.tem_permissao('manutencao.ordens-servico', 'editar')));
create policy os_terceiros_delete on public.os_terceiros for delete to authenticated
  using ((select public.tem_permissao('manutencao.ordens-servico', 'editar')));
grant select, insert, delete on table public.os_terceiros to authenticated;

create table public.os_transicoes (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id),
  de_status text,
  para_status text not null,
  motivo text,
  usuario_id uuid,
  criado_em timestamptz not null default now()
);
comment on table public.os_transicoes is 'Histórico de transições de status da OS. Escrito pelas funções definer.';
create index idx_os_transicoes_os on public.os_transicoes (ordem_servico_id, criado_em desc);
alter table public.os_transicoes enable row level security;
create policy os_transicoes_select on public.os_transicoes for select to authenticated using (
  (select public.tem_permissao('manutencao.ordens-servico', 'ver'))
);
grant select on table public.os_transicoes to authenticated;
