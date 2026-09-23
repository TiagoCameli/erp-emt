-- Fase 2 da migração do Gestão Obras: o banco da Manutenção.
-- Desenho: docs/FASE2-MANUTENCAO.md. Decisões do Tiago de 23/09/2026:
--   - OS aberta → em execução → concluída, mais cancelada; dá para registrar já concluída
--     (cria aberta, põe as linhas, conclui). Concluída volta a aberta só por reabrir, com motivo.
--   - OS em execução põe o equipamento em manutenção; sem OS em execução, ele volta a ativa.
--   - Custo da peça e do óleo: custo médio das entradas do depósito, congelado na linha da OS.
--   - Baixa real no almoxarifado, com trava de saldo e estorno ao tirar a linha ou cancelar.
--   - Serviço de terceiro exige fornecedor cadastrado.
-- NADA aqui gera lançamento, parcela ou rateio. Valores com 4 casas (CASAS_VALOR_OPERACIONAL).
-- Escrita só por RPC SECURITY DEFINER com tem_permissao; a tela nunca grava custo.

-- =====================================================================
-- 0. Quem vê Manutenção lê os cadastros que a OS mostra
-- =====================================================================

create or replace function public.fn_ve_manutencao()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.tem_permissao('manutencao.painel', 'ver')
      or public.tem_permissao('manutencao.servicos', 'ver')
      or public.tem_permissao('manutencao.almoxarifado', 'ver')
      or public.tem_permissao('manutencao.medicoes', 'ver')
      or public.tem_permissao('manutencao.tipos-oleo', 'ver');
$$;
revoke all on function public.fn_ve_manutencao() from public, anon;
grant execute on function public.fn_ve_manutencao() to authenticated;

-- Recriadas a partir da definição viva de 23/09/2026, com o mesmo papel, mais Manutenção.
drop policy if exists equipamentos_select on public.equipamentos;
create policy equipamentos_select on public.equipamentos for select to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'ver'))
      or (select public.fn_ve_manutencao()));

drop policy if exists fornecedores_select on public.fornecedores;
create policy fornecedores_select on public.fornecedores for select
  using ((select public.tem_permissao('cadastros.fornecedores', 'ver'))
      or (select public.tem_permissao('compras.ordens', 'ver'))
      or (select public.tem_permissao('compras.cotacoes', 'ver'))
      or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
      or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
      or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
      or (select public.tem_permissao('financeiro.recebimentos', 'ver'))
      or (select public.tem_permissao('financeiro.relatorios', 'ver'))
      or (select public.fn_ve_manutencao()));

drop policy if exists insumos_select on public.insumos;
create policy insumos_select on public.insumos for select
  using ((select public.tem_permissao('cadastros.insumos', 'ver'))
      or (select public.tem_permissao('compras.ordens', 'ver'))
      or (select public.tem_permissao('compras.cotacoes', 'ver'))
      or (select public.tem_permissao('financeiro.relatorios', 'ver'))
      or (select public.fn_ve_manutencao()));

drop policy if exists centros_custo_select on public.centros_custo;
create policy centros_custo_select on public.centros_custo for select
  using ((select public.tem_permissao('cadastros.centros-custo', 'ver'))
      or (select public.tem_permissao('compras.ordens', 'ver'))
      or (select public.tem_permissao('compras.cotacoes', 'ver'))
      or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
      or (select public.tem_permissao('financeiro.recebimentos', 'ver'))
      or (select public.tem_permissao('financeiro.relatorios', 'ver'))
      or (select public.tem_permissao('rh.folha', 'ver'))
      or (select public.tem_permissao('cadastros.colaboradores', 'ver'))
      or (select public.fn_ve_manutencao()));

drop policy if exists unidades_medida_select on public.unidades_medida;
create policy unidades_medida_select on public.unidades_medida for select to authenticated
  using ((select public.tem_permissao('cadastros.unidades', 'ver'))
      or (select public.fn_ve_manutencao()));

-- =====================================================================
-- 1. Tipos de óleo (cadastro da Manutenção)
-- =====================================================================

create table if not exists public.tipos_oleo (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  aplicacao text not null default 'outro'
    check (aplicacao in ('motor', 'hidraulico', 'transmissao', 'diferencial', 'graxa', 'outro')),
  intervalo_meses integer check (intervalo_meses is null or intervalo_meses > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint tipos_oleo_nome_nao_vazio check (btrim(nome) <> '')
);
create unique index if not exists uq_tipos_oleo_nome on public.tipos_oleo (public.fn_chave_nome(nome));
alter table public.tipos_oleo enable row level security;
create policy tipos_oleo_select on public.tipos_oleo for select to authenticated
  using ((select public.fn_ve_manutencao()));
create policy tipos_oleo_insert on public.tipos_oleo for insert to authenticated
  with check ((select public.tem_permissao('manutencao.tipos-oleo', 'criar')));
create policy tipos_oleo_update on public.tipos_oleo for update to authenticated
  using ((select public.tem_permissao('manutencao.tipos-oleo', 'editar')))
  with check ((select public.tem_permissao('manutencao.tipos-oleo', 'editar')));
revoke all on public.tipos_oleo from anon, authenticated;
grant select, insert, update on public.tipos_oleo to authenticated;
create trigger trg_tipos_oleo_updated_at before update on public.tipos_oleo for each row execute function public.fn_set_updated_at();
create trigger trg_set_created_by before insert on public.tipos_oleo for each row execute function public.fn_set_created_by();
create trigger trg_audit_tipos_oleo after insert or delete or update on public.tipos_oleo for each row execute function public.fn_audit();

-- =====================================================================
-- 2. Almoxarifado: depósitos, itens, entradas, saídas, saldos
-- =====================================================================

create table if not exists public.almoxarifado_depositos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint almoxarifado_depositos_nome_nao_vazio check (btrim(nome) <> '')
);
create unique index if not exists uq_almoxarifado_depositos_nome on public.almoxarifado_depositos (public.fn_chave_nome(nome));
alter table public.almoxarifado_depositos enable row level security;
create policy almoxarifado_depositos_select on public.almoxarifado_depositos for select to authenticated
  using ((select public.fn_ve_manutencao()));
create policy almoxarifado_depositos_insert on public.almoxarifado_depositos for insert to authenticated
  with check ((select public.tem_permissao('manutencao.almoxarifado', 'criar')));
create policy almoxarifado_depositos_update on public.almoxarifado_depositos for update to authenticated
  using ((select public.tem_permissao('manutencao.almoxarifado', 'editar')))
  with check ((select public.tem_permissao('manutencao.almoxarifado', 'editar')));
revoke all on public.almoxarifado_depositos from anon, authenticated;
grant select, insert, update on public.almoxarifado_depositos to authenticated;
create trigger trg_almox_depositos_updated_at before update on public.almoxarifado_depositos for each row execute function public.fn_set_updated_at();
create trigger trg_set_created_by before insert on public.almoxarifado_depositos for each row execute function public.fn_set_created_by();
create trigger trg_audit_almoxarifado_depositos after insert or delete or update on public.almoxarifado_depositos for each row execute function public.fn_audit();

-- A peça no almoxarifado. O insumo é do ERP; aqui fica o que só a manutenção usa.
create table if not exists public.almoxarifado_itens (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null unique references public.insumos(id),
  tipo_oleo_id uuid references public.tipos_oleo(id),
  estoque_minimo numeric(14,4) check (estoque_minimo is null or estoque_minimo >= 0),
  estoque_maximo numeric(14,4) check (estoque_maximo is null or estoque_maximo >= 0),
  equipamento_ids uuid[] not null default '{}',
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_almoxarifado_itens_tipo_oleo on public.almoxarifado_itens (tipo_oleo_id) where tipo_oleo_id is not null;
alter table public.almoxarifado_itens enable row level security;
create policy almoxarifado_itens_select on public.almoxarifado_itens for select to authenticated
  using ((select public.fn_ve_manutencao()));
create policy almoxarifado_itens_insert on public.almoxarifado_itens for insert to authenticated
  with check ((select public.tem_permissao('manutencao.almoxarifado', 'criar')));
create policy almoxarifado_itens_update on public.almoxarifado_itens for update to authenticated
  using ((select public.tem_permissao('manutencao.almoxarifado', 'editar')))
  with check ((select public.tem_permissao('manutencao.almoxarifado', 'editar')));
revoke all on public.almoxarifado_itens from anon, authenticated;
grant select, insert, update on public.almoxarifado_itens to authenticated;
create trigger trg_almox_itens_updated_at before update on public.almoxarifado_itens for each row execute function public.fn_set_updated_at();
create trigger trg_set_created_by before insert on public.almoxarifado_itens for each row execute function public.fn_set_created_by();
create trigger trg_audit_almoxarifado_itens after insert or delete or update on public.almoxarifado_itens for each row execute function public.fn_audit();

create table if not exists public.almoxarifado_entradas (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references public.almoxarifado_depositos(id),
  insumo_id uuid not null references public.insumos(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  nota_fiscal text,
  data date not null,
  quantidade numeric(14,4) not null check (quantidade > 0),
  valor_unitario numeric(14,4) not null check (valor_unitario >= 0),
  valor_total numeric(14,4) not null check (valor_total >= 0),
  observacoes text,
  origem text not null default 'manual' check (origem in ('manual', 'migracao')),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_almox_entradas_saldo on public.almoxarifado_entradas (deposito_id, insumo_id) where excluido_em is null;
create index if not exists idx_almox_entradas_data on public.almoxarifado_entradas (data desc);
create index if not exists idx_almox_entradas_fornecedor on public.almoxarifado_entradas (fornecedor_id);
alter table public.almoxarifado_entradas enable row level security;
create policy almoxarifado_entradas_select on public.almoxarifado_entradas for select to authenticated
  using ((select public.fn_ve_manutencao()));
revoke all on public.almoxarifado_entradas from anon, authenticated;
grant select on public.almoxarifado_entradas to authenticated;
create trigger trg_almox_entradas_updated_at before update on public.almoxarifado_entradas for each row execute function public.fn_set_updated_at();
create trigger trg_audit_almoxarifado_entradas after insert or delete or update on public.almoxarifado_entradas for each row execute function public.fn_audit();

-- Saída do almoxarifado para a OS. Estornada, a linha fica (histórico) e para de contar.
create table if not exists public.almoxarifado_saidas (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references public.almoxarifado_depositos(id),
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  custo_unitario numeric(14,4) not null check (custo_unitario >= 0),
  valor_total numeric(14,4) not null check (valor_total >= 0),
  ordem_servico_id uuid not null,
  motivo text not null check (motivo in ('os_peca', 'os_oleo')),
  estornada_em timestamptz,
  estornada_por uuid references public.usuarios(id),
  motivo_estorno text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_almox_saidas_saldo on public.almoxarifado_saidas (deposito_id, insumo_id) where estornada_em is null;
create index if not exists idx_almox_saidas_os on public.almoxarifado_saidas (ordem_servico_id);
alter table public.almoxarifado_saidas enable row level security;
create policy almoxarifado_saidas_select on public.almoxarifado_saidas for select to authenticated
  using ((select public.fn_ve_manutencao()));
revoke all on public.almoxarifado_saidas from anon, authenticated;
grant select on public.almoxarifado_saidas to authenticated;
create trigger trg_audit_almoxarifado_saidas after insert or delete or update on public.almoxarifado_saidas for each row execute function public.fn_audit();

-- Saldo e custo médio por depósito × insumo. Só o gatilho escreve.
create table if not exists public.almoxarifado_saldos (
  deposito_id uuid not null references public.almoxarifado_depositos(id),
  insumo_id uuid not null references public.insumos(id),
  quantidade_entradas numeric(14,4) not null default 0,
  valor_entradas numeric(14,4) not null default 0,
  quantidade_saidas numeric(14,4) not null default 0,
  saldo numeric(14,4) not null default 0,
  custo_medio numeric(18,8) not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (deposito_id, insumo_id),
  constraint almoxarifado_saldo_nao_negativo check (saldo >= 0)
);
comment on column public.almoxarifado_saldos.custo_medio is
  'Soma do valor das entradas ÷ soma das quantidades das entradas (regra do Gestão Obras, Tiago 23/09/2026).';
alter table public.almoxarifado_saldos enable row level security;
create policy almoxarifado_saldos_select on public.almoxarifado_saldos for select to authenticated
  using ((select public.fn_ve_manutencao()));
revoke all on public.almoxarifado_saldos from anon, authenticated;
grant select on public.almoxarifado_saldos to authenticated;

create or replace function public.fn_almox_recalcular_saldo(p_deposito uuid, p_insumo uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_qe numeric; v_ve numeric; v_qs numeric;
begin
  select coalesce(sum(quantidade), 0), coalesce(sum(valor_total), 0) into v_qe, v_ve
    from public.almoxarifado_entradas
   where deposito_id = p_deposito and insumo_id = p_insumo and excluido_em is null;
  select coalesce(sum(quantidade), 0) into v_qs
    from public.almoxarifado_saidas
   where deposito_id = p_deposito and insumo_id = p_insumo and estornada_em is null;

  insert into public.almoxarifado_saldos as s
    (deposito_id, insumo_id, quantidade_entradas, valor_entradas, quantidade_saidas, saldo, custo_medio, atualizado_em)
  values (p_deposito, p_insumo, v_qe, v_ve, v_qs, v_qe - v_qs,
          case when v_qe > 0 then v_ve / v_qe else 0 end, now())
  on conflict (deposito_id, insumo_id) do update set
    quantidade_entradas = excluded.quantidade_entradas,
    valor_entradas = excluded.valor_entradas,
    quantidade_saidas = excluded.quantidade_saidas,
    saldo = excluded.saldo,
    custo_medio = excluded.custo_medio,
    atualizado_em = excluded.atualizado_em;
exception when check_violation then
  raise exception 'Saldo insuficiente no almoxarifado: o saldo desta peça ficaria negativo (% de entrada, % de saída)', v_qe, v_qs
    using errcode = '23514';
end $$;
revoke all on function public.fn_almox_recalcular_saldo(uuid, uuid) from public, anon, authenticated;

create or replace function public.fn_almox_trg_recalcular()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fn_almox_recalcular_saldo(old.deposito_id, old.insumo_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fn_almox_recalcular_saldo(new.deposito_id, new.insumo_id);
  end if;
  return null;
end $$;
revoke all on function public.fn_almox_trg_recalcular() from public, anon, authenticated;

create trigger trg_almox_entradas_saldo after insert or update or delete on public.almoxarifado_entradas
  for each row execute function public.fn_almox_trg_recalcular();
create trigger trg_almox_saidas_saldo after insert or update or delete on public.almoxarifado_saidas
  for each row execute function public.fn_almox_trg_recalcular();

-- =====================================================================
-- 3. Ordens de serviço
-- =====================================================================

create table if not exists public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  numero_legado text unique,
  equipamento_id uuid not null references public.equipamentos(id),
  centro_custo_id uuid not null references public.centros_custo(id),
  tipo text not null check (tipo in ('preventiva', 'corretiva', 'preditiva', 'melhoria', 'garantia', 'recall',
    'troca_oleo', 'lubrificacao', 'pneu', 'solda', 'eletrica', 'revisao_geral', 'outro')),
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'critica')),
  status text not null default 'aberta' check (status in ('aberta', 'em_execucao', 'concluida', 'cancelada')),
  descricao text not null,
  defeito_reportado text,
  causa_raiz text,
  observacoes text,
  data_abertura date not null,
  data_inicio date,
  data_conclusao date,
  medicao_abertura numeric(14,4) check (medicao_abertura is null or medicao_abertura >= 0),
  medicao_conclusao numeric(14,4) check (medicao_conclusao is null or medicao_conclusao >= 0),
  custo_pecas numeric(14,4) not null default 0,
  custo_oleos numeric(14,4) not null default 0,
  custo_terceiros numeric(14,4) not null default 0,
  custo_total numeric(14,4) not null default 0,
  origem text not null default 'manual' check (origem in ('manual', 'celular', 'migracao')),
  id_cliente uuid unique,
  motivo_cancelamento text,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint ordens_servico_descricao_nao_vazia check (btrim(descricao) <> ''),
  constraint ordens_servico_concluida_tem_data check (status <> 'concluida' or data_conclusao is not null)
);
comment on column public.ordens_servico.id_cliente is
  'Id gerado no celular antes de enviar. A fila offline reenvia com o mesmo id e a RPC não duplica.';
create index if not exists idx_os_equipamento on public.ordens_servico (equipamento_id) where excluido_em is null;
create index if not exists idx_os_status on public.ordens_servico (status) where excluido_em is null;
create index if not exists idx_os_conclusao on public.ordens_servico (data_conclusao desc) where excluido_em is null;
create index if not exists idx_os_centro on public.ordens_servico (centro_custo_id);
alter table public.ordens_servico enable row level security;
create policy ordens_servico_select on public.ordens_servico for select to authenticated
  using ((select public.tem_permissao('manutencao.servicos', 'ver'))
      or (select public.tem_permissao('manutencao.painel', 'ver')));
revoke all on public.ordens_servico from anon, authenticated;
grant select on public.ordens_servico to authenticated;
create trigger trg_os_updated_at before update on public.ordens_servico for each row execute function public.fn_set_updated_at();
create trigger trg_audit_ordens_servico after insert or delete or update on public.ordens_servico for each row execute function public.fn_audit();

create table if not exists public.os_pecas (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id),
  insumo_id uuid not null references public.insumos(id),
  deposito_id uuid not null references public.almoxarifado_depositos(id),
  saida_id uuid not null unique references public.almoxarifado_saidas(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  custo_unitario numeric(14,4) not null check (custo_unitario >= 0),
  custo_total numeric(14,4) not null check (custo_total >= 0),
  observacoes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_os_pecas_os on public.os_pecas (ordem_servico_id);
create index if not exists idx_os_pecas_insumo on public.os_pecas (insumo_id);

create table if not exists public.os_oleos (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id),
  tipo_oleo_id uuid not null references public.tipos_oleo(id),
  insumo_id uuid not null references public.insumos(id),
  deposito_id uuid not null references public.almoxarifado_depositos(id),
  saida_id uuid not null unique references public.almoxarifado_saidas(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  unidade text not null default 'L' check (unidade in ('L', 'kg')),
  valor_unitario numeric(14,4) not null check (valor_unitario >= 0),
  valor_total numeric(14,4) not null check (valor_total >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_os_oleos_os on public.os_oleos (ordem_servico_id);
create index if not exists idx_os_oleos_tipo on public.os_oleos (tipo_oleo_id);

create table if not exists public.os_terceiros (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  descricao text not null,
  valor numeric(14,4) not null check (valor >= 0),
  nota_fiscal text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint os_terceiros_descricao_nao_vazia check (btrim(descricao) <> '')
);
create index if not exists idx_os_terceiros_os on public.os_terceiros (ordem_servico_id);
create index if not exists idx_os_terceiros_fornecedor on public.os_terceiros (fornecedor_id);

create table if not exists public.os_transicoes (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id),
  status_de text,
  status_para text not null,
  motivo text,
  usuario_id uuid references public.usuarios(id),
  criado_em timestamptz not null default now()
);
create index if not exists idx_os_transicoes_os on public.os_transicoes (ordem_servico_id, criado_em desc);

do $linhas$
declare t text;
begin
  foreach t in array array['os_pecas', 'os_oleos', 'os_terceiros', 'os_transicoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.tem_permissao(''manutencao.servicos'', ''ver'')) or (select public.tem_permissao(''manutencao.painel'', ''ver'')))', t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
  end loop;
end $linhas$;

alter table public.almoxarifado_saidas
  add constraint almoxarifado_saidas_os_fkey foreign key (ordem_servico_id) references public.ordens_servico(id);

-- Custo da OS: sempre a soma das linhas, por gatilho.
create or replace function public.fn_os_recalcular_custo(p_os uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_p numeric; v_o numeric; v_t numeric;
begin
  select coalesce(sum(custo_total), 0) into v_p from public.os_pecas where ordem_servico_id = p_os;
  select coalesce(sum(valor_total), 0) into v_o from public.os_oleos where ordem_servico_id = p_os;
  select coalesce(sum(valor), 0) into v_t from public.os_terceiros where ordem_servico_id = p_os;
  update public.ordens_servico
     set custo_pecas = v_p, custo_oleos = v_o, custo_terceiros = v_t, custo_total = v_p + v_o + v_t
   where id = p_os
     and (custo_pecas, custo_oleos, custo_terceiros, custo_total) is distinct from (v_p, v_o, v_t, v_p + v_o + v_t);
end $$;
revoke all on function public.fn_os_recalcular_custo(uuid) from public, anon, authenticated;

create or replace function public.fn_os_trg_linha_custo()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.fn_os_recalcular_custo(coalesce(new.ordem_servico_id, old.ordem_servico_id));
  return null;
end $$;
revoke all on function public.fn_os_trg_linha_custo() from public, anon, authenticated;

create trigger trg_os_pecas_custo after insert or update or delete on public.os_pecas for each row execute function public.fn_os_trg_linha_custo();
create trigger trg_os_oleos_custo after insert or update or delete on public.os_oleos for each row execute function public.fn_os_trg_linha_custo();
create trigger trg_os_terceiros_custo after insert or update or delete on public.os_terceiros for each row execute function public.fn_os_trg_linha_custo();

-- =====================================================================
-- 4. Status do equipamento acompanha a OS
-- =====================================================================

create table if not exists public.equipamento_status_historico (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id),
  status_de text,
  status_para text not null,
  motivo text,
  ordem_servico_id uuid references public.ordens_servico(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_equip_status_hist on public.equipamento_status_historico (equipamento_id, created_at desc);
alter table public.equipamento_status_historico enable row level security;
create policy equipamento_status_historico_select on public.equipamento_status_historico for select to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'ver')) or (select public.fn_ve_manutencao()));
revoke all on public.equipamento_status_historico from anon, authenticated;
grant select on public.equipamento_status_historico to authenticated;

-- Toda troca de status do equipamento, pela OS ou pelo cadastro, fica no histórico. Quem
-- troca pela OS deixa o motivo e a OS em app.status_motivo / app.status_os.
create or replace function public.fn_equipamento_trg_status_historico()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.equipamento_status_historico (equipamento_id, status_de, status_para, motivo, ordem_servico_id, created_by)
    values (new.id, old.status, new.status,
            coalesce(nullif(current_setting('app.status_motivo', true), ''), 'Alterado no cadastro'),
            nullif(current_setting('app.status_os', true), '')::uuid,
            (select auth.uid()));
  end if;
  return new;
end $$;
revoke all on function public.fn_equipamento_trg_status_historico() from public, anon, authenticated;
create trigger trg_equipamento_status_historico after update of status on public.equipamentos
  for each row execute function public.fn_equipamento_trg_status_historico();

create or replace function public.fn_os_sincronizar_equipamento(p_equipamento uuid, p_os uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_em_execucao boolean;
begin
  select status into v_status from public.equipamentos where id = p_equipamento;
  if v_status is null or v_status = 'fora_funcionamento' then return; end if;
  select exists (select 1 from public.ordens_servico
                  where equipamento_id = p_equipamento and status = 'em_execucao' and excluido_em is null)
    into v_em_execucao;
  perform set_config('app.status_motivo', p_motivo, true);
  perform set_config('app.status_os', p_os::text, true);
  if v_em_execucao and v_status <> 'em_manutencao' then
    update public.equipamentos set status = 'em_manutencao' where id = p_equipamento;
  elsif not v_em_execucao and v_status = 'em_manutencao' then
    update public.equipamentos set status = 'ativa' where id = p_equipamento;
  end if;
  perform set_config('app.status_motivo', '', true);
  perform set_config('app.status_os', '', true);
end $$;
revoke all on function public.fn_os_sincronizar_equipamento(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.fn_os_trg_status_equipamento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Só a entrada e a saída de "em execução" mexem no equipamento. Criar ou concluir uma OS que
  -- nunca esteve em execução não toca num equipamento posto em manutenção à mão.
  if (tg_op = 'INSERT' and new.status = 'em_execucao')
     or (tg_op = 'UPDATE' and (new.status = 'em_execucao' or old.status = 'em_execucao')
         and (new.status is distinct from old.status or new.excluido_em is distinct from old.excluido_em)) then
    perform public.fn_os_sincronizar_equipamento(new.equipamento_id, new.id,
      'OS ' || new.numero || ' ' || case when new.excluido_em is not null then 'excluída' else replace(new.status, '_', ' ') end);
  end if;
  return null;
end $$;
revoke all on function public.fn_os_trg_status_equipamento() from public, anon, authenticated;
create trigger trg_os_status_equipamento after insert or update of status, excluido_em on public.ordens_servico
  for each row execute function public.fn_os_trg_status_equipamento();

-- =====================================================================
-- 5. RPCs da OS
-- =====================================================================

create or replace function public.fn_os_registrar_transicao(p_os uuid, p_de text, p_para text, p_motivo text)
returns void language sql security definer set search_path to '' as $$
  insert into public.os_transicoes (ordem_servico_id, status_de, status_para, motivo, usuario_id)
  values (p_os, p_de, p_para, p_motivo, (select auth.uid()));
$$;
revoke all on function public.fn_os_registrar_transicao(uuid, text, text, text) from public, anon, authenticated;

-- Abre a OS (ou edita o cabeçalho de uma aberta/em execução). p_id nulo cria.
-- p_id_cliente: o celular manda o mesmo id em cada reenvio; a segunda chamada devolve a OS da
-- primeira, sem criar outra nem consumir número.
create or replace function public.fn_os_salvar(
  p_id uuid,
  p_equipamento uuid,
  p_centro_custo uuid,
  p_tipo text,
  p_prioridade text,
  p_descricao text,
  p_defeito text,
  p_causa text,
  p_observacoes text,
  p_data_abertura date,
  p_medicao_abertura numeric,
  p_origem text default 'manual',
  p_id_cliente uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid; v_status text; v_cc uuid; v_propriedade text; v_ativo boolean;
begin
  if coalesce(btrim(p_descricao), '') = '' then raise exception 'Descreva o serviço'; end if;

  select e.propriedade, e.ativo into v_propriedade, v_ativo from public.equipamentos e where e.id = p_equipamento;
  if v_propriedade is null then raise exception 'Equipamento não encontrado'; end if;

  -- Centro de custo: a etapa do equipamento. Alugado não tem etapa e exige a obra.
  select id into v_cc from public.centros_custo where equipamento_id = p_equipamento;
  if v_cc is null then
    v_cc := p_centro_custo;
    if v_cc is null then
      raise exception 'Equipamento alugado não tem centro de custo próprio: escolha a obra onde ele trabalha';
    end if;
  end if;

  if p_id is null then
    if not public.tem_permissao('manutencao.servicos', 'criar') then
      raise exception 'Sem permissão para abrir ordem de serviço';
    end if;
    if not v_ativo then raise exception 'Equipamento inativo: reative no cadastro antes de abrir OS'; end if;

    if p_id_cliente is not null then
      select id into v_id from public.ordens_servico where id_cliente = p_id_cliente;
      if v_id is not null then return v_id; end if;
    end if;

    insert into public.ordens_servico (numero, equipamento_id, centro_custo_id, tipo, prioridade, descricao,
      defeito_reportado, causa_raiz, observacoes, data_abertura, medicao_abertura, origem, id_cliente, created_by)
    values (public.proximo_numero_documento('OS'), p_equipamento, v_cc, p_tipo, coalesce(p_prioridade, 'media'),
      btrim(p_descricao), nullif(btrim(p_defeito), ''), nullif(btrim(p_causa), ''), nullif(btrim(p_observacoes), ''),
      coalesce(p_data_abertura, (now() at time zone 'America/Rio_Branco')::date), p_medicao_abertura,
      coalesce(p_origem, 'manual'), p_id_cliente, (select auth.uid()))
    returning id into v_id;
    perform public.fn_os_registrar_transicao(v_id, null, 'aberta', null);
    return v_id;
  end if;

  if not public.tem_permissao('manutencao.servicos', 'editar') then
    raise exception 'Sem permissão para editar ordem de serviço';
  end if;
  select status into v_status from public.ordens_servico where id = p_id and excluido_em is null;
  if v_status is null then raise exception 'OS não encontrada'; end if;
  if v_status not in ('aberta', 'em_execucao') then
    raise exception 'OS % não pode ser editada: reabra antes', v_status;
  end if;
  if exists (select 1 from public.ordens_servico where id = p_id and equipamento_id <> p_equipamento)
     and (exists (select 1 from public.os_pecas where ordem_servico_id = p_id)
       or exists (select 1 from public.os_oleos where ordem_servico_id = p_id)) then
    raise exception 'Não dá para trocar o equipamento de uma OS que já tem peça ou óleo';
  end if;

  update public.ordens_servico set
    equipamento_id = p_equipamento, centro_custo_id = v_cc, tipo = p_tipo,
    prioridade = coalesce(p_prioridade, prioridade), descricao = btrim(p_descricao),
    defeito_reportado = nullif(btrim(p_defeito), ''), causa_raiz = nullif(btrim(p_causa), ''),
    observacoes = nullif(btrim(p_observacoes), ''), data_abertura = coalesce(p_data_abertura, data_abertura),
    medicao_abertura = p_medicao_abertura
  where id = p_id;
  return p_id;
end $$;

create or replace function public.fn_os_iniciar(p_os uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  if not public.tem_permissao('manutencao.servicos', 'editar') then raise exception 'Sem permissão'; end if;
  select status into v_status from public.ordens_servico where id = p_os and excluido_em is null for update;
  if v_status is null then raise exception 'OS não encontrada'; end if;
  if v_status <> 'aberta' then raise exception 'Só dá para iniciar uma OS aberta'; end if;
  update public.ordens_servico set status = 'em_execucao',
         data_inicio = coalesce(data_inicio, (now() at time zone 'America/Rio_Branco')::date)
   where id = p_os;
  perform public.fn_os_registrar_transicao(p_os, 'aberta', 'em_execucao', null);
end $$;

create or replace function public.fn_os_concluir(p_os uuid, p_data_conclusao date, p_medicao_conclusao numeric)
returns void language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  if not public.tem_permissao('manutencao.servicos', 'editar') then raise exception 'Sem permissão'; end if;
  if p_data_conclusao is null then raise exception 'Informe a data de conclusão'; end if;
  select status into v_status from public.ordens_servico where id = p_os and excluido_em is null for update;
  if v_status is null then raise exception 'OS não encontrada'; end if;
  if v_status not in ('aberta', 'em_execucao') then raise exception 'Só dá para concluir OS aberta ou em execução'; end if;
  update public.ordens_servico set status = 'concluida', data_conclusao = p_data_conclusao,
         data_inicio = coalesce(data_inicio, p_data_conclusao), medicao_conclusao = p_medicao_conclusao
   where id = p_os;
  perform public.fn_os_registrar_transicao(p_os, v_status, 'concluida', null);
end $$;

-- Reabrir é o "desaprovar" da OS: concluída volta a aberta, com motivo, para editar.
create or replace function public.fn_os_reabrir(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  if not public.tem_permissao('manutencao.servicos', 'editar') then raise exception 'Sem permissão'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo para reabrir'; end if;
  select status into v_status from public.ordens_servico where id = p_os and excluido_em is null for update;
  if v_status is null then raise exception 'OS não encontrada'; end if;
  if v_status <> 'concluida' then raise exception 'Só dá para reabrir OS concluída'; end if;
  update public.ordens_servico set status = 'aberta', data_conclusao = null, medicao_conclusao = null where id = p_os;
  perform public.fn_os_registrar_transicao(p_os, 'concluida', 'aberta', btrim(p_motivo));
end $$;

create or replace function public.fn_os_estornar_saidas(p_os uuid, p_motivo text)
returns void language sql security definer set search_path to '' as $$
  update public.almoxarifado_saidas
     set estornada_em = now(), estornada_por = (select auth.uid()), motivo_estorno = p_motivo
   where ordem_servico_id = p_os and estornada_em is null;
$$;
revoke all on function public.fn_os_estornar_saidas(uuid, text) from public, anon, authenticated;

-- Cancelar estorna as saídas do almoxarifado e tira as linhas (o custo zera). O que fica de
-- histórico: a saída estornada (peça, quantidade, custo, OS) e o audit_log das linhas.
create or replace function public.fn_os_cancelar(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  if not public.tem_permissao('manutencao.servicos', 'editar') then raise exception 'Sem permissão'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  select status into v_status from public.ordens_servico where id = p_os and excluido_em is null for update;
  if v_status is null then raise exception 'OS não encontrada'; end if;
  if v_status not in ('aberta', 'em_execucao') then raise exception 'Só dá para cancelar OS aberta ou em execução'; end if;
  perform public.fn_os_estornar_saidas(p_os, 'OS cancelada: ' || btrim(p_motivo));
  delete from public.os_pecas where ordem_servico_id = p_os;
  delete from public.os_oleos where ordem_servico_id = p_os;
  delete from public.os_terceiros where ordem_servico_id = p_os;
  update public.ordens_servico set status = 'cancelada', motivo_cancelamento = btrim(p_motivo) where id = p_os;
  perform public.fn_os_registrar_transicao(p_os, v_status, 'cancelada', btrim(p_motivo));
end $$;

-- Excluir (soft) só OS aberta ou cancelada; concluída precisa ser reaberta antes.
create or replace function public.fn_os_excluir(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  if not public.tem_permissao('manutencao.servicos', 'excluir') then raise exception 'Sem permissão para excluir OS'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da exclusão'; end if;
  select status into v_status from public.ordens_servico where id = p_os and excluido_em is null for update;
  if v_status is null then raise exception 'OS não encontrada'; end if;
  if v_status not in ('aberta', 'cancelada') then raise exception 'Só dá para excluir OS aberta ou cancelada'; end if;
  perform public.fn_os_estornar_saidas(p_os, 'OS excluída: ' || btrim(p_motivo));
  delete from public.os_pecas where ordem_servico_id = p_os;
  delete from public.os_oleos where ordem_servico_id = p_os;
  delete from public.os_terceiros where ordem_servico_id = p_os;
  update public.ordens_servico set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
   where id = p_os;
end $$;

create or replace function public.fn_os_exigir_editavel(p_os uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  if not public.tem_permissao('manutencao.servicos', 'editar') then raise exception 'Sem permissão para editar ordem de serviço'; end if;
  select status into v_status from public.ordens_servico where id = p_os and excluido_em is null for update;
  if v_status is null then raise exception 'OS não encontrada'; end if;
  if v_status not in ('aberta', 'em_execucao') then raise exception 'OS % não aceita linha nova: reabra antes', v_status; end if;
end $$;
revoke all on function public.fn_os_exigir_editavel(uuid) from public, anon, authenticated;

-- Baixa real: cria a saída com o custo médio do momento, congela na linha, checa o saldo.
create or replace function public.fn_os_baixar(p_os uuid, p_insumo uuid, p_deposito uuid, p_quantidade numeric, p_motivo text,
  out o_saida uuid, out o_custo_unitario numeric, out o_total numeric)
language plpgsql security definer set search_path to '' as $$
declare v_saldo numeric; v_medio numeric;
begin
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  if p_quantidade <> round(p_quantidade, 4) then raise exception 'Quantidade com no máximo 4 casas decimais'; end if;
  select saldo, custo_medio into v_saldo, v_medio from public.almoxarifado_saldos
   where deposito_id = p_deposito and insumo_id = p_insumo for update;
  if coalesce(v_saldo, 0) < p_quantidade then
    raise exception 'Saldo insuficiente no almoxarifado: disponível %, pedido %', coalesce(v_saldo, 0), p_quantidade
      using errcode = '23514';
  end if;
  o_custo_unitario := round(v_medio, 4);
  o_total := round(p_quantidade * o_custo_unitario, 4);
  insert into public.almoxarifado_saidas (deposito_id, insumo_id, quantidade, custo_unitario, valor_total, ordem_servico_id, motivo, created_by)
  values (p_deposito, p_insumo, p_quantidade, o_custo_unitario, o_total, p_os, p_motivo, (select auth.uid()))
  returning id into o_saida;
end $$;
revoke all on function public.fn_os_baixar(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;

create or replace function public.fn_os_adicionar_peca(p_os uuid, p_insumo uuid, p_deposito uuid, p_quantidade numeric, p_observacoes text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_b record; v_id uuid;
begin
  perform public.fn_os_exigir_editavel(p_os);
  select * into v_b from public.fn_os_baixar(p_os, p_insumo, p_deposito, p_quantidade, 'os_peca');
  insert into public.os_pecas (ordem_servico_id, insumo_id, deposito_id, saida_id, quantidade, custo_unitario, custo_total, observacoes, created_by)
  values (p_os, p_insumo, p_deposito, v_b.o_saida, p_quantidade, v_b.o_custo_unitario, v_b.o_total, nullif(btrim(p_observacoes), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.fn_os_adicionar_oleo(p_os uuid, p_tipo_oleo uuid, p_insumo uuid, p_deposito uuid, p_quantidade numeric, p_unidade text default 'L')
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_b record; v_id uuid;
begin
  perform public.fn_os_exigir_editavel(p_os);
  if not exists (select 1 from public.tipos_oleo where id = p_tipo_oleo and ativo) then raise exception 'Tipo de óleo inválido'; end if;
  select * into v_b from public.fn_os_baixar(p_os, p_insumo, p_deposito, p_quantidade, 'os_oleo');
  insert into public.os_oleos (ordem_servico_id, tipo_oleo_id, insumo_id, deposito_id, saida_id, quantidade, unidade, valor_unitario, valor_total, created_by)
  values (p_os, p_tipo_oleo, p_insumo, p_deposito, v_b.o_saida, p_quantidade, coalesce(p_unidade, 'L'), v_b.o_custo_unitario, v_b.o_total, (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

-- Tirar a linha estorna a saída dela.
create or replace function public.fn_os_remover_linha(p_tipo text, p_linha uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_os uuid; v_saida uuid;
begin
  if p_tipo = 'peca' then
    select ordem_servico_id, saida_id into v_os, v_saida from public.os_pecas where id = p_linha;
  elsif p_tipo = 'oleo' then
    select ordem_servico_id, saida_id into v_os, v_saida from public.os_oleos where id = p_linha;
  elsif p_tipo = 'terceiro' then
    select ordem_servico_id into v_os from public.os_terceiros where id = p_linha;
  else
    raise exception 'Tipo de linha inválido';
  end if;
  if v_os is null then raise exception 'Linha não encontrada'; end if;
  perform public.fn_os_exigir_editavel(v_os);
  if p_tipo = 'peca' then delete from public.os_pecas where id = p_linha;
  elsif p_tipo = 'oleo' then delete from public.os_oleos where id = p_linha;
  else delete from public.os_terceiros where id = p_linha;
  end if;
  if v_saida is not null then
    update public.almoxarifado_saidas set estornada_em = now(), estornada_por = (select auth.uid()), motivo_estorno = 'Linha removida da OS'
     where id = v_saida and estornada_em is null;
  end if;
end $$;

create or replace function public.fn_os_adicionar_terceiro(p_os uuid, p_fornecedor uuid, p_descricao text, p_valor numeric, p_nota_fiscal text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  perform public.fn_os_exigir_editavel(p_os);
  if p_fornecedor is null then raise exception 'Escolha o fornecedor do serviço'; end if;
  if coalesce(btrim(p_descricao), '') = '' then raise exception 'Descreva o serviço do terceiro'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Valor inválido'; end if;
  if p_valor <> round(p_valor, 4) then raise exception 'Valor com no máximo 4 casas decimais'; end if;
  insert into public.os_terceiros (ordem_servico_id, fornecedor_id, descricao, valor, nota_fiscal, created_by)
  values (p_os, p_fornecedor, btrim(p_descricao), p_valor, nullif(btrim(p_nota_fiscal), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
-- 6. RPCs do almoxarifado
-- =====================================================================

-- Uma NF com N itens: p_itens = [{"insumo_id": "...", "quantidade": 10, "valor_unitario": 6.3947}, ...]
create or replace function public.fn_almox_registrar_entrada(
  p_deposito uuid, p_fornecedor uuid, p_nota_fiscal text, p_data date, p_itens jsonb, p_observacoes text default null)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_item jsonb; v_q numeric; v_u numeric; v_n integer := 0;
begin
  if not public.tem_permissao('manutencao.almoxarifado', 'criar') then raise exception 'Sem permissão para registrar entrada'; end if;
  if p_deposito is null or p_fornecedor is null or p_data is null then raise exception 'Depósito, fornecedor e data são obrigatórios'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Informe ao menos um item'; end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_q := (v_item->>'quantidade')::numeric;
    v_u := (v_item->>'valor_unitario')::numeric;
    if v_q is null or v_q <= 0 or v_q <> round(v_q, 4) then raise exception 'Quantidade inválida (maior que zero, até 4 casas)'; end if;
    if v_u is null or v_u < 0 or v_u <> round(v_u, 4) then raise exception 'Valor unitário inválido (não negativo, até 4 casas)'; end if;
    insert into public.almoxarifado_entradas (deposito_id, insumo_id, fornecedor_id, nota_fiscal, data, quantidade, valor_unitario, valor_total, observacoes, created_by)
    values (p_deposito, (v_item->>'insumo_id')::uuid, p_fornecedor, nullif(btrim(p_nota_fiscal), ''), p_data, v_q, v_u, round(v_q * v_u, 4),
            nullif(btrim(p_observacoes), ''), (select auth.uid()));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Editar ou excluir uma entrada passa pela trava de saldo do gatilho (saldo não fica negativo).
create or replace function public.fn_almox_editar_entrada(
  p_id uuid, p_quantidade numeric, p_valor_unitario numeric, p_data date, p_nota_fiscal text, p_fornecedor uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.tem_permissao('manutencao.almoxarifado', 'editar') then raise exception 'Sem permissão para editar entrada'; end if;
  if p_quantidade is null or p_quantidade <= 0 or p_quantidade <> round(p_quantidade, 4) then raise exception 'Quantidade inválida'; end if;
  if p_valor_unitario is null or p_valor_unitario < 0 or p_valor_unitario <> round(p_valor_unitario, 4) then raise exception 'Valor unitário inválido'; end if;
  update public.almoxarifado_entradas set quantidade = p_quantidade, valor_unitario = p_valor_unitario,
         valor_total = round(p_quantidade * p_valor_unitario, 4), data = coalesce(p_data, data),
         nota_fiscal = nullif(btrim(p_nota_fiscal), ''), fornecedor_id = coalesce(p_fornecedor, fornecedor_id)
   where id = p_id and excluido_em is null;
  if not found then raise exception 'Entrada não encontrada'; end if;
end $$;

create or replace function public.fn_almox_excluir_entrada(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.tem_permissao('manutencao.almoxarifado', 'excluir') then raise exception 'Sem permissão para excluir entrada'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da exclusão'; end if;
  update public.almoxarifado_entradas set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
   where id = p_id and excluido_em is null;
  if not found then raise exception 'Entrada não encontrada'; end if;
end $$;

-- =====================================================================
-- 7. Horímetro e km (fila offline idempotente)
-- =====================================================================

create table if not exists public.equipamento_medicoes (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id),
  data date not null,
  tipo text not null check (tipo in ('horimetro', 'km')),
  valor numeric(14,4) not null check (valor >= 0),
  origem text not null default 'manual' check (origem in ('manual', 'celular', 'os', 'migracao')),
  ordem_servico_id uuid references public.ordens_servico(id),
  id_cliente uuid unique,
  observacoes text,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_equip_medicoes on public.equipamento_medicoes (equipamento_id, data desc) where excluido_em is null;
alter table public.equipamento_medicoes enable row level security;
create policy equipamento_medicoes_select on public.equipamento_medicoes for select to authenticated
  using ((select public.fn_ve_manutencao()));
revoke all on public.equipamento_medicoes from anon, authenticated;
grant select on public.equipamento_medicoes to authenticated;
create trigger trg_equip_medicoes_updated_at before update on public.equipamento_medicoes for each row execute function public.fn_set_updated_at();
create trigger trg_audit_equipamento_medicoes after insert or delete or update on public.equipamento_medicoes for each row execute function public.fn_audit();

-- Lança a leitura. Leitura menor que a última não é recusada (troca de painel acontece): a
-- tela avisa. O tipo vem do cadastro do equipamento.
create or replace function public.fn_registrar_medicao(p_equipamento uuid, p_data date, p_valor numeric,
  p_origem text default 'manual', p_id_cliente uuid default null, p_observacoes text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_controle text; v_id uuid;
begin
  if not public.tem_permissao('manutencao.medicoes', 'criar') then raise exception 'Sem permissão para lançar horímetro ou km'; end if;
  if p_id_cliente is not null then
    select id into v_id from public.equipamento_medicoes where id_cliente = p_id_cliente;
    if v_id is not null then return v_id; end if;
  end if;
  select controle_por into v_controle from public.equipamentos where id = p_equipamento;
  if v_controle is null then raise exception 'Equipamento não encontrado'; end if;
  if v_controle not in ('horimetro', 'km') then raise exception 'Este equipamento não controla horímetro nem km'; end if;
  if p_data is null then raise exception 'Informe a data da leitura'; end if;
  if p_data > (now() at time zone 'America/Rio_Branco')::date + 1 then raise exception 'Data da leitura no futuro'; end if;
  if p_valor is null or p_valor < 0 or p_valor <> round(p_valor, 4) then raise exception 'Leitura inválida'; end if;
  insert into public.equipamento_medicoes (equipamento_id, data, tipo, valor, origem, id_cliente, observacoes, created_by)
  values (p_equipamento, p_data, v_controle, p_valor, coalesce(p_origem, 'manual'), p_id_cliente, nullif(btrim(p_observacoes), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.fn_editar_medicao(p_id uuid, p_data date, p_valor numeric, p_observacoes text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.tem_permissao('manutencao.medicoes', 'editar') then raise exception 'Sem permissão para editar leitura'; end if;
  if p_valor is null or p_valor < 0 or p_valor <> round(p_valor, 4) then raise exception 'Leitura inválida'; end if;
  update public.equipamento_medicoes set data = coalesce(p_data, data), valor = p_valor, observacoes = nullif(btrim(p_observacoes), '')
   where id = p_id and excluido_em is null;
  if not found then raise exception 'Leitura não encontrada'; end if;
end $$;

-- =====================================================================
-- 8. Grants das RPCs públicas (revoke do PUBLIC na mesma transação)
-- =====================================================================

do $grants$
declare f text;
begin
  foreach f in array array[
    'public.fn_os_salvar(uuid, uuid, uuid, text, text, text, text, text, text, date, numeric, text, uuid)',
    'public.fn_os_iniciar(uuid)',
    'public.fn_os_concluir(uuid, date, numeric)',
    'public.fn_os_reabrir(uuid, text)',
    'public.fn_os_cancelar(uuid, text)',
    'public.fn_os_excluir(uuid, text)',
    'public.fn_os_adicionar_peca(uuid, uuid, uuid, numeric, text)',
    'public.fn_os_adicionar_oleo(uuid, uuid, uuid, uuid, numeric, text)',
    'public.fn_os_remover_linha(text, uuid)',
    'public.fn_os_adicionar_terceiro(uuid, uuid, text, numeric, text)',
    'public.fn_almox_registrar_entrada(uuid, uuid, text, date, jsonb, text)',
    'public.fn_almox_editar_entrada(uuid, numeric, numeric, date, text, uuid)',
    'public.fn_almox_excluir_entrada(uuid, text)',
    'public.fn_registrar_medicao(uuid, date, numeric, text, uuid, text)',
    'public.fn_editar_medicao(uuid, date, numeric, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $grants$;

-- =====================================================================
-- 9. Lixeira e permissões
-- =====================================================================

create or replace function public.fn_recurso_do_cadastro(p_tabela text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case p_tabela
    when 'unidades_medida'   then 'cadastros.unidades'
    when 'categorias_insumo' then 'cadastros.categorias'
    when 'clientes'          then 'cadastros.clientes'
    when 'fornecedores'      then 'cadastros.fornecedores'
    when 'insumos'           then 'cadastros.insumos'
    when 'depositos'         then 'cadastros.depositos'
    when 'colaboradores'     then 'cadastros.colaboradores'
    when 'obras'             then 'cadastros.obras'
    when 'centros_custo'     then 'cadastros.centros-custo'
    when 'funcoes'           then 'cadastros.funcoes'
    when 'jornadas'          then 'cadastros.jornadas'
    when 'folha_encargos'    then 'rh.encargos'
    when 'folha_provisoes'   then 'rh.encargos'
    when 'folha_inss_faixas' then 'rh.parametros-folha'
    when 'folha_irrf_faixas' then 'rh.parametros-folha'
    when 'localidades'       then 'cadastros.localidades'
    when 'tipos_oleo'        then 'manutencao.tipos-oleo'
    when 'almoxarifado_depositos' then 'manutencao.almoxarifado'
    else null
  end;
$function$;

-- Recurso novo nasce sem ninguém: perfil Admin e os 4 Admins ativos na mesma migration (4.3).
-- As permissões dos outros usuários o Tiago monta à mão (23/09/2026).
with acoes(recurso, acao) as (values
  ('manutencao.painel', 'ver'),
  ('manutencao.servicos', 'ver'), ('manutencao.servicos', 'criar'), ('manutencao.servicos', 'editar'), ('manutencao.servicos', 'excluir'),
  ('manutencao.almoxarifado', 'ver'), ('manutencao.almoxarifado', 'criar'), ('manutencao.almoxarifado', 'editar'), ('manutencao.almoxarifado', 'excluir'),
  ('manutencao.medicoes', 'ver'), ('manutencao.medicoes', 'criar'), ('manutencao.medicoes', 'editar'),
  ('manutencao.tipos-oleo', 'ver'), ('manutencao.tipos-oleo', 'criar'), ('manutencao.tipos-oleo', 'editar'), ('manutencao.tipos-oleo', 'excluir')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a
where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('manutencao.painel', 'ver'),
  ('manutencao.servicos', 'ver'), ('manutencao.servicos', 'criar'), ('manutencao.servicos', 'editar'), ('manutencao.servicos', 'excluir'),
  ('manutencao.almoxarifado', 'ver'), ('manutencao.almoxarifado', 'criar'), ('manutencao.almoxarifado', 'editar'), ('manutencao.almoxarifado', 'excluir'),
  ('manutencao.medicoes', 'ver'), ('manutencao.medicoes', 'criar'), ('manutencao.medicoes', 'editar'),
  ('manutencao.tipos-oleo', 'ver'), ('manutencao.tipos-oleo', 'criar'), ('manutencao.tipos-oleo', 'editar'), ('manutencao.tipos-oleo', 'excluir')
)
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, a.recurso, a.acao
from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
cross join acoes a
where u.ativo and u.excluido_em is null
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v int;
begin
  select count(distinct usuario_id) into v from public.usuario_permissoes where recurso like 'manutencao.%';
  if v <> 4 then raise exception 'Manutenção foi para % usuários; o plano diz 4 Admins ativos', v; end if;
  select count(*) into v from public.usuario_permissoes where recurso like 'manutencao.%';
  if v <> 64 then raise exception 'Esperado 64 permissões de manutenção (16 x 4 Admins), veio %', v; end if;
end $confere$;
