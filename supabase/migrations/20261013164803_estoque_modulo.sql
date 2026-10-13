-- Módulo Estoque (13/10/2026).
--
-- Pedido do Tiago: estoque SEM conexão com o Financeiro, ligado só a Compras (a entrada
-- pode puxar um item de OC). Depósitos e tanques são criados aqui. O combustível e as
-- peças aparecem na posição, mas entram e saem pelos módulos deles. Só o que entrou
-- pelo Estoque sai pelo Estoque. A saída leva o custo PEPS das entradas (como o
-- combustível) e vai para um centro de custo, na etapa quando houver.
--
-- Nada aqui gera lançamento, parcela ou rateio: o custo da saída é informação gerencial
-- e não soma no custo de obra (que continua sendo o dos lançamentos, decisão de 29/07).
--
-- Os depósitos são a tabela que já existe (`almoxarifado_depositos`): um depósito só
-- serve materiais e peças. Os tanques são os do combustível (`tanques`). A criação dos
-- dois passa para os recursos `estoque.depositos` e `estoque.tanques`.

-- 1. Quem vê alguma aba do Estoque ------------------------------------------------------

create or replace function public.fn_ve_estoque()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.tem_permissao('estoque.posicao', 'ver')
      or public.tem_permissao('estoque.entradas', 'ver')
      or public.tem_permissao('estoque.saidas', 'ver')
      or public.tem_permissao('estoque.depositos', 'ver')
      or public.tem_permissao('estoque.tanques', 'ver');
$$;
revoke all on function public.fn_ve_estoque() from public, anon;
grant execute on function public.fn_ve_estoque() to authenticated;

-- 2. Tabelas ----------------------------------------------------------------------------

-- Entrada: cada uma é uma camada PEPS. Valor com 4 casas, como Combustível e Manutenção:
-- o Estoque não toca o centavo do Financeiro.
create table public.estoque_entradas (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references public.almoxarifado_depositos(id),
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  valor_unitario numeric(14,4) not null check (valor_unitario >= 0),
  valor_total numeric(14,4) generated always as (round(quantidade * valor_unitario, 4)) stored,
  data date not null,
  -- Origem na OC. O número fica copiado: se a OC sumir, a entrada continua dizendo de onde veio.
  ordem_compra_id uuid references public.ordens_compra(id) on delete set null,
  oc_item_id uuid references public.oc_itens(id) on delete set null,
  oc_numero text,
  fornecedor_id uuid references public.fornecedores(id),
  nota_fiscal text,
  observacoes text,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index idx_estoque_entradas_peps on public.estoque_entradas (deposito_id, insumo_id, data, created_at) where excluido_em is null;
create index idx_estoque_entradas_oc_item on public.estoque_entradas (oc_item_id) where oc_item_id is not null;
create index idx_estoque_entradas_oc on public.estoque_entradas (ordem_compra_id) where ordem_compra_id is not null;
create index idx_estoque_entradas_insumo on public.estoque_entradas (insumo_id);
create index idx_estoque_entradas_fornecedor on public.estoque_entradas (fornecedor_id) where fornecedor_id is not null;

-- Saída: o custo vem do PEPS (gatilho), nunca do formulário.
create table public.estoque_saidas (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references public.almoxarifado_depositos(id),
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  data date not null,
  centro_custo_id uuid not null references public.centros_custo(id),
  custo_unitario numeric(14,4) not null default 0 check (custo_unitario >= 0),
  valor_total numeric(14,4) not null default 0 check (valor_total >= 0),
  observacoes text,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index idx_estoque_saidas_peps on public.estoque_saidas (deposito_id, insumo_id, data, created_at) where excluido_em is null;
create index idx_estoque_saidas_centro on public.estoque_saidas (centro_custo_id);
create index idx_estoque_saidas_insumo on public.estoque_saidas (insumo_id);

-- De quais entradas cada saída tirou. Derivada: refeita pelo PEPS a cada mudança, por isso sem auditoria.
create table public.estoque_saida_camadas (
  id uuid primary key default gen_random_uuid(),
  saida_id uuid not null references public.estoque_saidas(id) on delete cascade,
  entrada_id uuid not null references public.estoque_entradas(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  valor_unitario numeric(14,4) not null check (valor_unitario >= 0),
  created_at timestamptz not null default now()
);
create index idx_estoque_camadas_saida on public.estoque_saida_camadas (saida_id);
create index idx_estoque_camadas_entrada on public.estoque_saida_camadas (entrada_id);

-- RLS: leitura por quem vê o Estoque; escrita só pelas funções abaixo.
alter table public.estoque_entradas enable row level security;
alter table public.estoque_saidas enable row level security;
alter table public.estoque_saida_camadas enable row level security;
create policy estoque_entradas_select on public.estoque_entradas for select to authenticated using ((select public.fn_ve_estoque()));
create policy estoque_saidas_select on public.estoque_saidas for select to authenticated using ((select public.fn_ve_estoque()));
create policy estoque_saida_camadas_select on public.estoque_saida_camadas for select to authenticated using ((select public.fn_ve_estoque()));
revoke all on public.estoque_entradas, public.estoque_saidas, public.estoque_saida_camadas from anon, authenticated;
grant select on public.estoque_entradas, public.estoque_saidas, public.estoque_saida_camadas to authenticated;

create trigger trg_estoque_entradas_updated_at before update on public.estoque_entradas for each row execute function public.fn_set_updated_at();
create trigger trg_set_created_by before insert on public.estoque_entradas for each row execute function public.fn_set_created_by();
create trigger trg_audit_estoque_entradas after insert or delete or update on public.estoque_entradas for each row execute function public.fn_audit();
create trigger trg_estoque_saidas_updated_at before update on public.estoque_saidas for each row execute function public.fn_set_updated_at();
create trigger trg_set_created_by before insert on public.estoque_saidas for each row execute function public.fn_set_created_by();
create trigger trg_audit_estoque_saidas after insert or delete or update on public.estoque_saidas for each row execute function public.fn_audit();

-- 3. PEPS ---------------------------------------------------------------------------------

-- Refaz o PEPS de um insumo num depósito: as saídas, da mais antiga para a mais nova,
-- consomem as entradas mais antigas com data até a da saída. Faltou saldo: recusa.
create or replace function public.fn_estoque_recalcular_peps(p_deposito uuid, p_insumo uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  s record;
  e record;
  v_falta numeric;
  v_q numeric;
  v_valor numeric;
  v_nome text;
begin
  -- Serializa quem mexe no mesmo insumo + depósito.
  perform pg_advisory_xact_lock(hashtext('estoque:' || p_deposito::text || ':' || p_insumo::text));

  delete from public.estoque_saida_camadas c
  using public.estoque_saidas s2
  where c.saida_id = s2.id and s2.deposito_id = p_deposito and s2.insumo_id = p_insumo;

  for s in
    select id, quantidade, data from public.estoque_saidas
    where deposito_id = p_deposito and insumo_id = p_insumo and excluido_em is null
    order by data, created_at, id
  loop
    v_falta := s.quantidade;
    v_valor := 0;
    for e in
      select en.id, en.valor_unitario,
             en.quantidade - coalesce((select sum(c.quantidade) from public.estoque_saida_camadas c where c.entrada_id = en.id), 0) as restante
      from public.estoque_entradas en
      where en.deposito_id = p_deposito and en.insumo_id = p_insumo and en.excluido_em is null and en.data <= s.data
      order by en.data, en.created_at, en.id
    loop
      continue when e.restante <= 0;
      v_q := least(e.restante, v_falta);
      insert into public.estoque_saida_camadas (saida_id, entrada_id, quantidade, valor_unitario)
      values (s.id, e.id, v_q, e.valor_unitario);
      v_valor := v_valor + v_q * e.valor_unitario;
      v_falta := v_falta - v_q;
      exit when v_falta <= 0;
    end loop;

    if v_falta > 0 then
      select nome into v_nome from public.insumos where id = p_insumo;
      raise exception 'Saldo insuficiente de % em %: faltam %', v_nome, to_char(s.data, 'DD/MM/YYYY'),
        trim(trailing ',' from trim(trailing '0' from replace(v_falta::text, '.', ',')))
        using errcode = 'P0001';
    end if;

    update public.estoque_saidas
    set valor_total = round(v_valor, 4), custo_unitario = round(v_valor / s.quantidade, 4)
    where id = s.id and (valor_total, custo_unitario) is distinct from (round(v_valor, 4), round(v_valor / s.quantidade, 4));
  end loop;
end $$;

create or replace function public.fn_estoque_trg_peps()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fn_estoque_recalcular_peps(old.deposito_id, old.insumo_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or (new.deposito_id, new.insumo_id) is distinct from (old.deposito_id, old.insumo_id)) then
    perform public.fn_estoque_recalcular_peps(new.deposito_id, new.insumo_id);
  end if;
  return null;
end $$;

-- Só as colunas que mudam o PEPS: o próprio recálculo grava valor/custo da saída e não pode se redisparar.
create trigger trg_estoque_entradas_peps
  after insert or delete or update of deposito_id, insumo_id, quantidade, valor_unitario, data, excluido_em
  on public.estoque_entradas for each row execute function public.fn_estoque_trg_peps();
create trigger trg_estoque_saidas_peps
  after insert or delete or update of deposito_id, insumo_id, quantidade, data, excluido_em
  on public.estoque_saidas for each row execute function public.fn_estoque_trg_peps();

-- 4. Escrita ------------------------------------------------------------------------------

-- Quanto de um item de OC ainda pode entrar (descontando a própria entrada, na edição).
create or replace function public.fn_estoque_restante_oc_item(p_oc_item uuid, p_ignorar uuid default null)
returns numeric language sql stable security definer set search_path to '' as $$
  select i.quantidade - coalesce((
    select sum(e.quantidade) from public.estoque_entradas e
    where e.oc_item_id = i.id and e.excluido_em is null and e.id is distinct from p_ignorar), 0)
  from public.oc_itens i where i.id = p_oc_item;
$$;

-- Cria (p_id nulo) ou edita uma entrada. Com item de OC, insumo, preço e fornecedor vêm da OC.
create or replace function public.fn_estoque_salvar_entrada(
  p_id uuid,
  p_deposito uuid,
  p_insumo uuid,
  p_quantidade numeric,
  p_valor_unitario numeric,
  p_data date,
  p_oc_item uuid default null,
  p_nota_fiscal text default null,
  p_observacoes text default null
) returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid;
  v_atual public.estoque_entradas%rowtype;
  v_oc record;
  v_restante numeric;
  v_insumo uuid := p_insumo;
  v_valor numeric := p_valor_unitario;
  v_fornecedor uuid;
  v_oc_id uuid;
  v_oc_numero text;
begin
  if p_id is null then
    if not public.tem_permissao('estoque.entradas', 'criar') then raise exception 'Sem permissão para registrar entradas'; end if;
  else
    if not public.tem_permissao('estoque.entradas', 'editar') then raise exception 'Sem permissão para editar entradas'; end if;
    select * into v_atual from public.estoque_entradas where id = p_id and excluido_em is null for update;
    if not found then raise exception 'Entrada não encontrada ou excluída'; end if;
  end if;

  if p_data is null then raise exception 'Informe a data da entrada'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'A quantidade tem de ser maior que zero'; end if;
  if not exists (select 1 from public.almoxarifado_depositos where id = p_deposito and ativo) then
    raise exception 'Depósito inexistente ou inativo';
  end if;

  if p_oc_item is not null then
    select i.insumo_id, i.preco_unitario, o.id as oc_id, o.numero, o.status, o.fornecedor_id
      into v_oc
    from public.oc_itens i join public.ordens_compra o on o.id = i.ordem_compra_id
    where i.id = p_oc_item;
    if not found then raise exception 'Item da OC não encontrado'; end if;
    if v_oc.status not in ('aprovado', 'recebido', 'pago') then
      raise exception 'A OC % não está aprovada', v_oc.numero;
    end if;
    v_restante := public.fn_estoque_restante_oc_item(p_oc_item, p_id);
    if p_quantidade > v_restante then
      raise exception 'A OC % só tem % deste item para dar entrada', v_oc.numero,
        trim(trailing ',' from trim(trailing '0' from replace(v_restante::text, '.', ',')));
    end if;
    v_insumo := v_oc.insumo_id;
    v_valor := v_oc.preco_unitario;
    v_fornecedor := v_oc.fornecedor_id;
    v_oc_id := v_oc.oc_id;
    v_oc_numero := v_oc.numero;
  else
    if v_valor is null or v_valor < 0 then raise exception 'Informe o valor unitário'; end if;
    if not exists (select 1 from public.insumos where id = v_insumo and (ativo or v_insumo = v_atual.insumo_id)) then
      raise exception 'Insumo inexistente ou inativo';
    end if;
  end if;

  if p_id is null then
    insert into public.estoque_entradas (deposito_id, insumo_id, quantidade, valor_unitario, data,
      ordem_compra_id, oc_item_id, oc_numero, fornecedor_id, nota_fiscal, observacoes)
    values (p_deposito, v_insumo, p_quantidade, v_valor, p_data,
      v_oc_id, p_oc_item, v_oc_numero, v_fornecedor, nullif(btrim(p_nota_fiscal), ''), nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update public.estoque_entradas set
      deposito_id = p_deposito, insumo_id = v_insumo, quantidade = p_quantidade, valor_unitario = v_valor, data = p_data,
      ordem_compra_id = v_oc_id, oc_item_id = p_oc_item, oc_numero = v_oc_numero, fornecedor_id = v_fornecedor,
      nota_fiscal = nullif(btrim(p_nota_fiscal), ''), observacoes = nullif(btrim(p_observacoes), '')
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Cria (p_id nulo) ou edita uma saída. O custo sai do PEPS no gatilho.
create or replace function public.fn_estoque_salvar_saida(
  p_id uuid,
  p_deposito uuid,
  p_insumo uuid,
  p_quantidade numeric,
  p_data date,
  p_centro_custo uuid,
  p_observacoes text default null
) returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  if p_id is null then
    if not public.tem_permissao('estoque.saidas', 'criar') then raise exception 'Sem permissão para registrar saídas'; end if;
  else
    if not public.tem_permissao('estoque.saidas', 'editar') then raise exception 'Sem permissão para editar saídas'; end if;
    perform 1 from public.estoque_saidas where id = p_id and excluido_em is null for update;
    if not found then raise exception 'Saída não encontrada ou excluída'; end if;
  end if;

  if p_data is null then raise exception 'Informe a data da saída'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'A quantidade tem de ser maior que zero'; end if;
  if not exists (select 1 from public.almoxarifado_depositos where id = p_deposito) then raise exception 'Depósito inexistente'; end if;
  if not exists (select 1 from public.insumos where id = p_insumo) then raise exception 'Insumo inexistente'; end if;
  if p_centro_custo is null then raise exception 'Informe o centro de custo'; end if;
  if not exists (select 1 from public.centros_custo where id = p_centro_custo and ativo) then
    raise exception 'Centro de custo inexistente ou inativo';
  end if;

  if p_id is null then
    insert into public.estoque_saidas (deposito_id, insumo_id, quantidade, data, centro_custo_id, observacoes)
    values (p_deposito, p_insumo, p_quantidade, p_data, p_centro_custo, nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update public.estoque_saidas set
      deposito_id = p_deposito, insumo_id = p_insumo, quantidade = p_quantidade, data = p_data,
      centro_custo_id = p_centro_custo, observacoes = nullif(btrim(p_observacoes), '')
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Exclusão com motivo (vai para a lixeira do próprio registro) e restauração.
create or replace function public.fn_estoque_excluir(p_tabela text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text; v_n int;
begin
  v_recurso := case p_tabela when 'estoque_entradas' then 'estoque.entradas' when 'estoque_saidas' then 'estoque.saidas' end;
  if v_recurso is null then raise exception 'Tabela inválida'; end if;
  if not public.tem_permissao(v_recurso, 'excluir') then raise exception 'Sem permissão para excluir'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da exclusão'; end if;
  execute format('update public.%I set excluido_em = now(), excluido_por = $1, motivo_exclusao = $2 where id = $3 and excluido_em is null', p_tabela)
    using (select auth.uid()), btrim(p_motivo), p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado ou já excluído'; end if;
end $$;

create or replace function public.fn_estoque_restaurar(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text; v_n int; v_item uuid; v_qtd numeric;
begin
  v_recurso := case p_tabela when 'estoque_entradas' then 'estoque.entradas' when 'estoque_saidas' then 'estoque.saidas' end;
  if v_recurso is null then raise exception 'Tabela inválida'; end if;
  if not public.tem_permissao(v_recurso, 'excluir') then raise exception 'Sem permissão para restaurar'; end if;
  if p_tabela = 'estoque_entradas' then
    select oc_item_id, quantidade into v_item, v_qtd from public.estoque_entradas where id = p_id and excluido_em is not null;
    if v_item is not null and v_qtd > public.fn_estoque_restante_oc_item(v_item, p_id) then
      raise exception 'O item da OC já teve outra entrada no lugar desta';
    end if;
  end if;
  execute format('update public.%I set excluido_em = null, excluido_por = null, motivo_exclusao = null where id = $1 and excluido_em is not null', p_tabela)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado ou não excluído'; end if;
end $$;

-- 5. Leitura ------------------------------------------------------------------------------

-- Itens de OC aprovada que ainda têm quantidade para entrar. Quem dá entrada não precisa
-- ver o módulo Compras: a função lê a OC só para isso.
create or replace function public.fn_estoque_oc_itens_disponiveis()
returns table (
  oc_item_id uuid,
  ordem_compra_id uuid,
  oc_numero text,
  oc_status text,
  data_compra date,
  fornecedor_nome text,
  insumo_id uuid,
  insumo_nome text,
  unidade text,
  quantidade numeric,
  quantidade_restante numeric,
  preco_unitario numeric,
  centro_custo_nome text
) language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  if not (public.tem_permissao('estoque.entradas', 'criar') or public.tem_permissao('estoque.entradas', 'editar')) then
    raise exception 'Sem permissão para registrar entradas';
  end if;
  return query
  select i.id, o.id, o.numero, o.status, o.data_compra, coalesce(f.nome_fantasia, f.razao_social), i.insumo_id, ins.nome, u.sigla,
         i.quantidade, public.fn_estoque_restante_oc_item(i.id), i.preco_unitario, cc.nome
  from public.oc_itens i
  join public.ordens_compra o on o.id = i.ordem_compra_id
  join public.insumos ins on ins.id = i.insumo_id
  left join public.unidades_medida u on u.id = ins.unidade_id
  left join public.fornecedores f on f.id = o.fornecedor_id
  left join public.centros_custo cc on cc.id = i.centro_custo_id
  where o.status in ('aprovado', 'recebido', 'pago')
    and public.fn_estoque_restante_oc_item(i.id) > 0
  order by o.data_compra desc nulls last, o.numero desc, ins.nome;
end $$;

-- Posição consolidada: materiais do Estoque, combustível por tanque, peças por depósito.
create or replace function public.fn_estoque_posicao()
returns table (
  origem text,
  local_tipo text,
  local_id uuid,
  local_nome text,
  insumo_id uuid,
  insumo_nome text,
  unidade text,
  quantidade numeric,
  valor numeric
) language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  if not public.tem_permissao('estoque.posicao', 'ver') then raise exception 'Sem permissão para ver a posição do estoque'; end if;
  return query
  with mov as (
    select e.deposito_id, e.insumo_id, e.quantidade as q, e.valor_total as v
    from public.estoque_entradas e where e.excluido_em is null
    union all
    select s.deposito_id, s.insumo_id, -s.quantidade, -s.valor_total
    from public.estoque_saidas s where s.excluido_em is null
  ), est as (
    select deposito_id, insumo_id, sum(q) as q, sum(v) as v from mov group by deposito_id, insumo_id
  )
  select 'estoque'::text, 'deposito'::text, d.id, d.nome, i.id, i.nome, u.sigla, est.q, round(est.v, 4)
  from est
  join public.almoxarifado_depositos d on d.id = est.deposito_id
  join public.insumos i on i.id = est.insumo_id
  left join public.unidades_medida u on u.id = i.unidade_id
  where est.q <> 0
  union all
  select 'combustivel'::text, 'tanque'::text, t.id, t.nome, i.id, i.nome, 'L'::text, t.nivel_atual_litros,
         round(t.nivel_atual_litros * coalesce(public.fn_comb_preco_medio_tanque(t.id), 0), 4)
  from public.tanques t
  left join public.insumos i on i.id = t.combustivel_atual_id
  where t.ativo
  union all
  select 'pecas'::text, 'deposito'::text, d.id, d.nome, i.id, i.nome, u.sigla, s.saldo, round(s.saldo * s.custo_medio, 4)
  from public.almoxarifado_saldos s
  join public.almoxarifado_depositos d on d.id = s.deposito_id
  join public.insumos i on i.id = s.insumo_id
  left join public.unidades_medida u on u.id = i.unidade_id
  where s.saldo <> 0;
end $$;

-- Grants das funções: só authenticated; as internas (PEPS e gatilho) ninguém chama de fora.
do $grants$
declare f text;
begin
  foreach f in array array[
    'fn_estoque_salvar_entrada(uuid,uuid,uuid,numeric,numeric,date,uuid,text,text)',
    'fn_estoque_salvar_saida(uuid,uuid,uuid,numeric,date,uuid,text)',
    'fn_estoque_excluir(text,uuid,text)', 'fn_estoque_restaurar(text,uuid)',
    'fn_estoque_oc_itens_disponiveis()', 'fn_estoque_posicao()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['fn_estoque_recalcular_peps(uuid,uuid)', 'fn_estoque_trg_peps()', 'fn_estoque_restante_oc_item(uuid,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $grants$;

-- 6. Depósitos e tanques passam a ser criados no Estoque ------------------------------------

alter policy almoxarifado_depositos_select on public.almoxarifado_depositos
  using ((select public.fn_ve_manutencao()) or (select public.fn_ve_estoque()));
alter policy almoxarifado_depositos_insert on public.almoxarifado_depositos
  with check ((select public.tem_permissao('estoque.depositos', 'criar')));
alter policy almoxarifado_depositos_update on public.almoxarifado_depositos
  using ((select public.tem_permissao('estoque.depositos', 'editar')))
  with check ((select public.tem_permissao('estoque.depositos', 'editar')));

alter policy tanques_select on public.tanques
  using ((select public.fn_ve_combustivel()) or (select public.fn_ve_estoque()));
alter policy tanques_insert on public.tanques
  with check ((select public.tem_permissao('estoque.tanques', 'criar')));
alter policy tanques_update on public.tanques
  using ((select public.tem_permissao('estoque.tanques', 'editar')))
  with check ((select public.tem_permissao('estoque.tanques', 'editar')));

-- Cadastros que as telas do Estoque leem (redefinidas a partir das policies vivas de 13/10).
alter policy insumos_select on public.insumos using (
  (select public.tem_permissao('cadastros.insumos', 'ver')) or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver')) or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.fn_ve_manutencao()) or (select public.fn_ve_combustivel()) or (select public.fn_ve_frete())
  or (select public.fn_ve_estoque()));
alter policy unidades_medida_select on public.unidades_medida using (
  (select public.tem_permissao('cadastros.unidades', 'ver')) or (select public.fn_ve_manutencao())
  or (select public.fn_ve_combustivel()) or (select public.fn_ve_frete()) or (select public.fn_ve_execucao())
  or (select public.fn_ve_estoque()));
alter policy centros_custo_select on public.centros_custo using (
  (select public.tem_permissao('cadastros.centros-custo', 'ver')) or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver')) or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
  or (select public.tem_permissao('financeiro.recebimentos', 'ver')) or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.tem_permissao('rh.folha', 'ver')) or (select public.tem_permissao('cadastros.colaboradores', 'ver'))
  or (select public.fn_ve_manutencao()) or (select public.fn_ve_combustivel()) or (select public.fn_ve_frete())
  or (select public.fn_ve_estoque()));
alter policy fornecedores_select on public.fornecedores using (
  (select public.tem_permissao('cadastros.fornecedores', 'ver')) or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver')) or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
  or (select public.tem_permissao('financeiro.pagamentos', 'ver')) or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
  or (select public.tem_permissao('financeiro.recebimentos', 'ver')) or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.fn_ve_manutencao()) or (select public.fn_ve_combustivel()) or (select public.fn_ve_frete())
  or (select public.fn_ve_estoque()));

-- Exclusão de cadastro pela lixeira: depósito e tanque agora são do Estoque.
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
    when 'almoxarifado_depositos' then 'estoque.depositos'
    when 'tanques'           then 'estoque.tanques'
    else null
  end;
$function$;

-- 7. Permissões -----------------------------------------------------------------------------

-- Admin (perfil e usuários ativos) ganha o módulo inteiro.
with acoes(recurso, acao) as (values
  ('estoque.posicao', 'ver'),
  ('estoque.entradas', 'ver'), ('estoque.entradas', 'criar'), ('estoque.entradas', 'editar'), ('estoque.entradas', 'excluir'),
  ('estoque.saidas', 'ver'), ('estoque.saidas', 'criar'), ('estoque.saidas', 'editar'), ('estoque.saidas', 'excluir'),
  ('estoque.depositos', 'ver'), ('estoque.depositos', 'criar'), ('estoque.depositos', 'editar'), ('estoque.depositos', 'excluir'),
  ('estoque.tanques', 'ver'), ('estoque.tanques', 'criar'), ('estoque.tanques', 'editar'), ('estoque.tanques', 'excluir')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('estoque.posicao', 'ver'),
  ('estoque.entradas', 'ver'), ('estoque.entradas', 'criar'), ('estoque.entradas', 'editar'), ('estoque.entradas', 'excluir'),
  ('estoque.saidas', 'ver'), ('estoque.saidas', 'criar'), ('estoque.saidas', 'editar'), ('estoque.saidas', 'excluir'),
  ('estoque.depositos', 'ver'), ('estoque.depositos', 'criar'), ('estoque.depositos', 'editar'), ('estoque.depositos', 'excluir'),
  ('estoque.tanques', 'ver'), ('estoque.tanques', 'criar'), ('estoque.tanques', 'editar'), ('estoque.tanques', 'excluir')
)
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, a.recurso, a.acao
from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
cross join acoes a
where u.ativo and u.excluido_em is null
on conflict (usuario_id, recurso, acao) do nothing;

-- Quem cuidava dos tanques no Combustível e dos depósitos na Manutenção continua cuidando, agora no Estoque.
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select usuario_id, 'estoque.tanques', acao from public.usuario_permissoes
where recurso = 'combustivel.tanques' and acao in ('ver', 'criar', 'editar', 'excluir')
on conflict (usuario_id, recurso, acao) do nothing;
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select usuario_id, 'estoque.depositos', acao from public.usuario_permissoes
where recurso = 'manutencao.almoxarifado' and acao in ('ver', 'criar', 'editar', 'excluir')
on conflict (usuario_id, recurso, acao) do nothing;
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select perfil_id, 'estoque.tanques', acao from public.perfil_permissoes
where recurso = 'combustivel.tanques' and acao in ('ver', 'criar', 'editar', 'excluir')
on conflict (perfil_id, recurso, acao) do nothing;
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select perfil_id, 'estoque.depositos', acao from public.perfil_permissoes
where recurso = 'manutencao.almoxarifado' and acao in ('ver', 'criar', 'editar', 'excluir')
on conflict (perfil_id, recurso, acao) do nothing;

do $confere$
declare v_admins int; v int;
begin
  select count(*) into v_admins
  from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
  where u.ativo and u.excluido_em is null;
  select count(*) into v
  from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
  join public.usuario_permissoes up on up.usuario_id = u.id and up.recurso like 'estoque.%'
  where u.ativo and u.excluido_em is null;
  if v <> v_admins * 17 then raise exception 'Esperado % permissões de estoque nos Admins (17 x %), veio %', v_admins * 17, v_admins, v; end if;
end $confere$;
