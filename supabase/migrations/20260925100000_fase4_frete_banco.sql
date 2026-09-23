-- Fase 4a: o banco do Frete (desenho em docs/FASE4-FRETE.md).
--
-- Igual ao Gestão Obras (banco vivo e telas, levantamento de 24/09/2026), com as decisões do
-- Tiago de 24/09:
--   1. Ajuste manual de saldo passa por aprovação (plano 4.1): nasce pendente e só entra no saldo
--      quando alguém com frete.ajustes/aprovar aprova.
--   2. Os defeitos dos gatilhos da origem são corrigidos: o movimento da conta corrente é refeito
--      inteiro a cada gravação (frete criado sem valor e corrigido depois ganha o crédito; trocar a
--      transportadora leva o crédito junto; zerar some; a obra acompanha).
--   3. Os 12 créditos "pagamento estendido em nome de Areacre" viram ajustes aprovados soltos (carga).
-- O resto é a origem: valor do frete = peso x km x R$/t.km exato (sem arredondar), valor do material
-- = peso x preço unitário, crédito do frete e débito do pagamento na conta corrente, saldo =
-- créditos - débitos (positivo: a EMT deve à transportadora).
-- NADA aqui gera lançamento, parcela ou rateio.
--
-- Carga: com app.carga_combustivel = '1' os gatilhos de movimento não rodam (plano, seção 8; a
-- carga do Frete e do Combustível é uma só). fn_frete_recalcular_movimentos() refaz depois.

-- =====================================================================
-- 0. Quem vê o Frete lê os cadastros que ele usa
-- =====================================================================

create or replace function public.fn_ve_frete()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.tem_permissao('frete.painel', 'ver')
      or public.tem_permissao('frete.fretes', 'ver')
      or public.tem_permissao('frete.pedidos-material', 'ver')
      or public.tem_permissao('frete.conta-corrente', 'ver')
      or public.tem_permissao('frete.pagamentos', 'ver')
      or public.tem_permissao('frete.ajustes', 'ver')
      or public.tem_permissao('frete.anomalias', 'ver');
$$;
revoke all on function public.fn_ve_frete() from public, anon;
grant execute on function public.fn_ve_frete() to authenticated;

-- Alterado a partir das policies vivas (24/09): só acrescenta fn_ve_frete().
alter policy fornecedores_select on public.fornecedores using (
  (select public.tem_permissao('cadastros.fornecedores', 'ver')) or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver')) or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
  or (select public.tem_permissao('financeiro.pagamentos', 'ver')) or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
  or (select public.tem_permissao('financeiro.recebimentos', 'ver')) or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.fn_ve_manutencao()) or (select public.fn_ve_combustivel()) or (select public.fn_ve_frete()));
alter policy insumos_select on public.insumos using (
  (select public.tem_permissao('cadastros.insumos', 'ver')) or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver')) or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.fn_ve_manutencao()) or (select public.fn_ve_combustivel()) or (select public.fn_ve_frete()));
alter policy centros_custo_select on public.centros_custo using (
  (select public.tem_permissao('cadastros.centros-custo', 'ver')) or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver')) or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
  or (select public.tem_permissao('financeiro.recebimentos', 'ver')) or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.tem_permissao('rh.folha', 'ver')) or (select public.tem_permissao('cadastros.colaboradores', 'ver'))
  or (select public.fn_ve_manutencao()) or (select public.fn_ve_combustivel()) or (select public.fn_ve_frete()));
alter policy unidades_medida_select on public.unidades_medida using (
  (select public.tem_permissao('cadastros.unidades', 'ver')) or (select public.fn_ve_manutencao())
  or (select public.fn_ve_combustivel()) or (select public.fn_ve_frete()));
alter policy localidades_select on public.localidades using (
  (select public.tem_permissao('cadastros.localidades', 'ver')) or (select public.fn_ve_frete()));
-- O extrato da origem mostra litros, preço e placa do abastecimento de carreta.
alter policy combustivel_saidas_select on public.combustivel_saidas using (
  (select public.fn_ve_combustivel()) or (select public.tem_permissao('frete.conta-corrente', 'ver')));
alter policy transportadora_movimentos_select on public.transportadora_movimentos using (
  (select public.fn_ve_frete()) or (select public.fn_ve_combustivel()));

-- A pedreira da localidade. Na origem o saldo na pedreira casa o texto da origem do frete
-- ("Pedreira Britam") com o nome do fornecedor ("Britam") por "contém"; no ERP o fornecedor tem a
-- razão social ("BRITAS DA AMAZONIA ..."), e o "contém" não casa. O vínculo passa a ser gravado.
alter table public.localidades add column if not exists fornecedor_id uuid references public.fornecedores(id);

-- =====================================================================
-- 1. Tabelas
-- =====================================================================

create table if not exists public.fretes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'material' check (tipo in ('material', 'transferencia')),
  data date not null,
  data_chegada date,
  centro_custo_id uuid references public.centros_custo(id),
  origem_localidade_id uuid not null references public.localidades(id),
  destino_localidade_id uuid not null references public.localidades(id),
  transportadora_id uuid not null references public.fornecedores(id),
  motorista text not null,
  placa_carreta text,
  insumo_id uuid not null references public.insumos(id),
  -- TAXAS (4 casas); os valores guardam o produto exato, como a origem (até 12 casas nas cargas antigas).
  peso_toneladas numeric(14,4) not null check (peso_toneladas >= 0),
  km_rodados numeric(14,4) not null check (km_rodados >= 0),
  valor_tkm numeric(14,4) not null check (valor_tkm >= 0),
  valor_total numeric not null check (valor_total >= 0),
  valor_material numeric not null default 0 check (valor_material >= 0),
  nota_fiscal text,
  nota_fiscal2 text,
  observacoes text,
  origem text not null default 'manual' check (origem in ('manual', 'migracao')),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  updated_by uuid references public.usuarios(id),
  constraint fretes_material_tem_obra check (tipo = 'transferencia' or centro_custo_id is not null or origem = 'migracao')
);
create index if not exists idx_fretes_data on public.fretes (data desc, id) where excluido_em is null;
create index if not exists idx_fretes_transportadora on public.fretes (transportadora_id) where excluido_em is null;
create index if not exists idx_fretes_insumo on public.fretes (insumo_id);
create index if not exists idx_fretes_centro on public.fretes (centro_custo_id);

create table if not exists public.frete_pagamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  transportadora_id uuid not null references public.fornecedores(id),
  mes_referencia date not null check (extract(day from mes_referencia) = 1),
  valor numeric(14,4) not null check (valor > 0),
  metodo text not null default 'pix' check (metodo in ('pix', 'boleto', 'cheque', 'dinheiro', 'transferencia', 'combustivel')),
  quantidade_combustivel numeric(14,4) not null default 0 check (quantidade_combustivel >= 0),
  responsavel text not null,
  nota_fiscal text,
  pago_por text not null,
  observacoes text,
  origem text not null default 'manual' check (origem in ('manual', 'migracao')),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  updated_by uuid references public.usuarios(id),
  constraint frete_pag_combustivel_tem_litros check (metodo <> 'combustivel' or quantidade_combustivel > 0 or origem = 'migracao')
);
create index if not exists idx_frete_pag_transportadora on public.frete_pagamentos (transportadora_id, data desc) where excluido_em is null;

-- Pedido na pedreira. Sem status nem aprovação (a origem não tem): é a base do saldo na pedreira.
create table if not exists public.pedidos_material (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  fornecedor_id uuid not null references public.fornecedores(id),
  observacoes text,
  origem text not null default 'manual' check (origem in ('manual', 'migracao')),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  updated_by uuid references public.usuarios(id)
);
create index if not exists idx_pedidos_material_fornecedor on public.pedidos_material (fornecedor_id, data desc) where excluido_em is null;

create table if not exists public.pedido_material_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_material(id) on delete cascade,
  ordem int not null,
  insumo_id uuid not null references public.insumos(id),
  -- A origem guarda até 6 casas na quantidade (t) e 4 no preço (R$/t); copia sem arredondar.
  quantidade numeric(18,6) not null check (quantidade > 0),
  valor_unitario numeric(14,4) not null check (valor_unitario > 0),
  created_at timestamptz not null default now(),
  unique (pedido_id, ordem)
);
create index if not exists idx_pedido_itens_insumo on public.pedido_material_itens (insumo_id);

-- Ajuste de saldo com aprovação (decisão do Tiago, 24/09). Só o aprovado vira movimento.
create table if not exists public.frete_ajustes (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.fornecedores(id),
  sinal text not null check (sinal in ('credito', 'debito')),
  valor numeric(14,4) not null check (valor > 0),
  data timestamptz not null,
  mes_referencia date not null check (extract(day from mes_referencia) = 1),
  centro_custo_id uuid references public.centros_custo(id),
  descricao text not null check (btrim(descricao) <> ''),
  status text not null default 'pendente_aprovacao' check (status in ('pendente_aprovacao', 'aprovado', 'rejeitado')),
  aprovado_por uuid references public.usuarios(id),
  aprovado_em timestamptz,
  motivo_status text,
  origem text not null default 'manual' check (origem in ('manual', 'migracao')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  updated_by uuid references public.usuarios(id)
);
create index if not exists idx_frete_ajustes_transportadora on public.frete_ajustes (transportadora_id, data desc);

-- Quais fornecedores ganham card no painel (a origem guarda uma linha só, 'global').
create table if not exists public.frete_painel_config (
  id text primary key default 'global' check (id = 'global'),
  fornecedor_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id)
);
insert into public.frete_painel_config (id) values ('global') on conflict (id) do nothing;

create table if not exists public.frete_anomalias_conferidas (
  chave text primary key,
  motivo text,
  conferido_por uuid references public.usuarios(id),
  conferido_em timestamptz not null default now()
);

-- A conta corrente conhece as quatro origens.
alter table public.transportadora_movimentos drop constraint if exists transportadora_movimentos_origem_tabela_check;
alter table public.transportadora_movimentos add constraint transportadora_movimentos_origem_tabela_check
  check (origem_tabela in ('fretes', 'frete_pagamentos', 'frete_ajustes', 'combustivel_saidas'));

-- RLS: leitura por quem vê o módulo; escrita só pelas RPCs (SECURITY DEFINER).
do $rls$
declare t text;
begin
  foreach t in array array['fretes', 'frete_pagamentos', 'pedidos_material', 'pedido_material_itens', 'frete_ajustes',
                           'frete_painel_config', 'frete_anomalias_conferidas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_frete()))', t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
  end loop;
end $rls$;

-- =====================================================================
-- 2. Conta corrente: o movimento é refeito inteiro a cada gravação
-- =====================================================================

-- Data do movimento: meio-dia de Rio Branco do dia do documento (a origem usava meio-dia de São
-- Paulo; o dia é o mesmo, e o ERP lê datas em Rio Branco).
create or replace function public.fn_frete_meio_dia(p_dia date)
returns timestamptz language sql immutable set search_path to '' as $$
  select (p_dia + time '12:00') at time zone 'America/Rio_Branco';
$$;

create or replace function public.fn_frete_gerar_movimento(p_frete uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare f record; v_origem text; v_destino text;
begin
  delete from public.transportadora_movimentos where origem_tabela = 'fretes' and origem_id = p_frete;
  select * into f from public.fretes where id = p_frete;
  if f.id is null or f.excluido_em is not null or f.valor_total <= 0 then return; end if;
  select nome into v_origem from public.localidades where id = f.origem_localidade_id;
  select nome into v_destino from public.localidades where id = f.destino_localidade_id;
  insert into public.transportadora_movimentos (transportadora_id, data, tipo, valor, origem_tabela, origem_id, descricao,
                                                centro_custo_id, mes_referencia)
  values (f.transportadora_id, public.fn_frete_meio_dia(f.data), 'credito_frete', f.valor_total, 'fretes', f.id,
          -- O texto da origem (fn_fretes_movimentos).
          case when f.tipo = 'transferencia'
            then 'Transferência — ' || coalesce(nullif(btrim(v_origem, E' \t\r\n'), ''), '?') || ' → '
                 || coalesce(nullif(btrim(v_destino, E' \t\r\n'), ''), '?')
            else 'Frete ' || coalesce(nullif(btrim(f.nota_fiscal, E' \t\r\n'), ''), '(sem NF)') || ' — '
                 || coalesce(nullif(btrim(v_origem, E' \t\r\n'), ''), '?') || ' → '
                 || coalesce(nullif(btrim(v_destino, E' \t\r\n'), ''), '?')
          end,
          f.centro_custo_id, date_trunc('month', f.data)::date);
end $$;

create or replace function public.fn_frete_pagamento_gerar_movimento(p_pagamento uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare p record;
begin
  delete from public.transportadora_movimentos where origem_tabela = 'frete_pagamentos' and origem_id = p_pagamento;
  select * into p from public.frete_pagamentos where id = p_pagamento;
  if p.id is null or p.excluido_em is not null then return; end if;
  insert into public.transportadora_movimentos (transportadora_id, data, tipo, valor, origem_tabela, origem_id, descricao, mes_referencia)
  values (p.transportadora_id, public.fn_frete_meio_dia(p.data), 'debito_pagamento_frete', p.valor, 'frete_pagamentos', p.id,
          'Pagamento de frete (' || p.metodo || ') — ref ' || to_char(p.mes_referencia, 'YYYY-MM'), p.mes_referencia);
end $$;

create or replace function public.fn_frete_ajuste_gerar_movimento(p_ajuste uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare a record;
begin
  delete from public.transportadora_movimentos where origem_tabela = 'frete_ajustes' and origem_id = p_ajuste;
  select * into a from public.frete_ajustes where id = p_ajuste;
  if a.id is null or a.status <> 'aprovado' then return; end if;
  insert into public.transportadora_movimentos (transportadora_id, data, tipo, valor, origem_tabela, origem_id, descricao,
                                                centro_custo_id, mes_referencia)
  values (a.transportadora_id, a.data, case a.sinal when 'credito' then 'ajuste_manual_credito' else 'ajuste_manual_debito' end,
          a.valor, 'frete_ajustes', a.id, a.descricao, a.centro_custo_id, a.mes_referencia);
end $$;

create or replace function public.fn_frete_trg_movimento()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_id uuid := coalesce(new.id, old.id);
begin
  if public.fn_comb_em_carga() then return null; end if;
  if tg_table_name = 'fretes' then perform public.fn_frete_gerar_movimento(v_id);
  elsif tg_table_name = 'frete_pagamentos' then perform public.fn_frete_pagamento_gerar_movimento(v_id);
  else perform public.fn_frete_ajuste_gerar_movimento(v_id);
  end if;
  return null;
end $$;

create trigger trg_fretes_movimento after insert or update or delete on public.fretes
  for each row execute function public.fn_frete_trg_movimento();
create trigger trg_frete_pagamentos_movimento after insert or update or delete on public.frete_pagamentos
  for each row execute function public.fn_frete_trg_movimento();
create trigger trg_frete_ajustes_movimento after insert or update or delete on public.frete_ajustes
  for each row execute function public.fn_frete_trg_movimento();

-- Depois da carga: refaz os movimentos de frete, pagamento e ajuste uma vez.
create or replace function public.fn_frete_recalcular_movimentos()
returns void language plpgsql security definer set search_path to '' as $$
declare r record;
begin
  for r in select id from public.fretes loop perform public.fn_frete_gerar_movimento(r.id); end loop;
  for r in select id from public.frete_pagamentos loop perform public.fn_frete_pagamento_gerar_movimento(r.id); end loop;
  for r in select id from public.frete_ajustes loop perform public.fn_frete_ajuste_gerar_movimento(r.id); end loop;
end $$;

-- =====================================================================
-- 3. Saldo e extrato (views da origem, com a RLS de quem lê)
-- =====================================================================

-- transportadora_saldos da origem: saldo = créditos - débitos; positivo, a EMT deve.
-- abatido_em_pagamento_id não veio (nunca foi usado, plano seção 5).
create or replace view public.transportadora_saldos with (security_invoker = true) as
select t.id as transportadora_id,
       coalesce(nullif(btrim(t.nome_fantasia), ''), t.razao_social) as nome,
       t.eh_transportadora, t.eh_dona_de_tanque,
       coalesce(sum(case when m.tipo in ('credito_frete', 'credito_abastecimento_transterra', 'ajuste_manual_credito') then m.valor
                         else -m.valor end), 0) as saldo,
       coalesce(sum(m.valor) filter (where m.tipo in ('debito_abastecimento_transterra', 'debito_abastecimento_emt')), 0) as debito_combustivel_total,
       coalesce(sum(m.valor) filter (where m.tipo = 'credito_frete'), 0) as credito_frete_total,
       coalesce(sum(m.valor) filter (where m.tipo = 'debito_pagamento_frete'), 0) as pago_frete_total,
       count(m.id) as qtd_movimentos
  from public.fornecedores t
  left join public.transportadora_movimentos m on m.transportadora_id = t.id
 where t.eh_transportadora or t.eh_dona_de_tanque
 group by t.id, t.nome_fantasia, t.razao_social, t.eh_transportadora, t.eh_dona_de_tanque;

-- transportadora_movimentos_detalhe da origem: o movimento com os campos do documento que o gerou.
create or replace view public.transportadora_movimentos_detalhe with (security_invoker = true) as
select m.id, m.transportadora_id, m.data, m.tipo, m.valor, m.origem_tabela, m.origem_id, m.descricao,
       m.centro_custo_id, m.mes_referencia, m.origem, m.created_at,
       f.peso_toneladas as frete_peso_toneladas, f.km_rodados as frete_km_rodados, f.valor_tkm as frete_valor_tkm,
       lo.nome as frete_origem, ld.nome as frete_destino, f.insumo_id as frete_insumo_id,
       f.nota_fiscal as frete_nota_fiscal, f.nota_fiscal2 as frete_nota_fiscal2, f.placa_carreta as frete_placa_carreta,
       f.motorista as frete_motorista,
       s.litros as saida_litros, s.preco_combustivel as saida_preco_combustivel,
       s.preco_proprietario as saida_preco_proprietario, s.taxa_litro as saida_taxa_litro,
       s.preco_medio_tanque as saida_preco_medio_tanque, s.insumo_id as saida_insumo_id,
       s.tipo_consumidor as saida_tipo_consumidor, s.placa as saida_placa, s.motorista as saida_motorista,
       s.observacoes as saida_observacoes,
       p.metodo as pagamento_metodo, p.nota_fiscal as pagamento_nota_fiscal, p.responsavel as pagamento_responsavel,
       p.pago_por as pagamento_pago_por, p.observacoes as pagamento_observacoes,
       p.quantidade_combustivel as pagamento_quantidade_combustivel,
       a.created_by as ajuste_criado_por
  from public.transportadora_movimentos m
  left join public.fretes f on m.origem_tabela = 'fretes' and f.id = m.origem_id
  left join public.localidades lo on lo.id = f.origem_localidade_id
  left join public.localidades ld on ld.id = f.destino_localidade_id
  left join public.combustivel_saidas s on m.origem_tabela = 'combustivel_saidas' and s.id = m.origem_id
  left join public.frete_pagamentos p on m.origem_tabela = 'frete_pagamentos' and p.id = m.origem_id
  left join public.frete_ajustes a on m.origem_tabela = 'frete_ajustes' and a.id = m.origem_id;

revoke all on public.transportadora_saldos from anon, authenticated;
revoke all on public.transportadora_movimentos_detalhe from anon, authenticated;
grant select on public.transportadora_saldos to authenticated;
grant select on public.transportadora_movimentos_detalhe to authenticated;

-- =====================================================================
-- 4. RPCs de escrita (regras da tela da origem)
-- =====================================================================

create or replace function public.fn_frete_exigir_transportadora(p_id uuid)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  -- A origem casa a transportadora com o fornecedor marcado como transportadora ou dono de tanque;
  -- sem isso não nasce o movimento. Aqui ela é obrigatória para o crédito sempre existir.
  if p_id is null then raise exception 'Selecione a transportadora'; end if;
  if not exists (select 1 from public.fornecedores where id = p_id and (eh_transportadora or eh_dona_de_tanque)) then
    raise exception 'O fornecedor escolhido não está marcado como transportadora no cadastro';
  end if;
end $$;

-- Frete e transferência (FreteForm da origem).
create or replace function public.fn_frete_salvar(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid; v_tipo text; v_peso numeric := (p_dados ->> 'peso_toneladas')::numeric;
  v_km numeric := (p_dados ->> 'km_rodados')::numeric; v_tkm numeric := (p_dados ->> 'valor_tkm')::numeric;
  v_vu numeric := coalesce((p_dados ->> 'valor_unitario_material')::numeric, 0);
  v_centro uuid := nullif(p_dados ->> 'centro_custo_id', '')::uuid;
  v_origem uuid := nullif(p_dados ->> 'origem_localidade_id', '')::uuid;
  v_destino uuid := nullif(p_dados ->> 'destino_localidade_id', '')::uuid;
  v_transp uuid := nullif(p_dados ->> 'transportadora_id', '')::uuid;
  v_insumo uuid := nullif(p_dados ->> 'insumo_id', '')::uuid;
  v_motorista text := btrim(coalesce(p_dados ->> 'motorista', ''));
  v_placa text := upper(nullif(btrim(coalesce(p_dados ->> 'placa_carreta', '')), ''));
  v_obs text := nullif(btrim(coalesce(p_dados ->> 'observacoes', '')), '');
  v_data date := nullif(p_dados ->> 'data', '')::date;
  v_chegada date := nullif(p_dados ->> 'data_chegada', '')::date;
  v_nf text; v_nf2 text;
begin
  if p_id is null and not public.tem_permissao('frete.fretes', 'criar') then raise exception 'Sem permissão para lançar frete'; end if;
  if p_id is not null and not public.tem_permissao('frete.fretes', 'editar') then raise exception 'Sem permissão para editar frete'; end if;
  if p_id is not null then
    -- Na edição o tipo não muda (a tela da origem não converte material em transferência).
    select tipo into v_tipo from public.fretes where id = p_id and excluido_em is null;
    if v_tipo is null then raise exception 'Frete não encontrado ou excluído'; end if;
  else
    v_tipo := coalesce(nullif(p_dados ->> 'tipo', ''), 'material');
    if v_tipo not in ('material', 'transferencia') then raise exception 'Tipo de frete inválido'; end if;
  end if;
  if v_data is null then raise exception 'Data de saída obrigatória'; end if;
  if v_tipo = 'material' and v_centro is null then raise exception 'Selecione a obra'; end if;
  if v_origem is null then raise exception 'Origem obrigatória'; end if;
  if v_destino is null then raise exception 'Destino obrigatório'; end if;
  perform public.fn_frete_exigir_transportadora(v_transp);
  if char_length(v_motorista) < 2 then raise exception 'Nome do motorista'; end if;
  if v_insumo is null then raise exception 'Selecione o material'; end if;
  if v_peso is null or v_peso <= 0 then raise exception 'Peso deve ser > 0'; end if;
  if v_km is null or v_km <= 0 then raise exception 'KM deve ser > 0'; end if;
  if v_tkm is null or v_tkm <= 0 then raise exception 'R$/TKM deve ser > 0'; end if;
  if v_vu < 0 then raise exception 'Valor unitário deve ser ≥ 0'; end if;
  if v_placa is not null and v_placa !~ '^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$' then raise exception 'Placa inválida (ex: ABC-1D34)'; end if;
  if char_length(coalesce(v_obs, '')) > 500 then raise exception 'Máximo 500 caracteres'; end if;
  if v_tipo = 'transferencia' then
    v_vu := 0; v_nf := null; v_nf2 := null;
  else
    v_nf := nullif(btrim(coalesce(p_dados ->> 'nota_fiscal', '')), '');
    v_nf2 := nullif(btrim(coalesce(p_dados ->> 'nota_fiscal2', '')), '');
  end if;

  if p_id is null then
    insert into public.fretes (tipo, data, data_chegada, centro_custo_id, origem_localidade_id, destino_localidade_id,
      transportadora_id, motorista, placa_carreta, insumo_id, peso_toneladas, km_rodados, valor_tkm, valor_total,
      valor_material, nota_fiscal, nota_fiscal2, observacoes, created_by, updated_by)
    values (v_tipo, v_data, v_chegada, v_centro, v_origem, v_destino, v_transp, v_motorista, v_placa, v_insumo,
      v_peso, v_km, v_tkm, v_peso * v_km * v_tkm, v_peso * v_vu, v_nf, v_nf2, v_obs, (select auth.uid()), (select auth.uid()))
    returning id into v_id;
  else
    update public.fretes set data = v_data, data_chegada = v_chegada, centro_custo_id = v_centro,
      origem_localidade_id = v_origem, destino_localidade_id = v_destino, transportadora_id = v_transp,
      motorista = v_motorista, placa_carreta = v_placa, insumo_id = v_insumo, peso_toneladas = v_peso,
      km_rodados = v_km, valor_tkm = v_tkm, valor_total = v_peso * v_km * v_tkm, valor_material = v_peso * v_vu,
      nota_fiscal = v_nf, nota_fiscal2 = v_nf2, observacoes = v_obs, updated_at = now(), updated_by = (select auth.uid())
     where id = p_id;
    v_id := p_id;
  end if;
  return v_id;
end $$;

-- Data de chegada editada na lista ou ao anexar a primeira foto da chegada (origem: sem senha).
create or replace function public.fn_frete_registrar_chegada(p_id uuid, p_data date)
returns void language plpgsql security definer set search_path to '' as $$
declare v_n int;
begin
  if not public.tem_permissao('frete.fretes', 'editar') then raise exception 'Sem permissão para editar frete'; end if;
  update public.fretes set data_chegada = p_data, updated_at = now(), updated_by = (select auth.uid())
   where id = p_id and excluido_em is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Frete não encontrado ou excluído'; end if;
end $$;

-- Pagamento de frete (PagamentoFreteForm da origem). Débito na conta corrente, sem lançamento.
create or replace function public.fn_frete_pagamento_salvar(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid; v_data date := nullif(p_dados ->> 'data', '')::date;
  v_transp uuid := nullif(p_dados ->> 'transportadora_id', '')::uuid;
  v_mes date := nullif(p_dados ->> 'mes_referencia', '')::date;
  v_valor numeric := (p_dados ->> 'valor')::numeric;
  v_metodo text := coalesce(nullif(p_dados ->> 'metodo', ''), 'pix');
  v_litros numeric := coalesce((p_dados ->> 'quantidade_combustivel')::numeric, 0);
  v_resp text := btrim(coalesce(p_dados ->> 'responsavel', ''));
  v_pago_por text := btrim(coalesce(p_dados ->> 'pago_por', ''));
  v_obs text := nullif(btrim(coalesce(p_dados ->> 'observacoes', '')), '');
begin
  if p_id is null and not public.tem_permissao('frete.pagamentos', 'criar') then raise exception 'Sem permissão para registrar pagamento'; end if;
  if p_id is not null and not public.tem_permissao('frete.pagamentos', 'editar') then raise exception 'Sem permissão para editar pagamento'; end if;
  if v_data is null then raise exception 'Data do pagamento obrigatória'; end if;
  perform public.fn_frete_exigir_transportadora(v_transp);
  if v_valor is null or v_valor <= 0 then raise exception 'Valor deve ser > 0'; end if;
  if v_metodo not in ('pix', 'boleto', 'cheque', 'dinheiro', 'transferencia', 'combustivel') then raise exception 'Selecione o método'; end if;
  if v_metodo = 'combustivel' and v_litros <= 0 then raise exception 'Quantidade obrigatória para pagamento em combustível'; end if;
  if v_metodo <> 'combustivel' then v_litros := 0; end if;
  if v_resp = '' then raise exception 'Responsável obrigatório'; end if;
  if v_pago_por = '' then raise exception 'Selecione quem pagou'; end if;
  if char_length(coalesce(v_obs, '')) > 500 then raise exception 'Máximo 500 caracteres'; end if;
  -- Sem mês de referência, o da data (é o que o gatilho da origem fazia).
  v_mes := date_trunc('month', coalesce(v_mes, v_data))::date;

  if p_id is null then
    insert into public.frete_pagamentos (data, transportadora_id, mes_referencia, valor, metodo, quantidade_combustivel,
      responsavel, nota_fiscal, pago_por, observacoes, created_by, updated_by)
    values (v_data, v_transp, v_mes, v_valor, v_metodo, v_litros, v_resp, nullif(btrim(coalesce(p_dados ->> 'nota_fiscal', '')), ''),
      v_pago_por, v_obs, (select auth.uid()), (select auth.uid()))
    returning id into v_id;
  else
    update public.frete_pagamentos set data = v_data, transportadora_id = v_transp, mes_referencia = v_mes, valor = v_valor,
      metodo = v_metodo, quantidade_combustivel = v_litros, responsavel = v_resp,
      nota_fiscal = nullif(btrim(coalesce(p_dados ->> 'nota_fiscal', '')), ''), pago_por = v_pago_por, observacoes = v_obs,
      updated_at = now(), updated_by = (select auth.uid())
     where id = p_id and excluido_em is null;
    if not found then raise exception 'Pagamento não encontrado ou excluído'; end if;
    v_id := p_id;
  end if;
  return v_id;
end $$;

-- Pedido de material na pedreira (PedidoMaterialForm da origem). Os itens são refeitos a cada gravação.
create or replace function public.fn_pedido_material_salvar(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid; v_data date := nullif(p_dados ->> 'data', '')::date;
  v_forn uuid := nullif(p_dados ->> 'fornecedor_id', '')::uuid;
  v_obs text := nullif(btrim(coalesce(p_dados ->> 'observacoes', '')), '');
  v_itens jsonb := coalesce(p_dados -> 'itens', '[]'::jsonb); v_item jsonb; v_ordem int := 0;
begin
  if p_id is null and not public.tem_permissao('frete.pedidos-material', 'criar') then raise exception 'Sem permissão para criar pedido'; end if;
  if p_id is not null and not public.tem_permissao('frete.pedidos-material', 'editar') then raise exception 'Sem permissão para editar pedido'; end if;
  if v_data is null then raise exception 'Data do pedido obrigatória'; end if;
  if v_forn is null or not exists (select 1 from public.fornecedores where id = v_forn) then raise exception 'Selecione o fornecedor'; end if;
  if char_length(coalesce(v_obs, '')) > 500 then raise exception 'Máximo 500 caracteres'; end if;
  if jsonb_typeof(v_itens) <> 'array' or jsonb_array_length(v_itens) = 0 then raise exception 'Adicione ao menos um material'; end if;
  for v_item in select * from jsonb_array_elements(v_itens) loop
    if nullif(v_item ->> 'insumo_id', '') is null or coalesce((v_item ->> 'quantidade')::numeric, 0) <= 0
       or coalesce((v_item ->> 'valor_unitario')::numeric, 0) <= 0 then
      raise exception 'Cada material precisa de quantidade e valor unitário maiores que zero';
    end if;
  end loop;

  if p_id is null then
    insert into public.pedidos_material (data, fornecedor_id, observacoes, created_by, updated_by)
    values (v_data, v_forn, v_obs, (select auth.uid()), (select auth.uid())) returning id into v_id;
  else
    update public.pedidos_material set data = v_data, fornecedor_id = v_forn, observacoes = v_obs, updated_at = now(),
      updated_by = (select auth.uid())
     where id = p_id and excluido_em is null;
    if not found then raise exception 'Pedido não encontrado ou excluído'; end if;
    v_id := p_id;
    delete from public.pedido_material_itens where pedido_id = v_id;
  end if;
  for v_item in select * from jsonb_array_elements(v_itens) loop
    v_ordem := v_ordem + 1;
    insert into public.pedido_material_itens (pedido_id, ordem, insumo_id, quantidade, valor_unitario)
    values (v_id, v_ordem, (v_item ->> 'insumo_id')::uuid, (v_item ->> 'quantidade')::numeric, (v_item ->> 'valor_unitario')::numeric);
  end loop;
  return v_id;
end $$;

-- Excluir e restaurar (lixeira do Frete da origem, com motivo e a permissão do recurso).
create or replace function public.fn_frete_recurso_da_tabela(p_tabela text)
returns text language sql immutable set search_path to '' as $$
  select case p_tabela when 'fretes' then 'frete.fretes' when 'frete_pagamentos' then 'frete.pagamentos'
                       when 'pedidos_material' then 'frete.pedidos-material' end;
$$;

create or replace function public.fn_frete_excluir(p_tabela text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text := public.fn_frete_recurso_da_tabela(p_tabela); v_n int;
begin
  if v_recurso is null then raise exception 'Tabela inválida'; end if;
  if not public.tem_permissao(v_recurso, 'excluir') then raise exception 'Sem permissão para excluir'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da exclusão'; end if;
  execute format('update public.%I set excluido_em = now(), excluido_por = $1, motivo_exclusao = $2 where id = $3 and excluido_em is null', p_tabela)
    using (select auth.uid()), btrim(p_motivo), p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado ou já excluído'; end if;
end $$;

create or replace function public.fn_frete_restaurar(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text := public.fn_frete_recurso_da_tabela(p_tabela); v_n int;
begin
  if v_recurso is null then raise exception 'Tabela inválida'; end if;
  if not (public.tem_permissao('administracao.lixeira', 'editar') and public.tem_permissao(v_recurso, 'excluir')) then
    raise exception 'Sem permissão para restaurar';
  end if;
  execute format('update public.%I set excluido_em = null, excluido_por = null, motivo_exclusao = null, updated_at = now() where id = $1 and excluido_em is not null', p_tabela)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado na lixeira'; end if;
end $$;

-- Ajuste de saldo: criar e editar só enquanto pendente; aprovar gera o movimento.
create or replace function public.fn_frete_ajuste_salvar(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid; v_transp uuid := nullif(p_dados ->> 'transportadora_id', '')::uuid;
  v_sinal text := p_dados ->> 'sinal'; v_valor numeric := (p_dados ->> 'valor')::numeric;
  v_data timestamptz := nullif(p_dados ->> 'data', '')::timestamptz;
  v_mes date := nullif(p_dados ->> 'mes_referencia', '')::date;
  v_desc text := btrim(coalesce(p_dados ->> 'descricao', ''));
  v_centro uuid := nullif(p_dados ->> 'centro_custo_id', '')::uuid;
begin
  if not public.tem_permissao('frete.ajustes', 'criar') then raise exception 'Sem permissão para ajustar saldo'; end if;
  perform public.fn_frete_exigir_transportadora(v_transp);
  if v_sinal not in ('credito', 'debito') then raise exception 'Escolha crédito ou débito'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor'; end if;
  if v_data is null then raise exception 'Informe a data'; end if;
  if v_desc = '' then raise exception 'Informe a descrição'; end if;
  v_mes := date_trunc('month', coalesce(v_mes, (v_data at time zone 'America/Rio_Branco')::date))::date;
  if p_id is null then
    insert into public.frete_ajustes (transportadora_id, sinal, valor, data, mes_referencia, centro_custo_id, descricao,
      created_by, updated_by)
    values (v_transp, v_sinal, v_valor, v_data, v_mes, v_centro, v_desc, (select auth.uid()), (select auth.uid()))
    returning id into v_id;
  else
    update public.frete_ajustes set transportadora_id = v_transp, sinal = v_sinal, valor = v_valor, data = v_data,
      mes_referencia = v_mes, centro_custo_id = v_centro, descricao = v_desc, updated_at = now(), updated_by = (select auth.uid())
     where id = p_id and status = 'pendente_aprovacao';
    if not found then raise exception 'Só dá para editar ajuste pendente: desaprove antes'; end if;
    v_id := p_id;
  end if;
  return v_id;
end $$;

create or replace function public.fn_frete_ajuste_aprovar(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.tem_permissao('frete.ajustes', 'aprovar') then raise exception 'Sem permissão para aprovar ajuste'; end if;
  update public.frete_ajustes set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now(),
    motivo_status = null, updated_at = now(), updated_by = (select auth.uid())
   where id = p_id and status = 'pendente_aprovacao';
  if not found then raise exception 'Ajuste não está pendente de aprovação'; end if;
end $$;

-- Rejeitar o pendente (fim) ou desaprovar o aprovado (volta a pendente e sai do saldo). Motivo sempre.
create or replace function public.fn_frete_ajuste_desaprovar(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  select status into v_status from public.frete_ajustes where id = p_id for update;
  if v_status is null then raise exception 'Ajuste não encontrado'; end if;
  if v_status = 'aprovado' then
    if not public.tem_permissao('frete.ajustes', 'desaprovar') then raise exception 'Sem permissão para desaprovar ajuste'; end if;
    update public.frete_ajustes set status = 'pendente_aprovacao', aprovado_por = null, aprovado_em = null,
      motivo_status = btrim(p_motivo), updated_at = now(), updated_by = (select auth.uid()) where id = p_id;
  elsif v_status = 'pendente_aprovacao' then
    if not public.tem_permissao('frete.ajustes', 'aprovar') then raise exception 'Sem permissão para rejeitar ajuste'; end if;
    update public.frete_ajustes set status = 'rejeitado', motivo_status = btrim(p_motivo), updated_at = now(),
      updated_by = (select auth.uid()) where id = p_id;
  else
    raise exception 'Ajuste já rejeitado';
  end if;
end $$;

create or replace function public.fn_frete_conferir_anomalia(p_chave text, p_conferida boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.tem_permissao('frete.anomalias', 'editar') then raise exception 'Sem permissão para conferir anomalia'; end if;
  if p_conferida then
    insert into public.frete_anomalias_conferidas (chave, motivo, conferido_por) values (btrim(p_chave), nullif(btrim(p_motivo), ''), (select auth.uid()))
    on conflict (chave) do update set motivo = excluded.motivo, conferido_por = excluded.conferido_por, conferido_em = now();
  else
    delete from public.frete_anomalias_conferidas where chave = btrim(p_chave);
  end if;
end $$;

-- Cards do painel: plano 4.1, painel/ver + pagamentos/criar.
create or replace function public.fn_frete_painel_config_salvar(p_fornecedores uuid[])
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not (public.tem_permissao('frete.painel', 'ver') and public.tem_permissao('frete.pagamentos', 'criar')) then
    raise exception 'Sem permissão para configurar os cards';
  end if;
  update public.frete_painel_config set fornecedor_ids = coalesce(p_fornecedores, '{}'), updated_at = now(),
    updated_by = (select auth.uid()) where id = 'global';
end $$;

do $grants$
declare f text;
begin
  foreach f in array array['fn_frete_salvar(uuid,jsonb)', 'fn_frete_registrar_chegada(uuid,date)',
    'fn_frete_pagamento_salvar(uuid,jsonb)', 'fn_pedido_material_salvar(uuid,jsonb)', 'fn_frete_excluir(text,uuid,text)',
    'fn_frete_restaurar(text,uuid)', 'fn_frete_ajuste_salvar(uuid,jsonb)', 'fn_frete_ajuste_aprovar(uuid)',
    'fn_frete_ajuste_desaprovar(uuid,text)', 'fn_frete_conferir_anomalia(text,boolean,text)',
    'fn_frete_painel_config_salvar(uuid[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['fn_frete_gerar_movimento(uuid)', 'fn_frete_pagamento_gerar_movimento(uuid)',
    'fn_frete_ajuste_gerar_movimento(uuid)', 'fn_frete_trg_movimento()', 'fn_frete_recalcular_movimentos()',
    'fn_frete_exigir_transportadora(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['fn_frete_meio_dia(date)', 'fn_frete_recurso_da_tabela(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $grants$;

-- =====================================================================
-- 5. Anexos: fotos do frete (a primeira da chegada à parte), comprovantes e os do Combustível
-- =====================================================================
-- Alterada a partir da definição viva (24/09): só acrescenta as entidades novas. As do Combustível
-- entram aqui porque a carga do Frete e do Combustível é uma só e o anexo vem junto com a linha.
create or replace function public.fn_recurso_da_entidade(p_tipo text)
 returns text language sql immutable set search_path to ''
as $function$
  select case p_tipo
    when 'cotacao'        then 'compras.cotacoes'
    when 'ordem_compra'   then 'compras.ordens'
    when 'lancamento'     then 'financeiro.lancamentos'
    when 'pagamento'      then 'financeiro.pagamentos'
    when 'rh_documento'   then 'rh.documentos'
    when 'rh_epi'         then 'rh.epis'
    when 'rh_ocorrencia'  then 'rh.ocorrencias'
    when 'equipamento_documento' then 'cadastros.equipamentos'
    when 'frete'          then 'frete.fretes'
    when 'frete_chegada'  then 'frete.fretes'
    when 'frete_pagamento' then 'frete.pagamentos'
    when 'pedido_material' then 'frete.pedidos-material'
    when 'combustivel_entrada' then 'combustivel.entradas'
    when 'combustivel_saida' then 'combustivel.saidas'
    when 'combustivel_transferencia' then 'combustivel.transferencias'
    else null
  end;
$function$;

-- =====================================================================
-- 6. Permissões: perfil Admin e os 4 Admins ativos (plano 4.3). Os outros, o Tiago monta.
-- =====================================================================
with acoes(recurso, acao) as (values
  ('frete.painel', 'ver'),
  ('frete.fretes', 'ver'), ('frete.fretes', 'criar'), ('frete.fretes', 'editar'), ('frete.fretes', 'excluir'),
  ('frete.pedidos-material', 'ver'), ('frete.pedidos-material', 'criar'), ('frete.pedidos-material', 'editar'), ('frete.pedidos-material', 'excluir'),
  ('frete.conta-corrente', 'ver'),
  ('frete.pagamentos', 'ver'), ('frete.pagamentos', 'criar'), ('frete.pagamentos', 'editar'), ('frete.pagamentos', 'excluir'),
  ('frete.ajustes', 'ver'), ('frete.ajustes', 'criar'), ('frete.ajustes', 'aprovar'), ('frete.ajustes', 'desaprovar'),
  ('frete.anomalias', 'ver'), ('frete.anomalias', 'editar')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('frete.painel', 'ver'),
  ('frete.fretes', 'ver'), ('frete.fretes', 'criar'), ('frete.fretes', 'editar'), ('frete.fretes', 'excluir'),
  ('frete.pedidos-material', 'ver'), ('frete.pedidos-material', 'criar'), ('frete.pedidos-material', 'editar'), ('frete.pedidos-material', 'excluir'),
  ('frete.conta-corrente', 'ver'),
  ('frete.pagamentos', 'ver'), ('frete.pagamentos', 'criar'), ('frete.pagamentos', 'editar'), ('frete.pagamentos', 'excluir'),
  ('frete.ajustes', 'ver'), ('frete.ajustes', 'criar'), ('frete.ajustes', 'aprovar'), ('frete.ajustes', 'desaprovar'),
  ('frete.anomalias', 'ver'), ('frete.anomalias', 'editar')
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
  select count(distinct usuario_id) into v from public.usuario_permissoes where recurso like 'frete.%';
  if v <> 4 then raise exception 'Frete foi para % usuários; o plano diz 4 Admins ativos', v; end if;
  select count(*) into v from public.usuario_permissoes where recurso like 'frete.%';
  if v <> 80 then raise exception 'Esperado 80 permissões de frete (20 x 4 Admins), veio %', v; end if;
end $confere$;
