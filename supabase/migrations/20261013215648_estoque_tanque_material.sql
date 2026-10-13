-- Estoque: tanque de material (13/10/2026).
--
-- Pedido do Tiago: "os tanques não são somente para combustível". O tanque ganha um USO:
-- 'combustivel' (movimentado só pelo módulo Combustível, como sempre) ou 'material' (CAP,
-- emulsão etc., movimentado só pelo Estoque, com o mesmo PEPS dos depósitos).
--
-- - Entrada e saída do Estoque vão para um depósito OU um tanque de material (um dos dois).
-- - O banco recusa movimento do Combustível em tanque de material, e trocar o uso de um
--   tanque que já tem movimento do outro módulo.
-- - Tanque de material guarda um material por vez; a capacidade só é conferida quando a
--   unidade do material é litro (a coluna é capacidade_litros).
-- - O cache do tanque (nivel_atual_litros, combustivel_atual_id) passa a ser escrito pelo
--   Estoque no tanque de material: é o saldo, na unidade do material, e o material atual.
--
-- Não havia nenhum movimento do Estoque em produção quando esta migration foi escrita.

-- 1. Uso do tanque ------------------------------------------------------------------------
alter table public.tanques add column uso text not null default 'combustivel';
alter table public.tanques add constraint tanques_uso_valido check (uso in ('combustivel', 'material'));
-- Tanque externo é do Combustível (dono terceiro, sem estoque nosso).
alter table public.tanques add constraint tanques_material_proprio check (uso = 'combustivel' or not eh_externo);
grant insert (uso), update (uso) on public.tanques to authenticated;

create or replace function public.fn_tanque_trg_uso()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.uso = old.uso then return new; end if;
  if new.uso = 'material' and (
       exists (select 1 from public.combustivel_entradas where tanque_id = new.id)
    or exists (select 1 from public.combustivel_saidas where tanque_id = new.id)
    or exists (select 1 from public.combustivel_transferencias where new.id in (tanque_origem_id, tanque_destino_id))
    or exists (select 1 from public.combustivel_esvaziamentos where tanque_id = new.id)) then
    raise exception 'O tanque % já tem movimento de combustível e não pode virar tanque de material', new.nome;
  end if;
  if new.uso = 'combustivel' and (
       exists (select 1 from public.estoque_entradas where tanque_id = new.id)
    or exists (select 1 from public.estoque_saidas where tanque_id = new.id)) then
    raise exception 'O tanque % já tem movimento de material no Estoque e não pode virar tanque de combustível', new.nome;
  end if;
  return new;
end $$;
revoke all on function public.fn_tanque_trg_uso() from public, anon, authenticated;
-- (a coluna tanque_id dos movimentos do Estoque é criada logo abaixo; o gatilho só roda depois)

-- 2. Combustível não movimenta tanque de material -----------------------------------------
create or replace function public.fn_comb_trg_tanque_de_combustivel()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_ids uuid[]; v_nome text;
begin
  -- IF e não CASE: o plpgsql resolve todos os ramos do CASE, e só a transferência tem origem e destino.
  if tg_table_name = 'combustivel_transferencias' then
    v_ids := array[new.tanque_origem_id, new.tanque_destino_id];
  else
    v_ids := array[new.tanque_id];
  end if;
  select nome into v_nome from public.tanques where id = any(v_ids) and uso = 'material' limit 1;
  if v_nome is not null then
    raise exception 'O tanque % é de material: a entrada e a saída dele são feitas no Estoque', v_nome;
  end if;
  return new;
end $$;
revoke all on function public.fn_comb_trg_tanque_de_combustivel() from public, anon, authenticated;

create trigger trg_comb_entradas_tanque_uso before insert or update of tanque_id on public.combustivel_entradas
  for each row execute function public.fn_comb_trg_tanque_de_combustivel();
create trigger trg_comb_saidas_tanque_uso before insert or update of tanque_id on public.combustivel_saidas
  for each row when (new.tanque_id is not null) execute function public.fn_comb_trg_tanque_de_combustivel();
create trigger trg_comb_transferencias_tanque_uso before insert or update of tanque_origem_id, tanque_destino_id on public.combustivel_transferencias
  for each row execute function public.fn_comb_trg_tanque_de_combustivel();
create trigger trg_comb_esvaziamentos_tanque_uso before insert or update of tanque_id on public.combustivel_esvaziamentos
  for each row execute function public.fn_comb_trg_tanque_de_combustivel();

-- 3. Movimentos do Estoque: depósito OU tanque ---------------------------------------------
alter table public.estoque_entradas alter column deposito_id drop not null;
alter table public.estoque_entradas add column tanque_id uuid references public.tanques(id);
alter table public.estoque_entradas add constraint estoque_entradas_um_local check (num_nonnulls(deposito_id, tanque_id) = 1);
alter table public.estoque_saidas alter column deposito_id drop not null;
alter table public.estoque_saidas add column tanque_id uuid references public.tanques(id);
alter table public.estoque_saidas add constraint estoque_saidas_um_local check (num_nonnulls(deposito_id, tanque_id) = 1);
create index idx_estoque_entradas_peps_tanque on public.estoque_entradas (tanque_id, insumo_id, data, created_at)
  where excluido_em is null and tanque_id is not null;
create index idx_estoque_saidas_peps_tanque on public.estoque_saidas (tanque_id, insumo_id, data, created_at)
  where excluido_em is null and tanque_id is not null;

create trigger trg_tanques_uso before update of uso on public.tanques
  for each row execute function public.fn_tanque_trg_uso();

-- 4. PEPS por local (depósito ou tanque) ---------------------------------------------------
drop trigger trg_estoque_entradas_peps on public.estoque_entradas;
drop trigger trg_estoque_saidas_peps on public.estoque_saidas;
drop function public.fn_estoque_recalcular_peps(uuid, uuid);

-- Cache e travas do tanque de material: um material por vez, capacidade quando é litro.
create or replace function public.fn_estoque_atualizar_tanque(p_tanque uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_tanque record;
  v_n int;
  v_insumo uuid;
  v_saldo numeric;
  v_unidade text;
  v_nome text;
begin
  select id, nome, capacidade_litros into v_tanque from public.tanques where id = p_tanque;
  with mov as (
    select insumo_id, quantidade as q from public.estoque_entradas where tanque_id = p_tanque and excluido_em is null
    union all
    select insumo_id, -quantidade from public.estoque_saidas where tanque_id = p_tanque and excluido_em is null
  ), s as (select insumo_id, sum(q) as saldo from mov group by insumo_id having sum(q) > 0)
  select count(*), min(insumo_id::text)::uuid, sum(saldo) into v_n, v_insumo, v_saldo from s;

  if v_n > 1 then
    raise exception 'O tanque % ficaria com dois materiais ao mesmo tempo: esvazie antes de pôr outro', v_tanque.nome;
  end if;

  if v_n = 1 then
    select u.sigla, i.nome into v_unidade, v_nome
    from public.insumos i left join public.unidades_medida u on u.id = i.unidade_id where i.id = v_insumo;
    if lower(coalesce(v_unidade, '')) in ('l', 'lt', 'litro', 'litros') and v_tanque.capacidade_litros > 0
       and v_saldo > v_tanque.capacidade_litros then
      raise exception 'O tanque % comporta % L e ficaria com % L de %', v_tanque.nome,
        trim(trailing ',' from trim(trailing '0' from replace(v_tanque.capacidade_litros::text, '.', ','))),
        trim(trailing ',' from trim(trailing '0' from replace(v_saldo::text, '.', ','))), v_nome;
    end if;
  end if;

  update public.tanques
  set nivel_atual_litros = coalesce(v_saldo, 0), combustivel_atual_id = v_insumo
  where id = p_tanque
    and (nivel_atual_litros, combustivel_atual_id) is distinct from (coalesce(v_saldo, 0), v_insumo);
end $$;

-- Refaz o PEPS de um insumo num local (depósito OU tanque). Mesma regra de antes: as saídas,
-- da mais antiga para a mais nova, consomem as entradas mais antigas com data até a dela.
create or replace function public.fn_estoque_recalcular_peps(p_deposito uuid, p_tanque uuid, p_insumo uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  s record;
  e record;
  v_falta numeric;
  v_q numeric;
  v_valor numeric;
  v_nome text;
begin
  perform pg_advisory_xact_lock(hashtext('estoque:' || coalesce(p_deposito, p_tanque)::text || ':' || p_insumo::text));

  delete from public.estoque_saida_camadas c
  using public.estoque_saidas s2
  where c.saida_id = s2.id and s2.deposito_id is not distinct from p_deposito
    and s2.tanque_id is not distinct from p_tanque and s2.insumo_id = p_insumo;

  for s in
    select id, quantidade, data from public.estoque_saidas
    where deposito_id is not distinct from p_deposito and tanque_id is not distinct from p_tanque
      and insumo_id = p_insumo and excluido_em is null
    order by data, created_at, id
  loop
    v_falta := s.quantidade;
    v_valor := 0;
    for e in
      select en.id, en.valor_unitario,
             en.quantidade - coalesce((select sum(c.quantidade) from public.estoque_saida_camadas c where c.entrada_id = en.id), 0) as restante
      from public.estoque_entradas en
      where en.deposito_id is not distinct from p_deposito and en.tanque_id is not distinct from p_tanque
        and en.insumo_id = p_insumo and en.excluido_em is null and en.data <= s.data
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

  if p_tanque is not null then
    perform public.fn_estoque_atualizar_tanque(p_tanque);
  end if;
end $$;

create or replace function public.fn_estoque_trg_peps()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_a text; v_b text;
begin
  if tg_op = 'UPDATE' and (new.deposito_id, new.tanque_id, new.insumo_id) is distinct from (old.deposito_id, old.tanque_id, old.insumo_id) then
    -- Os dois pares, sempre na mesma ordem: A→B e B→A ao mesmo tempo não se travam.
    v_a := 'estoque:' || coalesce(old.deposito_id, old.tanque_id)::text || ':' || old.insumo_id::text;
    v_b := 'estoque:' || coalesce(new.deposito_id, new.tanque_id)::text || ':' || new.insumo_id::text;
    perform pg_advisory_xact_lock(hashtext(least(v_a, v_b)));
    perform pg_advisory_xact_lock(hashtext(greatest(v_a, v_b)));
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fn_estoque_recalcular_peps(old.deposito_id, old.tanque_id, old.insumo_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or (new.deposito_id, new.tanque_id, new.insumo_id) is distinct from (old.deposito_id, old.tanque_id, old.insumo_id)) then
    perform public.fn_estoque_recalcular_peps(new.deposito_id, new.tanque_id, new.insumo_id);
  end if;
  return null;
end $$;

create trigger trg_estoque_entradas_peps
  after insert or delete or update of deposito_id, tanque_id, insumo_id, quantidade, valor_unitario, data, excluido_em
  on public.estoque_entradas for each row execute function public.fn_estoque_trg_peps();
create trigger trg_estoque_saidas_peps
  after insert or delete or update of deposito_id, tanque_id, insumo_id, quantidade, data, excluido_em
  on public.estoque_saidas for each row execute function public.fn_estoque_trg_peps();

-- 5. Combustível é o que está num tanque DE COMBUSTÍVEL (o de material guarda o insumo no mesmo cache).
create or replace function public.fn_estoque_insumo_de_outro_modulo(p_insumo uuid)
returns text language sql stable security definer set search_path to '' as $$
  select case
    when exists (select 1 from public.almoxarifado_itens a where a.insumo_id = p_insumo) then 'peça do almoxarifado (Manutenção)'
    when exists (select 1 from public.tanques t where t.combustivel_atual_id = p_insumo and t.uso = 'combustivel')
      or exists (select 1 from public.insumos i join public.categorias_insumo c on c.id = i.categoria_id
                 where i.id = p_insumo and c.nome ilike '%combust%') then 'combustível (módulo Combustível)'
  end;
$$;

-- 6. Local validado nas RPCs ---------------------------------------------------------------
-- Confere o local (um dos dois) e devolve o erro em frase; p_atual_* deixa passar o local
-- inativo de um movimento que já estava nele.
create or replace function public.fn_estoque_conferir_local(p_deposito uuid, p_tanque uuid, p_atual_deposito uuid, p_atual_tanque uuid)
returns void language plpgsql stable security definer set search_path to '' as $$
declare v_tanque record;
begin
  if num_nonnulls(p_deposito, p_tanque) <> 1 then raise exception 'Escolha um depósito ou um tanque'; end if;
  if p_deposito is not null then
    if not exists (select 1 from public.almoxarifado_depositos
                   where id = p_deposito and (ativo or p_deposito = p_atual_deposito)) then
      raise exception 'Depósito inexistente ou inativo';
    end if;
  else
    select nome, uso, ativo into v_tanque from public.tanques where id = p_tanque;
    if not found then raise exception 'Tanque inexistente'; end if;
    if v_tanque.uso <> 'material' then
      raise exception 'O tanque % é de combustível: a entrada e a saída dele são feitas no módulo Combustível', v_tanque.nome;
    end if;
    if not v_tanque.ativo and p_tanque is distinct from p_atual_tanque then
      raise exception 'O tanque % está inativo', v_tanque.nome;
    end if;
  end if;
end $$;
revoke all on function public.fn_estoque_conferir_local(uuid, uuid, uuid, uuid) from public, anon, authenticated;

drop function public.fn_estoque_salvar_entrada(uuid, uuid, uuid, numeric, numeric, date, uuid, text, text);
create function public.fn_estoque_salvar_entrada(
  p_id uuid,
  p_deposito uuid,
  p_tanque uuid,
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
  v_outro text;
  v_mesmo_item boolean;
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
  perform public.fn_estoque_conferir_local(p_deposito, p_tanque, v_atual.deposito_id, v_atual.tanque_id);

  if p_oc_item is not null then
    v_mesmo_item := p_oc_item = v_atual.oc_item_id;
    select i.insumo_id, i.preco_unitario, o.id as oc_id, o.numero, o.status, o.fornecedor_id
      into v_oc
    from public.oc_itens i join public.ordens_compra o on o.id = i.ordem_compra_id
    where i.id = p_oc_item
    for update of i;
    if not found then raise exception 'Item da OC não encontrado'; end if;
    if v_oc.status not in ('aprovado', 'recebido', 'pago') and not coalesce(v_mesmo_item, false) then
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

  if v_insumo is distinct from v_atual.insumo_id then
    v_outro := public.fn_estoque_insumo_de_outro_modulo(v_insumo);
    if v_outro is not null then
      raise exception 'Este insumo é %: a entrada é feita lá, não no Estoque', v_outro;
    end if;
  end if;

  if p_id is null then
    insert into public.estoque_entradas (deposito_id, tanque_id, insumo_id, quantidade, valor_unitario, data,
      ordem_compra_id, oc_item_id, oc_numero, fornecedor_id, nota_fiscal, observacoes)
    values (p_deposito, p_tanque, v_insumo, p_quantidade, v_valor, p_data,
      v_oc_id, p_oc_item, v_oc_numero, v_fornecedor, nullif(btrim(p_nota_fiscal), ''), nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update public.estoque_entradas set
      deposito_id = p_deposito, tanque_id = p_tanque, insumo_id = v_insumo, quantidade = p_quantidade, valor_unitario = v_valor,
      data = p_data, ordem_compra_id = v_oc_id, oc_item_id = p_oc_item, oc_numero = v_oc_numero, fornecedor_id = v_fornecedor,
      nota_fiscal = nullif(btrim(p_nota_fiscal), ''), observacoes = nullif(btrim(p_observacoes), '')
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

drop function public.fn_estoque_salvar_saida(uuid, uuid, uuid, numeric, date, uuid, text);
create function public.fn_estoque_salvar_saida(
  p_id uuid,
  p_deposito uuid,
  p_tanque uuid,
  p_insumo uuid,
  p_quantidade numeric,
  p_data date,
  p_centro_custo uuid,
  p_observacoes text default null
) returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_atual public.estoque_saidas%rowtype;
begin
  if p_id is null then
    if not public.tem_permissao('estoque.saidas', 'criar') then raise exception 'Sem permissão para registrar saídas'; end if;
  else
    if not public.tem_permissao('estoque.saidas', 'editar') then raise exception 'Sem permissão para editar saídas'; end if;
    select * into v_atual from public.estoque_saidas where id = p_id and excluido_em is null for update;
    if not found then raise exception 'Saída não encontrada ou excluída'; end if;
  end if;

  if p_data is null then raise exception 'Informe a data da saída'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'A quantidade tem de ser maior que zero'; end if;
  -- Sai de onde há saldo, mesmo de local inativado depois da entrada: a saída só esvazia.
  if num_nonnulls(p_deposito, p_tanque) <> 1 then raise exception 'Escolha um depósito ou um tanque'; end if;
  if p_deposito is not null and not exists (select 1 from public.almoxarifado_depositos where id = p_deposito) then
    raise exception 'Depósito inexistente';
  end if;
  if p_tanque is not null and not exists (select 1 from public.tanques where id = p_tanque and uso = 'material') then
    raise exception 'Tanque inexistente ou de combustível';
  end if;
  if not exists (select 1 from public.insumos where id = p_insumo) then raise exception 'Insumo inexistente'; end if;
  if p_centro_custo is null then raise exception 'Informe o centro de custo'; end if;
  if not exists (select 1 from public.centros_custo where id = p_centro_custo and ativo) then
    raise exception 'Centro de custo inexistente ou inativo';
  end if;

  if p_id is null then
    insert into public.estoque_saidas (deposito_id, tanque_id, insumo_id, quantidade, data, centro_custo_id, observacoes)
    values (p_deposito, p_tanque, p_insumo, p_quantidade, p_data, p_centro_custo, nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update public.estoque_saidas set
      deposito_id = p_deposito, tanque_id = p_tanque, insumo_id = p_insumo, quantidade = p_quantidade, data = p_data,
      centro_custo_id = p_centro_custo, observacoes = nullif(btrim(p_observacoes), '')
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- 7. Posição: o local do Estoque pode ser tanque; o combustível só dos tanques de combustível.
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
    select e.deposito_id, e.tanque_id, e.insumo_id, e.quantidade as q, e.valor_total as v
    from public.estoque_entradas e where e.excluido_em is null
    union all
    select s.deposito_id, s.tanque_id, s.insumo_id, -s.quantidade, -s.valor_total
    from public.estoque_saidas s where s.excluido_em is null
  ), est as (
    select m.deposito_id, m.tanque_id, m.insumo_id, sum(m.q) as q, sum(m.v) as v
    from mov m group by m.deposito_id, m.tanque_id, m.insumo_id
  )
  select 'estoque'::text,
         case when est.tanque_id is null then 'deposito' else 'tanque' end,
         coalesce(d.id, t.id), coalesce(d.nome, t.nome), i.id, i.nome, u.sigla, est.q, round(est.v, 4)
  from est
  left join public.almoxarifado_depositos d on d.id = est.deposito_id
  left join public.tanques t on t.id = est.tanque_id
  join public.insumos i on i.id = est.insumo_id
  left join public.unidades_medida u on u.id = i.unidade_id
  where est.q <> 0
  union all
  select 'combustivel'::text, 'tanque'::text, t.id, t.nome, i.id, i.nome, 'L'::text, t.nivel_atual_litros,
         round(t.nivel_atual_litros * coalesce(public.fn_comb_preco_medio_tanque(t.id), 0), 4)
  from public.tanques t
  left join public.insumos i on i.id = t.combustivel_atual_id
  where t.ativo and t.uso = 'combustivel'
  union all
  select 'pecas'::text, 'deposito'::text, d.id, d.nome, i.id, i.nome, u.sigla, s.saldo, round(s.saldo * s.custo_medio, 4)
  from public.almoxarifado_saldos s
  join public.almoxarifado_depositos d on d.id = s.deposito_id
  join public.insumos i on i.id = s.insumo_id
  left join public.unidades_medida u on u.id = i.unidade_id
  where s.saldo <> 0;
end $$;

-- 8. Grants -------------------------------------------------------------------------------
do $grants$
declare f text;
begin
  foreach f in array array[
    'fn_estoque_salvar_entrada(uuid,uuid,uuid,uuid,numeric,numeric,date,uuid,text,text)',
    'fn_estoque_salvar_saida(uuid,uuid,uuid,uuid,numeric,date,uuid,text)',
    'fn_estoque_posicao()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['fn_estoque_recalcular_peps(uuid,uuid,uuid)', 'fn_estoque_trg_peps()',
    'fn_estoque_atualizar_tanque(uuid)', 'fn_estoque_insumo_de_outro_modulo(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $grants$;
