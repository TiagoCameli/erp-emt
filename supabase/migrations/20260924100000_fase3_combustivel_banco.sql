-- Fase 3a: o banco do Combustível (desenho em docs/FASE3-COMBUSTIVEL.md).
--
-- Dinheiro e saldo iguais ao Gestão Obras (decisão do Tiago, 22/09): PEPS, preço, travas e
-- conta corrente portados do banco vivo da origem (private.recompute_fifo_tanque,
-- saldo_min_tanque, inicio_ciclo_aberto, fn_saidas_combustivel_movimentos).
-- NADA aqui gera lançamento, parcela ou rateio.
--
-- Carga: com app.carga_combustivel = '1' os gatilhos de PEPS, nível, conta corrente, horímetro
-- e travas não rodam (plano, seção 8); fn_comb_recalcular_tudo() refaz depois, uma vez.

-- =====================================================================
-- 0. Quem vê o Combustível lê os cadastros que ele usa
-- =====================================================================

create or replace function public.fn_ve_combustivel()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.tem_permissao('combustivel.painel', 'ver')
      or public.tem_permissao('combustivel.tanques', 'ver')
      or public.tem_permissao('combustivel.entradas', 'ver')
      or public.tem_permissao('combustivel.saidas', 'ver')
      or public.tem_permissao('combustivel.transferencias', 'ver')
      or public.tem_permissao('combustivel.esvaziamentos', 'ver')
      or public.tem_permissao('combustivel.anomalias', 'ver')
      or public.tem_permissao('combustivel.relatorios', 'ver');
$$;
revoke all on function public.fn_ve_combustivel() from public, anon;
grant execute on function public.fn_ve_combustivel() to authenticated;

create or replace function public.fn_comb_em_carga()
returns boolean language sql stable set search_path to '' as $$
  select coalesce(current_setting('app.carga_combustivel', true), '') = '1';
$$;

-- Alterado a partir das policies vivas (23/09): só acrescenta fn_ve_combustivel().
alter policy equipamentos_select on public.equipamentos using (
  (select public.tem_permissao('cadastros.equipamentos', 'ver')) or (select public.fn_ve_manutencao())
  or (select public.fn_ve_combustivel()));
alter policy fornecedores_select on public.fornecedores using (
  (select public.tem_permissao('cadastros.fornecedores', 'ver')) or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver')) or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
  or (select public.tem_permissao('financeiro.pagamentos', 'ver')) or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
  or (select public.tem_permissao('financeiro.recebimentos', 'ver')) or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.fn_ve_manutencao()) or (select public.fn_ve_combustivel()));
alter policy insumos_select on public.insumos using (
  (select public.tem_permissao('cadastros.insumos', 'ver')) or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver')) or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.fn_ve_manutencao()) or (select public.fn_ve_combustivel()));
alter policy centros_custo_select on public.centros_custo using (
  (select public.tem_permissao('cadastros.centros-custo', 'ver')) or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver')) or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
  or (select public.tem_permissao('financeiro.recebimentos', 'ver')) or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.tem_permissao('rh.folha', 'ver')) or (select public.tem_permissao('cadastros.colaboradores', 'ver'))
  or (select public.fn_ve_manutencao()) or (select public.fn_ve_combustivel()));
alter policy unidades_medida_select on public.unidades_medida using (
  (select public.tem_permissao('cadastros.unidades', 'ver')) or (select public.fn_ve_manutencao())
  or (select public.fn_ve_combustivel()));

-- =====================================================================
-- 1. Tabelas
-- =====================================================================

-- Tanque. Externo = de terceiro (Transterra/Areacre, Posto Progresso): tem dono, não tem
-- estoque, PEPS nem trava. Na origem "externo" morava em duas colunas que podiam discordar;
-- aqui uma implica a outra.
create table if not exists public.tanques (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  apelido text,
  capacidade_litros numeric(14,4) not null default 0 check (capacidade_litros >= 0),
  nivel_atual_litros numeric(14,4) not null default 0,
  combustivel_atual_id uuid references public.insumos(id),
  eh_externo boolean not null default false,
  proprietario_id uuid references public.fornecedores(id),
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint tanques_nome_nao_vazio check (btrim(nome) <> ''),
  constraint tanques_externo_tem_dono check (eh_externo = (proprietario_id is not null))
);
comment on column public.tanques.nivel_atual_litros is 'Cache mantido por gatilho (fn_comb_recalcular_nivel). A tela nunca grava.';
create unique index if not exists uq_tanques_nome on public.tanques (public.fn_chave_nome(nome));
alter table public.tanques enable row level security;
create policy tanques_select on public.tanques for select to authenticated using ((select public.fn_ve_combustivel()));
create policy tanques_insert on public.tanques for insert to authenticated
  with check ((select public.tem_permissao('combustivel.tanques', 'criar')));
create policy tanques_update on public.tanques for update to authenticated
  using ((select public.tem_permissao('combustivel.tanques', 'editar')))
  with check ((select public.tem_permissao('combustivel.tanques', 'editar')));
revoke all on public.tanques from anon, authenticated;
-- Nível e combustível atuais são cache do gatilho: a tela nem insere nem altera essas colunas.
grant select on public.tanques to authenticated;
grant insert (nome, apelido, capacidade_litros, eh_externo, proprietario_id, observacoes, ativo),
      update (nome, apelido, capacidade_litros, eh_externo, proprietario_id, observacoes, ativo)
  on public.tanques to authenticated;
create trigger trg_tanques_updated_at before update on public.tanques for each row execute function public.fn_set_updated_at();
create trigger trg_set_created_by before insert on public.tanques for each row execute function public.fn_set_created_by();
create trigger trg_audit_tanques after insert or delete or update on public.tanques for each row execute function public.fn_audit();

-- Entrada: a quantidade na unidade do insumo e os litros já convertidos (galão de Arla x 20).
create table if not exists public.combustivel_entradas (
  id uuid primary key default gen_random_uuid(),
  tanque_id uuid not null references public.tanques(id),
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  litros numeric(14,4) not null check (litros > 0),
  valor_total numeric(14,4) not null check (valor_total >= 0),
  fornecedor_id uuid references public.fornecedores(id),
  nota_fiscal text,
  observacoes text,
  data_hora timestamptz not null,
  origem text not null default 'manual' check (origem in ('manual', 'migracao')),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_comb_entradas_tanque on public.combustivel_entradas (tanque_id, data_hora) where excluido_em is null;

create table if not exists public.combustivel_saidas (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('tanque', 'dinheiro', 'requisicao')),
  tipo_consumidor text not null check (tipo_consumidor in ('equipamento_proprio', 'carreta_transportadora')),
  tanque_id uuid references public.tanques(id),
  equipamento_id uuid references public.equipamentos(id),
  transportadora_id uuid references public.fornecedores(id),
  placa text,
  motorista text,
  insumo_id uuid not null references public.insumos(id),
  litros numeric(14,4) not null check (litros > 0),
  -- carreta: preço cobrado da transportadora e, em tanque externo, o que o dono cobra da EMT
  preco_combustivel numeric(14,4),
  preco_proprietario numeric(14,4),
  taxa_litro numeric(14,4) not null default 0 check (taxa_litro >= 0),
  preco_unitario numeric(14,4) not null default 0 check (preco_unitario >= 0),
  preco_medio_tanque numeric(14,4),
  valor_total numeric(14,4) not null default 0 check (valor_total >= 0),
  pago boolean not null default false,
  pago_em date,
  medicao numeric(14,4) check (medicao is null or medicao >= 0),
  tipo_medicao text check (tipo_medicao in ('horimetro', 'km')),
  centro_custo_id uuid references public.centros_custo(id),
  data timestamptz not null,
  canal text not null default 'computador' check (canal in ('computador', 'celular', 'migracao')),
  observacoes text,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint comb_saidas_carreta_tem_transportadora check (tipo_consumidor <> 'carreta_transportadora' or transportadora_id is not null),
  constraint comb_saidas_proprio_tem_equipamento check (tipo_consumidor <> 'equipamento_proprio' or equipamento_id is not null),
  constraint comb_saidas_tanque_so_na_origem_tanque check ((origem = 'tanque') = (tanque_id is not null))
);
create index if not exists idx_comb_saidas_tanque on public.combustivel_saidas (tanque_id, data) where excluido_em is null;
create index if not exists idx_comb_saidas_equipamento on public.combustivel_saidas (equipamento_id, data desc);
create index if not exists idx_comb_saidas_transportadora on public.combustivel_saidas (transportadora_id);
create index if not exists idx_comb_saidas_data on public.combustivel_saidas (data desc);

-- Onde o equipamento trabalhou. O centro é a obra raiz; a etapa da origem fica só como texto.
create table if not exists public.abastecimento_alocacoes (
  id uuid primary key default gen_random_uuid(),
  saida_id uuid not null references public.combustivel_saidas(id) on delete cascade,
  centro_custo_id uuid not null references public.centros_custo(id),
  percentual numeric(7,4) not null check (percentual > 0 and percentual <= 100),
  litros numeric(14,4) not null check (litros >= 0),
  etapa_legado text,
  created_at timestamptz not null default now()
);
create index if not exists idx_abast_aloc_saida on public.abastecimento_alocacoes (saida_id);
create index if not exists idx_abast_aloc_centro on public.abastecimento_alocacoes (centro_custo_id);

create table if not exists public.combustivel_transferencias (
  id uuid primary key default gen_random_uuid(),
  tanque_origem_id uuid not null references public.tanques(id),
  tanque_destino_id uuid not null references public.tanques(id),
  insumo_id uuid references public.insumos(id),
  litros numeric(14,4) not null check (litros > 0),
  valor_total numeric(14,4) not null default 0 check (valor_total >= 0),
  data_hora timestamptz not null,
  observacoes text,
  origem text not null default 'manual' check (origem in ('manual', 'migracao')),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint comb_transf_tanques_diferentes check (tanque_origem_id <> tanque_destino_id)
);
create index if not exists idx_comb_transf_origem on public.combustivel_transferencias (tanque_origem_id, data_hora) where excluido_em is null;
create index if not exists idx_comb_transf_destino on public.combustivel_transferencias (tanque_destino_id, data_hora) where excluido_em is null;

create table if not exists public.combustivel_esvaziamentos (
  id uuid primary key default gen_random_uuid(),
  tanque_id uuid not null references public.tanques(id),
  litros numeric(14,4) not null check (litros > 0),
  motivo text not null check (btrim(motivo) <> ''),
  valor_perda numeric(14,4) not null default 0 check (valor_perda >= 0),
  data_hora timestamptz not null,
  origem text not null default 'manual' check (origem in ('manual', 'migracao')),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_comb_esvaz_tanque on public.combustivel_esvaziamentos (tanque_id, data_hora) where excluido_em is null;

-- Camadas consumidas por saída (PEPS). Só o gatilho grava.
create table if not exists public.combustivel_camadas (
  id uuid primary key default gen_random_uuid(),
  saida_id uuid not null references public.combustivel_saidas(id) on delete cascade,
  fonte_tipo text not null check (fonte_tipo in ('entrada', 'transferencia')),
  fonte_id uuid not null,
  litros numeric not null check (litros > 0),
  preco numeric not null check (preco >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_comb_camadas_saida on public.combustivel_camadas (saida_id);
create index if not exists idx_comb_camadas_fonte on public.combustivel_camadas (fonte_id);

create table if not exists public.combustivel_sem_suprimento (
  id uuid primary key default gen_random_uuid(),
  saida_id uuid not null references public.combustivel_saidas(id) on delete cascade,
  tanque_id uuid not null references public.tanques(id),
  data_saida timestamptz not null,
  litros_solicitados numeric(14,4) not null,
  litros_supridos numeric(14,4) not null,
  litros_sem_suprimento numeric(14,4) not null,
  detectado_em timestamptz not null default now()
);
create index if not exists idx_comb_sem_sup_tanque on public.combustivel_sem_suprimento (tanque_id);
-- A revisão sobrevive ao recálculo (que apaga e refaz as linhas acima): mora à parte, pela saída.
create table if not exists public.combustivel_sem_suprimento_revisao (
  saida_id uuid primary key references public.combustivel_saidas(id) on delete cascade,
  revisado_por uuid references public.usuarios(id),
  revisado_em timestamptz not null default now(),
  observacao text
);

-- Anomalia conferida. A chave é o id determinístico da anomalia (D1-<saída>, D4-<ids>...).
create table if not exists public.combustivel_anomalias_conferidas (
  chave text primary key check (btrim(chave) <> ''),
  motivo text,
  conferido_por uuid references public.usuarios(id),
  conferido_em timestamptz not null default now()
);

-- Conta corrente da transportadora. É do Frete (Fase 4 acrescenta frete, pagamento e ajuste);
-- nasce aqui porque o abastecimento de carreta escreve nela. Ninguém grava da tela.
create table if not exists public.transportadora_movimentos (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.fornecedores(id),
  data timestamptz not null,
  tipo text not null check (tipo in ('credito_frete', 'credito_abastecimento_transterra', 'debito_abastecimento_transterra',
    'debito_abastecimento_emt', 'debito_pagamento_frete', 'ajuste_manual_credito', 'ajuste_manual_debito')),
  valor numeric(14,4) not null check (valor > 0),
  origem_tabela text not null,
  origem_id uuid not null,
  descricao text,
  centro_custo_id uuid references public.centros_custo(id),
  mes_referencia date not null,
  origem text not null default 'manual' check (origem in ('manual', 'migracao')),
  created_at timestamptz not null default now()
);
create index if not exists idx_transp_mov_transportadora on public.transportadora_movimentos (transportadora_id, data);
create index if not exists idx_transp_mov_origem on public.transportadora_movimentos (origem_tabela, origem_id);

-- RLS: leitura por quem vê o módulo; escrita só pelas RPCs e gatilhos (SECURITY DEFINER).
do $rls$
declare t text;
begin
  foreach t in array array['combustivel_entradas', 'combustivel_saidas', 'abastecimento_alocacoes', 'combustivel_transferencias',
                           'combustivel_esvaziamentos', 'combustivel_camadas', 'combustivel_sem_suprimento',
                           'combustivel_sem_suprimento_revisao', 'combustivel_anomalias_conferidas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_combustivel()))', t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    -- Camada e sem suprimento são derivados: o recálculo refaz o tanque inteiro a cada mudança,
    -- e auditar isso escreveria milhares de linhas por edição. A auditoria é da saída que os gera.
    if t not in ('combustivel_camadas', 'combustivel_sem_suprimento') then
      execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
    end if;
  end loop;
end $rls$;
alter table public.transportadora_movimentos enable row level security;
create policy transportadora_movimentos_select on public.transportadora_movimentos for select to authenticated
  using ((select public.tem_permissao('frete.conta-corrente', 'ver')) or (select public.fn_ve_combustivel()));
revoke all on public.transportadora_movimentos from anon, authenticated;
grant select on public.transportadora_movimentos to authenticated;
create trigger trg_audit_transportadora_movimentos after insert or delete or update on public.transportadora_movimentos
  for each row execute function public.fn_audit();

do $upd$
declare t text;
begin
  foreach t in array array['combustivel_entradas', 'combustivel_saidas', 'combustivel_transferencias', 'combustivel_esvaziamentos'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.fn_set_updated_at()', 'trg_' || t || '_updated_at', t);
  end loop;
end $upd$;

-- Horímetro do abastecimento vai para as medições (a origem fazia igual).
alter table public.equipamento_medicoes add column if not exists combustivel_saida_id uuid
  references public.combustivel_saidas(id) on delete set null;
create unique index if not exists uq_equip_medicoes_saida on public.equipamento_medicoes (combustivel_saida_id)
  where combustivel_saida_id is not null;
alter table public.equipamento_medicoes drop constraint equipamento_medicoes_origem_check;
alter table public.equipamento_medicoes add constraint equipamento_medicoes_origem_check
  check (origem in ('manual', 'celular', 'os', 'migracao', 'abastecimento'));

-- =====================================================================
-- 2. Estoque, combustível e nível na data (iguais à origem)
--    Leitura em SECURITY INVOKER: chamadas pela tela respeitam a RLS; chamadas pelos gatilhos
--    e RPCs (SECURITY DEFINER) rodam com os direitos do dono.
-- =====================================================================

create or replace function public.fn_comb_tanque_externo(p_tanque uuid)
returns boolean language sql stable security invoker set search_path to '' as $$
  select coalesce((select eh_externo from public.tanques where id = p_tanque), false);
$$;

-- Litros no tanque até a data (inclusive), sem contar o movimento p_excluir. Nunca negativo.
create or replace function public.fn_comb_estoque_na_data(p_tanque uuid, p_data timestamptz, p_excluir uuid default null)
returns numeric language sql stable security invoker set search_path to '' as $$
  select greatest(
      coalesce((select sum(litros) from public.combustivel_entradas
                 where tanque_id = p_tanque and excluido_em is null and data_hora <= p_data and id is distinct from p_excluir), 0)
    + coalesce((select sum(litros) from public.combustivel_transferencias
                 where tanque_destino_id = p_tanque and excluido_em is null and data_hora <= p_data and id is distinct from p_excluir), 0)
    - coalesce((select sum(litros) from public.combustivel_transferencias
                 where tanque_origem_id = p_tanque and excluido_em is null and data_hora <= p_data and id is distinct from p_excluir), 0)
    - coalesce((select sum(litros) from public.combustivel_saidas
                 where tanque_id = p_tanque and excluido_em is null and data <= p_data and id is distinct from p_excluir), 0)
    - coalesce((select sum(litros) from public.combustivel_esvaziamentos
                 where tanque_id = p_tanque and excluido_em is null and data_hora <= p_data and id is distinct from p_excluir), 0),
    0);
$$;

-- Combustível do tanque na data: nulo se vazio; senão a última entrada depois do último
-- esvaziamento, ou a última transferência recebida.
create or replace function public.fn_comb_combustivel_na_data(p_tanque uuid, p_data timestamptz)
returns uuid language plpgsql stable security invoker set search_path to '' as $$
declare v_ult_esv timestamptz; v_tipo uuid;
begin
  if public.fn_comb_estoque_na_data(p_tanque, p_data) <= 0 then return null; end if;
  select max(data_hora) into v_ult_esv from public.combustivel_esvaziamentos
   where tanque_id = p_tanque and excluido_em is null and data_hora <= p_data;
  select insumo_id into v_tipo from public.combustivel_entradas
   where tanque_id = p_tanque and excluido_em is null and data_hora <= p_data
     and (v_ult_esv is null or data_hora >= v_ult_esv)
   order by data_hora desc, created_at desc limit 1;
  if v_tipo is null then
    select insumo_id into v_tipo from public.combustivel_transferencias
     where tanque_destino_id = p_tanque and excluido_em is null and data_hora <= p_data and insumo_id is not null
     order by data_hora desc, created_at desc limit 1;
  end if;
  return v_tipo;
end $$;

-- Nível e combustível atuais (cache do tanque), sobre todo o tempo.
create or replace function public.fn_comb_recalcular_nivel(p_tanque uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_nivel numeric; v_ult_esv timestamptz; v_tipo uuid;
begin
  if p_tanque is null then return; end if;
  v_nivel := public.fn_comb_estoque_na_data(p_tanque, 'infinity'::timestamptz);
  if v_nivel > 0 then
    select max(data_hora) into v_ult_esv from public.combustivel_esvaziamentos where tanque_id = p_tanque and excluido_em is null;
    select insumo_id into v_tipo from public.combustivel_entradas
     where tanque_id = p_tanque and excluido_em is null and (v_ult_esv is null or data_hora >= v_ult_esv)
     order by data_hora desc, created_at desc limit 1;
    if v_tipo is null then
      select insumo_id into v_tipo from public.combustivel_transferencias
       where tanque_destino_id = p_tanque and excluido_em is null and insumo_id is not null
       order by data_hora desc, created_at desc limit 1;
    end if;
  end if;
  update public.tanques set nivel_atual_litros = v_nivel, combustivel_atual_id = v_tipo
   where id = p_tanque and (nivel_atual_litros, combustivel_atual_id) is distinct from (v_nivel, v_tipo);
end $$;

-- =====================================================================
-- 3. PEPS (porte de private.recompute_fifo_tanque do Gestão Obras)
-- =====================================================================

create or replace function public.fn_comb_recalcular_peps(p_tanque uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_saida record; v_lote record;
  v_restante numeric; v_consome numeric; v_total_valor numeric; v_total_litros numeric;
begin
  if p_tanque is null then return; end if;
  perform set_config('app.peps_recalculando', '1', true);

  if public.fn_comb_tanque_externo(p_tanque) then
    delete from public.combustivel_camadas where saida_id in (select id from public.combustivel_saidas where tanque_id = p_tanque);
    delete from public.combustivel_sem_suprimento where tanque_id = p_tanque;
    perform set_config('app.peps_recalculando', '', true);
    return;
  end if;

  create temp table if not exists _peps_lotes (
    seq bigserial primary key, fonte_tipo text not null, fonte_id uuid not null, insumo_id uuid,
    data_origem timestamptz not null, saldo numeric not null, preco numeric not null
  ) on commit drop;
  truncate _peps_lotes restart identity;

  -- Entradas primeiro, depois transferências recebidas: é o desempate da origem no mesmo instante.
  insert into _peps_lotes (fonte_tipo, fonte_id, insumo_id, data_origem, saldo, preco)
  select 'entrada', e.id, e.insumo_id, e.data_hora, e.litros, case when e.litros > 0 then e.valor_total / e.litros else 0 end
    from public.combustivel_entradas e where e.tanque_id = p_tanque and e.excluido_em is null;
  insert into _peps_lotes (fonte_tipo, fonte_id, insumo_id, data_origem, saldo, preco)
  select 'transferencia', t.id, t.insumo_id, t.data_hora, t.litros, case when t.litros > 0 then t.valor_total / t.litros else 0 end
    from public.combustivel_transferencias t where t.tanque_destino_id = p_tanque and t.excluido_em is null;

  delete from public.combustivel_camadas where saida_id in (select id from public.combustivel_saidas where tanque_id = p_tanque);
  delete from public.combustivel_sem_suprimento where tanque_id = p_tanque;

  -- Transferência de saída e esvaziamento NÃO consomem camada (igual ao banco da origem).
  for v_saida in
    select id, data, litros, tipo_consumidor, insumo_id from public.combustivel_saidas
     where tanque_id = p_tanque and origem = 'tanque' and excluido_em is null
     order by data, created_at, id
  loop
    v_restante := v_saida.litros; v_total_valor := 0; v_total_litros := 0;
    for v_lote in
      select seq, fonte_tipo, fonte_id, saldo, preco from _peps_lotes
       where insumo_id = v_saida.insumo_id and data_origem <= v_saida.data and saldo > 0
       order by data_origem, seq
    loop
      exit when v_restante <= 0;
      v_consome := least(v_restante, v_lote.saldo);
      insert into public.combustivel_camadas (saida_id, fonte_tipo, fonte_id, litros, preco)
      values (v_saida.id, v_lote.fonte_tipo, v_lote.fonte_id, v_consome, v_lote.preco);
      update _peps_lotes set saldo = saldo - v_consome where seq = v_lote.seq;
      v_total_valor := v_total_valor + v_consome * v_lote.preco;
      v_total_litros := v_total_litros + v_consome;
      v_restante := v_restante - v_consome;
    end loop;

    -- Só equipamento próprio tem o preço regravado; carreta tem o preço digitado.
    if v_saida.tipo_consumidor = 'equipamento_proprio' and v_total_litros > 0 then
      update public.combustivel_saidas
         set preco_unitario = v_total_valor / v_total_litros,
             preco_medio_tanque = v_total_valor / v_total_litros,
             valor_total = (v_total_valor / v_total_litros) * v_saida.litros
       where id = v_saida.id
         and (preco_unitario, preco_medio_tanque, valor_total) is distinct from
             ((v_total_valor / v_total_litros)::numeric(14,4), (v_total_valor / v_total_litros)::numeric(14,4),
              ((v_total_valor / v_total_litros) * v_saida.litros)::numeric(14,4));
    end if;

    if v_restante > 0 then
      insert into public.combustivel_sem_suprimento (saida_id, tanque_id, data_saida, litros_solicitados, litros_supridos, litros_sem_suprimento)
      values (v_saida.id, p_tanque, v_saida.data, v_saida.litros, v_total_litros, v_restante);
    end if;
  end loop;

  perform set_config('app.peps_recalculando', '', true);
end $$;

-- =====================================================================
-- 4. Travas (iguais à origem, mais o esvaziamento)
-- =====================================================================

-- Menor saldo da linha do tempo: no mesmo instante, as saídas antes das entradas.
create or replace function public.fn_comb_saldo_minimo(p_tanque uuid)
returns numeric language sql stable security invoker set search_path to '' as $$
  with mov as (
    select data_hora quando, litros delta, 1 ord from public.combustivel_entradas where tanque_id = p_tanque and excluido_em is null
    union all select data_hora, litros, 1 from public.combustivel_transferencias where tanque_destino_id = p_tanque and excluido_em is null
    union all select data_hora, -litros, 0 from public.combustivel_transferencias where tanque_origem_id = p_tanque and excluido_em is null
    union all select data, -litros, 0 from public.combustivel_saidas where tanque_id = p_tanque and origem = 'tanque' and excluido_em is null
    union all select data_hora, -litros, 0 from public.combustivel_esvaziamentos where tanque_id = p_tanque and excluido_em is null
  ), r as (select sum(delta) over (order by quando, ord rows between unbounded preceding and current row) bal from mov)
  select coalesce(min(bal), 0) from r;
$$;

-- Início do ciclo aberto: o último reabastecimento a partir de vazio. Antes dele, tudo tranca.
create or replace function public.fn_comb_inicio_ciclo_aberto(p_tanque uuid)
returns timestamptz language sql stable security invoker set search_path to '' as $$
  with mov as (
    select data_hora quando, litros delta, 1 infl, 1 ord from public.combustivel_entradas where tanque_id = p_tanque and excluido_em is null
    union all select data_hora, litros, 1, 1 from public.combustivel_transferencias where tanque_destino_id = p_tanque and excluido_em is null
    union all select data_hora, -litros, 0, 0 from public.combustivel_transferencias where tanque_origem_id = p_tanque and excluido_em is null
    union all select data, -litros, 0, 0 from public.combustivel_saidas where tanque_id = p_tanque and origem = 'tanque' and excluido_em is null
    union all select data_hora, -litros, 0, 0 from public.combustivel_esvaziamentos where tanque_id = p_tanque and excluido_em is null
  ), r as (
    select quando, delta, infl, sum(delta) over (order by quando, ord rows between unbounded preceding and current row) bal_depois from mov
  )
  select max(quando) from r where infl = 1 and (bal_depois - delta) <= 0.001;
$$;
revoke all on function public.fn_comb_inicio_ciclo_aberto(uuid) from public, anon;
grant execute on function public.fn_comb_inicio_ciclo_aberto(uuid) to authenticated;

create or replace function public.fn_comb_exigir_saldo(p_tanque uuid)
returns void language plpgsql stable security invoker set search_path to '' as $$
begin
  if p_tanque is null or public.fn_comb_tanque_externo(p_tanque) then return; end if;
  if public.fn_comb_saldo_minimo(p_tanque) < -0.001 then
    raise exception 'O tanque ficaria com saldo negativo em algum momento: confira as datas e os litros'
      using errcode = '23514';
  end if;
end $$;

create or replace function public.fn_comb_exigir_ciclo_aberto(p_tanque uuid, p_quando timestamptz)
returns void language plpgsql stable security invoker set search_path to '' as $$
declare v_inicio timestamptz;
begin
  if p_tanque is null or public.fn_comb_tanque_externo(p_tanque) then return; end if;
  v_inicio := public.fn_comb_inicio_ciclo_aberto(p_tanque);
  if v_inicio is not null and p_quando < v_inicio then
    raise exception 'Movimento de ciclo fechado (antes do reabastecimento de %): não se altera nem exclui',
      to_char(v_inicio at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI');
  end if;
end $$;

create or replace function public.fn_comb_exigir_data_valida(p_quando timestamptz)
returns void language plpgsql stable set search_path to '' as $$
begin
  if p_quando is null then raise exception 'Informe a data'; end if;
  -- Mesma folga de 24 h da origem, medida por Rio Branco.
  if p_quando > now() + interval '24 hours' then raise exception 'Data no futuro'; end if;
end $$;

-- ---------------------------------------------------------------- BEFORE: validação e carimbo
create or replace function public.fn_comb_trg_entrada_antes()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_tanque record; v_atual uuid; v_delta numeric;
begin
  if public.fn_comb_em_carga() then return new; end if;
  if tg_op = 'UPDATE' then
    if old.excluido_em is null and (new.excluido_em is not null or new.tanque_id is distinct from old.tanque_id
       or new.litros is distinct from old.litros or new.data_hora is distinct from old.data_hora or new.insumo_id is distinct from old.insumo_id) then
      perform public.fn_comb_exigir_ciclo_aberto(old.tanque_id, old.data_hora);
    end if;
    if new.excluido_em is not null then return new; end if;
  end if;
  perform public.fn_comb_exigir_data_valida(new.data_hora);
  select * into v_tanque from public.tanques where id = new.tanque_id;
  if v_tanque.eh_externo then raise exception 'Tanque externo não recebe entrada: o estoque é do dono'; end if;
  -- Mistura pelo nível ATUAL (igual à origem).
  if v_tanque.combustivel_atual_id is not null and v_tanque.nivel_atual_litros > 0 and v_tanque.combustivel_atual_id <> new.insumo_id then
    raise exception 'O tanque tem outro combustível: esvazie antes de receber este';
  end if;
  v_delta := new.litros - case when tg_op = 'UPDATE' and old.tanque_id = new.tanque_id and old.excluido_em is null then old.litros else 0 end;
  if v_tanque.capacidade_litros > 0 and v_tanque.nivel_atual_litros + v_delta > v_tanque.capacidade_litros then
    raise exception 'A entrada passa da capacidade do tanque (% L)', v_tanque.capacidade_litros;
  end if;
  return new;
end $$;

create or replace function public.fn_comb_trg_transferencia_antes()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_origem record; v_destino record; v_delta numeric;
begin
  if public.fn_comb_em_carga() then return new; end if;
  if tg_op = 'UPDATE' then
    if old.excluido_em is null and (new.excluido_em is not null or new.tanque_origem_id is distinct from old.tanque_origem_id
       or new.tanque_destino_id is distinct from old.tanque_destino_id or new.litros is distinct from old.litros
       or new.data_hora is distinct from old.data_hora or new.insumo_id is distinct from old.insumo_id) then
      perform public.fn_comb_exigir_ciclo_aberto(old.tanque_origem_id, old.data_hora);
      perform public.fn_comb_exigir_ciclo_aberto(old.tanque_destino_id, old.data_hora);
    end if;
    if new.excluido_em is not null then return new; end if;
  end if;
  perform public.fn_comb_exigir_data_valida(new.data_hora);
  select * into v_origem from public.tanques where id = new.tanque_origem_id;
  select * into v_destino from public.tanques where id = new.tanque_destino_id;
  if v_origem.eh_externo or v_destino.eh_externo then raise exception 'Transferência não envolve tanque externo'; end if;
  new.insumo_id := public.fn_comb_combustivel_na_data(new.tanque_origem_id, new.data_hora);
  if v_origem.combustivel_atual_id is null then raise exception 'O tanque de origem está vazio'; end if;
  if v_destino.combustivel_atual_id is not null and v_destino.nivel_atual_litros > 0
     and v_destino.combustivel_atual_id <> v_origem.combustivel_atual_id then
    raise exception 'O tanque de destino tem outro combustível';
  end if;
  v_delta := new.litros - case when tg_op = 'UPDATE' and old.tanque_destino_id = new.tanque_destino_id and old.excluido_em is null then old.litros else 0 end;
  if v_destino.capacidade_litros > 0 and v_destino.nivel_atual_litros + v_delta > v_destino.capacidade_litros then
    raise exception 'A transferência passa da capacidade do tanque de destino (% L)', v_destino.capacidade_litros;
  end if;
  return new;
end $$;

create or replace function public.fn_comb_trg_saida_antes()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_estoque numeric;
begin
  if public.fn_comb_em_carga() then return new; end if;
  if tg_op = 'UPDATE' then
    if old.excluido_em is null and old.origem = 'tanque' and (new.excluido_em is not null or new.tanque_id is distinct from old.tanque_id
       or new.litros is distinct from old.litros or new.data is distinct from old.data) then
      perform public.fn_comb_exigir_ciclo_aberto(old.tanque_id, old.data);
    end if;
    if new.excluido_em is not null then return new; end if;
  end if;
  perform public.fn_comb_exigir_data_valida(new.data);
  if new.origem = 'tanque' and not public.fn_comb_tanque_externo(new.tanque_id) then
    new.insumo_id := coalesce(public.fn_comb_combustivel_na_data(new.tanque_id, new.data), new.insumo_id);
    if tg_op = 'INSERT' or new.litros is distinct from old.litros or new.data is distinct from old.data
       or new.tanque_id is distinct from old.tanque_id or new.origem is distinct from old.origem then
      v_estoque := public.fn_comb_estoque_na_data(new.tanque_id, new.data, new.id);
      if new.litros > v_estoque then
        raise exception 'Saldo insuficiente no tanque nessa data: % L disponíveis', round(v_estoque, 2);
      end if;
    end if;
  end if;
  -- Centro de custo do equipamento próprio: a etapa dele (alugado não tem; o custo vai na alocação).
  if new.tipo_consumidor = 'equipamento_proprio' then
    new.centro_custo_id := (select id from public.centros_custo where equipamento_id = new.equipamento_id limit 1);
  else
    new.centro_custo_id := null;
  end if;
  return new;
end $$;

create or replace function public.fn_comb_trg_esvaziamento_antes()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if public.fn_comb_em_carga() then return new; end if;
  if tg_op = 'UPDATE' then
    if old.excluido_em is null then perform public.fn_comb_exigir_ciclo_aberto(old.tanque_id, old.data_hora); end if;
    return new;
  end if;
  perform public.fn_comb_exigir_data_valida(new.data_hora);
  if public.fn_comb_tanque_externo(new.tanque_id) then raise exception 'Tanque externo não se esvazia: o estoque é do dono'; end if;
  return new;
end $$;

create trigger trg_comb_entrada_antes before insert or update on public.combustivel_entradas for each row execute function public.fn_comb_trg_entrada_antes();
create trigger trg_comb_transferencia_antes before insert or update on public.combustivel_transferencias for each row execute function public.fn_comb_trg_transferencia_antes();
create trigger trg_comb_saida_antes before insert or update on public.combustivel_saidas for each row execute function public.fn_comb_trg_saida_antes();
create trigger trg_comb_esvaziamento_antes before insert or update on public.combustivel_esvaziamentos for each row execute function public.fn_comb_trg_esvaziamento_antes();

-- ---------------------------------------------------------------- AFTER: nível, PEPS, saldo
create or replace function public.fn_comb_trg_recalcular()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_tanques uuid[];
begin
  if public.fn_comb_em_carga() or coalesce(current_setting('app.peps_recalculando', true), '') = '1' then return null; end if;
  -- IF e não CASE: o PL/pgSQL resolve o campo do registro ao executar, e a entrada não tem
  -- tanque_origem_id.
  if tg_table_name = 'combustivel_transferencias' then
    if tg_op <> 'INSERT' then v_tanques := array[old.tanque_origem_id, old.tanque_destino_id]; end if;
    if tg_op <> 'DELETE' then v_tanques := coalesce(v_tanques, '{}') || array[new.tanque_origem_id, new.tanque_destino_id]; end if;
  else
    if tg_op <> 'INSERT' then v_tanques := array[old.tanque_id]; end if;
    if tg_op <> 'DELETE' then v_tanques := coalesce(v_tanques, '{}') || array[new.tanque_id]; end if;
  end if;
  -- Esvaziamento não entra no PEPS (igual à origem), mas mexe no nível e no saldo.
  perform public.fn_comb_recalcular_nivel(t) from (select distinct unnest(v_tanques) t) x where t is not null;
  if tg_table_name <> 'combustivel_esvaziamentos' then
    perform public.fn_comb_recalcular_peps(t) from (select distinct unnest(v_tanques) t) x where t is not null;
  end if;
  perform public.fn_comb_exigir_saldo(t) from (select distinct unnest(v_tanques) t) x where t is not null;
  return null;
end $$;

create trigger trg_comb_entradas_recalcular after insert or update or delete on public.combustivel_entradas for each row execute function public.fn_comb_trg_recalcular();
create trigger trg_comb_transf_recalcular after insert or update or delete on public.combustivel_transferencias for each row execute function public.fn_comb_trg_recalcular();
create trigger trg_comb_saidas_recalcular after insert or update of tanque_id, litros, data, origem, insumo_id, tipo_consumidor, excluido_em or delete
  on public.combustivel_saidas for each row execute function public.fn_comb_trg_recalcular();
create trigger trg_comb_esvaz_recalcular after insert or update or delete on public.combustivel_esvaziamentos for each row execute function public.fn_comb_trg_recalcular();

-- =====================================================================
-- 5. Conta corrente da transportadora (porte de fn_saidas_combustivel_movimentos)
-- =====================================================================

create or replace function public.fn_comb_gerar_movimentos(p_saida uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare s record; v_dono uuid; v_tanque text;
begin
  delete from public.transportadora_movimentos where origem_tabela = 'combustivel_saidas' and origem_id = p_saida;
  select * into s from public.combustivel_saidas where id = p_saida;
  if s.id is null or s.excluido_em is not null or s.tipo_consumidor <> 'carreta_transportadora'
     or s.transportadora_id is null or s.tanque_id is null then
    return;
  end if;
  select proprietario_id, nome into v_dono, v_tanque from public.tanques where id = s.tanque_id;
  if v_dono is not null then
    -- Tanque com dono: crédito do dono (o que ele cobra + a taxa dele) e débito de quem abasteceu.
    insert into public.transportadora_movimentos (transportadora_id, data, tipo, valor, origem_tabela, origem_id, descricao, mes_referencia)
    select v_dono, s.data, 'credito_abastecimento_transterra',
           s.litros * (coalesce(s.preco_proprietario, s.preco_combustivel, 0) + coalesce(s.taxa_litro, 0)),
           'combustivel_saidas', s.id, 'Abastecimento de carreta no tanque ' || v_tanque,
           date_trunc('month', s.data at time zone 'America/Rio_Branco')::date
     where s.litros * (coalesce(s.preco_proprietario, s.preco_combustivel, 0) + coalesce(s.taxa_litro, 0)) > 0;
    insert into public.transportadora_movimentos (transportadora_id, data, tipo, valor, origem_tabela, origem_id, descricao, mes_referencia)
    select s.transportadora_id, s.data, 'debito_abastecimento_transterra', s.valor_total, 'combustivel_saidas', s.id,
           'Abastecimento no tanque ' || v_tanque || ' (' || coalesce((select razao_social from public.fornecedores where id = v_dono), '?') || ')',
           date_trunc('month', s.data at time zone 'America/Rio_Branco')::date
     where s.valor_total > 0;
  else
    insert into public.transportadora_movimentos (transportadora_id, data, tipo, valor, origem_tabela, origem_id, descricao, mes_referencia)
    select s.transportadora_id, s.data, 'debito_abastecimento_emt', s.valor_total, 'combustivel_saidas', s.id,
           'Abastecimento no tanque EMT ' || v_tanque, date_trunc('month', s.data at time zone 'America/Rio_Branco')::date
     where s.valor_total > 0;
  end if;
end $$;

create or replace function public.fn_comb_trg_movimentos()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if public.fn_comb_em_carga() then return null; end if;
  if tg_op = 'DELETE' then
    delete from public.transportadora_movimentos where origem_tabela = 'combustivel_saidas' and origem_id = old.id;
    return null;
  end if;
  perform public.fn_comb_gerar_movimentos(new.id);
  return null;
end $$;
create trigger trg_comb_saidas_movimentos after insert or update or delete on public.combustivel_saidas
  for each row execute function public.fn_comb_trg_movimentos();

-- =====================================================================
-- 6. Horímetro/km do abastecimento vira medição
-- =====================================================================

create or replace function public.fn_comb_trg_medicao()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_controle text;
begin
  if public.fn_comb_em_carga() then return null; end if;
  if tg_op = 'DELETE' then return null; end if;
  if new.excluido_em is not null or new.medicao is null or new.equipamento_id is null then
    update public.equipamento_medicoes set excluido_em = coalesce(excluido_em, now())
     where combustivel_saida_id = new.id and excluido_em is null;
    return null;
  end if;
  select controle_por into v_controle from public.equipamentos where id = new.equipamento_id;
  if v_controle not in ('horimetro', 'km') then return null; end if;
  insert into public.equipamento_medicoes (equipamento_id, data, tipo, valor, origem, combustivel_saida_id, observacoes, created_by)
  values (new.equipamento_id, (new.data at time zone 'America/Rio_Branco')::date, coalesce(new.tipo_medicao, v_controle),
          new.medicao, 'abastecimento', new.id, 'Lançada no abastecimento', new.created_by)
  on conflict (combustivel_saida_id) where combustivel_saida_id is not null do update
    set equipamento_id = excluded.equipamento_id, data = excluded.data, tipo = excluded.tipo, valor = excluded.valor, excluido_em = null;
  return null;
end $$;
create trigger trg_comb_saidas_medicao after insert or update of medicao, tipo_medicao, equipamento_id, data, excluido_em
  on public.combustivel_saidas for each row execute function public.fn_comb_trg_medicao();

-- =====================================================================
-- 7. RPCs (a tela nunca grava direto)
-- =====================================================================

create or replace function public.fn_comb_litros_da_entrada(p_insumo uuid, p_quantidade numeric)
returns numeric language sql stable security invoker set search_path to '' as $$
  select p_quantidade * coalesce((select litros_por_unidade from public.insumos where id = p_insumo), 1);
$$;

create or replace function public.fn_comb_salvar_entrada(p_id uuid, p_tanque uuid, p_insumo uuid, p_quantidade numeric,
  p_valor_total numeric, p_fornecedor uuid, p_nota_fiscal text, p_data_hora timestamptz, p_observacoes text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  if p_id is null and not public.tem_permissao('combustivel.entradas', 'criar') then raise exception 'Sem permissão para lançar entrada'; end if;
  if p_id is not null and not public.tem_permissao('combustivel.entradas', 'editar') then raise exception 'Sem permissão para editar entrada'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade'; end if;
  if p_valor_total is null or p_valor_total < 0 then raise exception 'Informe o valor'; end if;
  if p_id is null then
    insert into public.combustivel_entradas (tanque_id, insumo_id, quantidade, litros, valor_total, fornecedor_id, nota_fiscal, data_hora, observacoes, created_by)
    values (p_tanque, p_insumo, p_quantidade, public.fn_comb_litros_da_entrada(p_insumo, p_quantidade), p_valor_total, p_fornecedor,
            nullif(btrim(p_nota_fiscal), ''), p_data_hora, nullif(btrim(p_observacoes), ''), (select auth.uid()))
    returning id into v_id;
    return v_id;
  end if;
  update public.combustivel_entradas set tanque_id = p_tanque, insumo_id = p_insumo, quantidade = p_quantidade,
         litros = public.fn_comb_litros_da_entrada(p_insumo, p_quantidade), valor_total = p_valor_total, fornecedor_id = p_fornecedor,
         nota_fiscal = nullif(btrim(p_nota_fiscal), ''), data_hora = p_data_hora, observacoes = nullif(btrim(p_observacoes), '')
   where id = p_id and excluido_em is null;
  if not found then raise exception 'Entrada não encontrada'; end if;
  return p_id;
end $$;

-- Abastecimento. Preço: tanque próprio da EMT e equipamento próprio, pelo PEPS (gatilho);
-- carreta, o digitado (em tanque da EMT, vazio = o preço PEPS das camadas que ela consumiu);
-- dinheiro e requisição, o preço unitário digitado.
create or replace function public.fn_comb_salvar_saida(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid; v_origem text := p_dados ->> 'origem'; v_tipo text := p_dados ->> 'tipo_consumidor';
  v_tanque uuid := nullif(p_dados ->> 'tanque_id', '')::uuid; v_litros numeric := (p_dados ->> 'litros')::numeric;
  v_taxa numeric := coalesce((p_dados ->> 'taxa_litro')::numeric, 0);
  v_preco numeric := (p_dados ->> 'preco_combustivel')::numeric; v_preco_dono numeric := (p_dados ->> 'preco_proprietario')::numeric;
  v_unit numeric := (p_dados ->> 'preco_unitario')::numeric; v_externo boolean; v_insumo uuid;
  v_aloc jsonb := coalesce(p_dados -> 'alocacoes', '[]'::jsonb); v_peps numeric;
begin
  if p_id is null and not public.tem_permissao('combustivel.saidas', 'criar') then raise exception 'Sem permissão para lançar abastecimento'; end if;
  if p_id is not null and not public.tem_permissao('combustivel.saidas', 'editar') then raise exception 'Sem permissão para editar abastecimento'; end if;
  if v_litros is null or v_litros <= 0 then raise exception 'Informe os litros'; end if;
  v_externo := v_tanque is not null and public.fn_comb_tanque_externo(v_tanque);
  if v_externo and v_tipo = 'equipamento_proprio' then raise exception 'Tanque externo é só para carreta de transportadora'; end if;
  if v_tipo = 'carreta_transportadora' and v_externo and v_preco is null then raise exception 'Informe o preço cobrado da transportadora'; end if;
  if v_origem in ('dinheiro', 'requisicao') and (v_unit is null or v_unit < 0) then raise exception 'Informe o preço por litro'; end if;
  v_insumo := coalesce(nullif(p_dados ->> 'insumo_id', '')::uuid,
                       case when v_tanque is not null then (select combustivel_atual_id from public.tanques where id = v_tanque) end);
  if v_insumo is null then raise exception 'Informe o combustível'; end if;

  if p_id is null then
    insert into public.combustivel_saidas (origem, tipo_consumidor, tanque_id, equipamento_id, transportadora_id, placa, motorista, insumo_id,
      litros, preco_combustivel, preco_proprietario, taxa_litro, preco_unitario, valor_total, pago, pago_em, medicao, tipo_medicao, data, canal,
      observacoes, created_by)
    values (v_origem, v_tipo, v_tanque, nullif(p_dados ->> 'equipamento_id', '')::uuid, nullif(p_dados ->> 'transportadora_id', '')::uuid,
      nullif(btrim(p_dados ->> 'placa'), ''), nullif(btrim(p_dados ->> 'motorista'), ''), v_insumo, v_litros, v_preco, v_preco_dono, v_taxa,
      case when v_origem in ('dinheiro', 'requisicao') then v_unit when v_tipo = 'carreta_transportadora' and v_preco is not null then v_preco + v_taxa else 0 end,
      case when v_origem in ('dinheiro', 'requisicao') then v_litros * v_unit when v_tipo = 'carreta_transportadora' and v_preco is not null then v_litros * (v_preco + v_taxa) else 0 end,
      coalesce((p_dados ->> 'pago')::boolean, false), nullif(p_dados ->> 'pago_em', '')::date,
      (p_dados ->> 'medicao')::numeric, nullif(p_dados ->> 'tipo_medicao', ''), (p_dados ->> 'data')::timestamptz,
      coalesce(nullif(p_dados ->> 'canal', ''), 'computador'), nullif(btrim(p_dados ->> 'observacoes'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.combustivel_saidas set origem = v_origem, tipo_consumidor = v_tipo, tanque_id = v_tanque,
      equipamento_id = nullif(p_dados ->> 'equipamento_id', '')::uuid, transportadora_id = nullif(p_dados ->> 'transportadora_id', '')::uuid,
      placa = nullif(btrim(p_dados ->> 'placa'), ''), motorista = nullif(btrim(p_dados ->> 'motorista'), ''), insumo_id = v_insumo,
      litros = v_litros, preco_combustivel = v_preco, preco_proprietario = v_preco_dono, taxa_litro = v_taxa,
      preco_unitario = case when v_origem in ('dinheiro', 'requisicao') then v_unit when v_tipo = 'carreta_transportadora' and v_preco is not null then v_preco + v_taxa else preco_unitario end,
      valor_total = case when v_origem in ('dinheiro', 'requisicao') then v_litros * v_unit when v_tipo = 'carreta_transportadora' and v_preco is not null then v_litros * (v_preco + v_taxa) else valor_total end,
      pago = coalesce((p_dados ->> 'pago')::boolean, false), pago_em = nullif(p_dados ->> 'pago_em', '')::date,
      medicao = (p_dados ->> 'medicao')::numeric, tipo_medicao = nullif(p_dados ->> 'tipo_medicao', ''), data = (p_dados ->> 'data')::timestamptz,
      observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
     where id = p_id and excluido_em is null;
    if not found then raise exception 'Abastecimento não encontrado'; end if;
    v_id := p_id;
  end if;

  -- Carreta em tanque da EMT sem preço digitado: o preço é o das camadas que ela consumiu.
  if v_tipo = 'carreta_transportadora' and not v_externo and v_preco is null and v_tanque is not null then
    select sum(litros * preco) / nullif(sum(litros), 0) into v_peps from public.combustivel_camadas where saida_id = v_id;
    update public.combustivel_saidas set preco_combustivel = coalesce(v_peps, 0), preco_unitario = coalesce(v_peps, 0) + v_taxa,
           valor_total = v_litros * (coalesce(v_peps, 0) + v_taxa)
     where id = v_id;
  end if;

  delete from public.abastecimento_alocacoes where saida_id = v_id;
  insert into public.abastecimento_alocacoes (saida_id, centro_custo_id, percentual, litros, etapa_legado)
  select v_id, (a ->> 'centro_custo_id')::uuid, (a ->> 'percentual')::numeric, v_litros * (a ->> 'percentual')::numeric / 100, a ->> 'etapa_legado'
    from jsonb_array_elements(v_aloc) a;
  if exists (select 1 from public.abastecimento_alocacoes where saida_id = v_id)
     and (select sum(percentual) from public.abastecimento_alocacoes where saida_id = v_id) <> 100 then
    raise exception 'As alocações precisam somar 100%%';
  end if;
  return v_id;
end $$;

create or replace function public.fn_comb_salvar_transferencia(p_id uuid, p_origem uuid, p_destino uuid, p_litros numeric,
  p_data_hora timestamptz, p_observacoes text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_valor numeric;
begin
  if p_id is null and not public.tem_permissao('combustivel.transferencias', 'criar') then raise exception 'Sem permissão para lançar transferência'; end if;
  if p_id is not null and not public.tem_permissao('combustivel.transferencias', 'editar') then raise exception 'Sem permissão para editar transferência'; end if;
  if p_litros is null or p_litros <= 0 then raise exception 'Informe os litros'; end if;
  -- Valor = litros x preço médio de TODAS as entradas e transferências recebidas da origem até a
  -- data (a tela da origem calculava assim; não é o PEPS).
  select coalesce(sum(v) / nullif(sum(l), 0), 0) * p_litros into v_valor from (
    select valor_total v, litros l from public.combustivel_entradas where tanque_id = p_origem and excluido_em is null and data_hora <= p_data_hora
    union all select valor_total, litros from public.combustivel_transferencias
     where tanque_destino_id = p_origem and excluido_em is null and data_hora <= p_data_hora and id is distinct from p_id) x;
  if p_id is null then
    insert into public.combustivel_transferencias (tanque_origem_id, tanque_destino_id, litros, valor_total, data_hora, observacoes, created_by)
    values (p_origem, p_destino, p_litros, v_valor, p_data_hora, nullif(btrim(p_observacoes), ''), (select auth.uid()))
    returning id into v_id;
    return v_id;
  end if;
  update public.combustivel_transferencias set tanque_origem_id = p_origem, tanque_destino_id = p_destino, litros = p_litros,
         valor_total = v_valor, data_hora = p_data_hora, observacoes = nullif(btrim(p_observacoes), '')
   where id = p_id and excluido_em is null;
  if not found then raise exception 'Transferência não encontrada'; end if;
  return p_id;
end $$;

create or replace function public.fn_comb_registrar_esvaziamento(p_tanque uuid, p_litros numeric, p_motivo text, p_data_hora timestamptz)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  if not public.tem_permissao('combustivel.esvaziamentos', 'criar') then raise exception 'Sem permissão para esvaziar tanque'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  if p_litros is null or p_litros <= 0 then raise exception 'Informe os litros'; end if;
  insert into public.combustivel_esvaziamentos (tanque_id, litros, motivo, data_hora, created_by)
  values (p_tanque, p_litros, btrim(p_motivo), p_data_hora, (select auth.uid())) returning id into v_id;
  return v_id;
end $$;

-- Exclusão com motivo (lixeira): marca excluido_em; os gatilhos refazem nível, PEPS, saldo e conta corrente.
create or replace function public.fn_comb_excluir(p_tabela text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text; v_usuario uuid := (select auth.uid()); v_n int;
begin
  v_recurso := case p_tabela when 'combustivel_entradas' then 'combustivel.entradas' when 'combustivel_saidas' then 'combustivel.saidas'
    when 'combustivel_transferencias' then 'combustivel.transferencias' when 'combustivel_esvaziamentos' then 'combustivel.esvaziamentos' end;
  if v_recurso is null then raise exception 'Tabela inválida'; end if;
  if not public.tem_permissao(v_recurso, 'excluir') then raise exception 'Sem permissão para excluir'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da exclusão'; end if;
  execute format('update public.%I set excluido_em = now(), excluido_por = $1, motivo_exclusao = $2 where id = $3 and excluido_em is null', p_tabela)
    using v_usuario, btrim(p_motivo), p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado ou já excluído'; end if;
end $$;

create or replace function public.fn_comb_conferir_anomalia(p_chave text, p_conferida boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.tem_permissao('combustivel.anomalias', 'editar') then raise exception 'Sem permissão para conferir anomalia'; end if;
  if p_conferida then
    insert into public.combustivel_anomalias_conferidas (chave, motivo, conferido_por) values (btrim(p_chave), nullif(btrim(p_motivo), ''), (select auth.uid()))
    on conflict (chave) do update set motivo = excluded.motivo, conferido_por = excluded.conferido_por, conferido_em = now();
  else
    delete from public.combustivel_anomalias_conferidas where chave = btrim(p_chave);
  end if;
end $$;

create or replace function public.fn_comb_revisar_sem_suprimento(p_saida uuid, p_revisado boolean, p_observacao text default null)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.tem_permissao('combustivel.anomalias', 'editar') then raise exception 'Sem permissão para revisar'; end if;
  if p_revisado then
    insert into public.combustivel_sem_suprimento_revisao (saida_id, revisado_por, observacao) values (p_saida, (select auth.uid()), nullif(btrim(p_observacao), ''))
    on conflict (saida_id) do update set revisado_por = excluded.revisado_por, observacao = excluded.observacao, revisado_em = now();
  else
    delete from public.combustivel_sem_suprimento_revisao where saida_id = p_saida;
  end if;
end $$;

-- Depois da carga (gatilhos desligados): nível, PEPS e conta corrente de tudo, uma vez.
create or replace function public.fn_comb_recalcular_tudo()
returns void language plpgsql security definer set search_path to '' as $$
declare t uuid; s uuid;
begin
  for t in select id from public.tanques loop
    perform public.fn_comb_recalcular_nivel(t);
    perform public.fn_comb_recalcular_peps(t);
  end loop;
  for s in select id from public.combustivel_saidas where tipo_consumidor = 'carreta_transportadora' loop
    perform public.fn_comb_gerar_movimentos(s);
  end loop;
end $$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'fn_comb_salvar_entrada(uuid,uuid,uuid,numeric,numeric,uuid,text,timestamptz,text)', 'fn_comb_salvar_saida(uuid,jsonb)',
    'fn_comb_salvar_transferencia(uuid,uuid,uuid,numeric,timestamptz,text)', 'fn_comb_registrar_esvaziamento(uuid,numeric,text,timestamptz)',
    'fn_comb_excluir(text,uuid,text)', 'fn_comb_conferir_anomalia(text,boolean,text)', 'fn_comb_revisar_sem_suprimento(uuid,boolean,text)',
    'fn_comb_estoque_na_data(uuid,timestamptz,uuid)', 'fn_comb_combustivel_na_data(uuid,timestamptz)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Internas: só gatilho e carga.
  foreach f in array array['fn_comb_recalcular_nivel(uuid)', 'fn_comb_recalcular_peps(uuid)', 'fn_comb_saldo_minimo(uuid)',
    'fn_comb_exigir_saldo(uuid)', 'fn_comb_exigir_ciclo_aberto(uuid,timestamptz)', 'fn_comb_gerar_movimentos(uuid)',
    'fn_comb_recalcular_tudo()', 'fn_comb_tanque_externo(uuid)', 'fn_comb_litros_da_entrada(uuid,numeric)',
    'fn_comb_trg_entrada_antes()', 'fn_comb_trg_transferencia_antes()', 'fn_comb_trg_saida_antes()', 'fn_comb_trg_esvaziamento_antes()',
    'fn_comb_trg_recalcular()', 'fn_comb_trg_movimentos()', 'fn_comb_trg_medicao()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $grants$;

-- Lixeira do cadastro de tanques (alterada a partir da definição viva, 18 casos).
create or replace function public.fn_recurso_do_cadastro(p_tabela text)
 returns text language sql immutable set search_path to ''
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
    when 'tanques'           then 'combustivel.tanques'
    else null
  end;
$function$;

-- =====================================================================
-- 8. Permissões: perfil Admin e os 4 Admins ativos (plano 4.3). Os outros, o Tiago monta.
-- =====================================================================
with acoes(recurso, acao) as (values
  ('combustivel.painel', 'ver'),
  ('combustivel.tanques', 'ver'), ('combustivel.tanques', 'criar'), ('combustivel.tanques', 'editar'), ('combustivel.tanques', 'excluir'),
  ('combustivel.entradas', 'ver'), ('combustivel.entradas', 'criar'), ('combustivel.entradas', 'editar'), ('combustivel.entradas', 'excluir'),
  ('combustivel.saidas', 'ver'), ('combustivel.saidas', 'criar'), ('combustivel.saidas', 'editar'), ('combustivel.saidas', 'excluir'),
  ('combustivel.transferencias', 'ver'), ('combustivel.transferencias', 'criar'), ('combustivel.transferencias', 'editar'), ('combustivel.transferencias', 'excluir'),
  ('combustivel.esvaziamentos', 'ver'), ('combustivel.esvaziamentos', 'criar'), ('combustivel.esvaziamentos', 'excluir'),
  ('combustivel.anomalias', 'ver'), ('combustivel.anomalias', 'editar'),
  ('combustivel.relatorios', 'ver')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('combustivel.painel', 'ver'),
  ('combustivel.tanques', 'ver'), ('combustivel.tanques', 'criar'), ('combustivel.tanques', 'editar'), ('combustivel.tanques', 'excluir'),
  ('combustivel.entradas', 'ver'), ('combustivel.entradas', 'criar'), ('combustivel.entradas', 'editar'), ('combustivel.entradas', 'excluir'),
  ('combustivel.saidas', 'ver'), ('combustivel.saidas', 'criar'), ('combustivel.saidas', 'editar'), ('combustivel.saidas', 'excluir'),
  ('combustivel.transferencias', 'ver'), ('combustivel.transferencias', 'criar'), ('combustivel.transferencias', 'editar'), ('combustivel.transferencias', 'excluir'),
  ('combustivel.esvaziamentos', 'ver'), ('combustivel.esvaziamentos', 'criar'), ('combustivel.esvaziamentos', 'excluir'),
  ('combustivel.anomalias', 'ver'), ('combustivel.anomalias', 'editar'),
  ('combustivel.relatorios', 'ver')
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
  select count(distinct usuario_id) into v from public.usuario_permissoes where recurso like 'combustivel.%';
  if v <> 4 then raise exception 'Combustível foi para % usuários; o plano diz 4 Admins ativos', v; end if;
  select count(*) into v from public.usuario_permissoes where recurso like 'combustivel.%';
  if v <> 92 then raise exception 'Esperado 92 permissões de combustível (23 x 4 Admins), veio %', v; end if;
end $confere$;
