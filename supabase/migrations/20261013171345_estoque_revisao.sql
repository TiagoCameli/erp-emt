-- Estoque, correções da revisão adversarial (13/10/2026, PR #447).
--
-- 1. A edição da OC apaga e recria os itens: a entrada perdia o vínculo (on delete set null)
--    e o item voltava a "falta tudo", recebível de novo. Agora apagar item de OC que tem
--    entrada ativa no Estoque é recusado, com a frase de por quê (vale para editar e excluir a OC).
-- 2. Duas entradas simultâneas do mesmo item de OC passavam juntas pela conta do saldo:
--    o item é travado (for update) antes da conta.
-- 3. Leitura das tabelas por aba: quem só vê Tanques ou Depósitos não lê custo de entrada e saída.
-- 4. Combustível e peça não entram pelo Estoque (o dono: "a entrada e saída deles não é
--    feita pelo módulo de estoque"). Peça = item do almoxarifado; combustível = combustível
--    de algum tanque ou categoria "combust...". A lista de itens de OC também os tira.
-- 5. Editar entrada de OC já desaprovada, ou de depósito inativado, só para corrigir data/NF:
--    permitido quando o item e o depósito são os mesmos de antes.
-- 6. Mudar depósito/insumo de um movimento trava os dois pares em ordem fixa (sem deadlock).

-- 1 -------------------------------------------------------------------------------------
create or replace function public.fn_estoque_trg_oc_item_com_entrada()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_qtd numeric; v_nome text;
begin
  select sum(e.quantidade) into v_qtd from public.estoque_entradas e
  where e.oc_item_id = old.id and e.excluido_em is null;
  if v_qtd is not null then
    select nome into v_nome from public.insumos where id = old.insumo_id;
    raise exception 'O item % desta OC já teve entrada no Estoque (%). Exclua a entrada no Estoque antes de alterar ou excluir a OC',
      v_nome, trim(trailing ',' from trim(trailing '0' from replace(v_qtd::text, '.', ',')));
  end if;
  return old;
end $$;
revoke all on function public.fn_estoque_trg_oc_item_com_entrada() from public, anon, authenticated;
create trigger trg_oc_itens_estoque before delete on public.oc_itens
  for each row execute function public.fn_estoque_trg_oc_item_com_entrada();

-- 4 -------------------------------------------------------------------------------------
-- Diz de qual módulo é o insumo quando não é do Estoque; nulo quando o Estoque pode movimentar.
create or replace function public.fn_estoque_insumo_de_outro_modulo(p_insumo uuid)
returns text language sql stable security definer set search_path to '' as $$
  select case
    when exists (select 1 from public.almoxarifado_itens a where a.insumo_id = p_insumo) then 'peça do almoxarifado (Manutenção)'
    when exists (select 1 from public.tanques t where t.combustivel_atual_id = p_insumo)
      or exists (select 1 from public.insumos i join public.categorias_insumo c on c.id = i.categoria_id
                 where i.id = p_insumo and c.nome ilike '%combust%') then 'combustível (módulo Combustível)'
  end;
$$;
revoke all on function public.fn_estoque_insumo_de_outro_modulo(uuid) from public, anon, authenticated;

-- 2, 4, 5 -------------------------------------------------------------------------------
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
  if not exists (select 1 from public.almoxarifado_depositos
                 where id = p_deposito and (ativo or p_deposito = v_atual.deposito_id)) then
    raise exception 'Depósito inexistente ou inativo';
  end if;

  if p_oc_item is not null then
    v_mesmo_item := p_oc_item = v_atual.oc_item_id;
    -- Trava o item: duas entradas ao mesmo tempo não passam juntas pela conta do saldo.
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

-- 4 (lista) e restante calculado uma vez por linha.
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
  with itens as (
    select i.id, i.ordem_compra_id, i.insumo_id, i.quantidade, i.preco_unitario, i.centro_custo_id,
           i.quantidade - coalesce((select sum(e.quantidade) from public.estoque_entradas e
                                    where e.oc_item_id = i.id and e.excluido_em is null), 0) as restante
    from public.oc_itens i
    join public.ordens_compra o on o.id = i.ordem_compra_id
    where o.status in ('aprovado', 'recebido', 'pago')
      and public.fn_estoque_insumo_de_outro_modulo(i.insumo_id) is null
  )
  select it.id, o.id, o.numero, o.status, o.data_compra, coalesce(f.nome_fantasia, f.razao_social), it.insumo_id, ins.nome, u.sigla,
         it.quantidade, it.restante, it.preco_unitario, cc.nome
  from itens it
  join public.ordens_compra o on o.id = it.ordem_compra_id
  join public.insumos ins on ins.id = it.insumo_id
  left join public.unidades_medida u on u.id = ins.unidade_id
  left join public.fornecedores f on f.id = o.fornecedor_id
  left join public.centros_custo cc on cc.id = it.centro_custo_id
  where it.restante > 0
  order by o.data_compra desc nulls last, o.numero desc, ins.nome;
end $$;

-- 6 -------------------------------------------------------------------------------------
create or replace function public.fn_estoque_trg_peps()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_a text; v_b text;
begin
  if tg_op = 'UPDATE' and (new.deposito_id, new.insumo_id) is distinct from (old.deposito_id, old.insumo_id) then
    -- Os dois pares, sempre na mesma ordem: A→B e B→A ao mesmo tempo não se travam.
    v_a := 'estoque:' || old.deposito_id::text || ':' || old.insumo_id::text;
    v_b := 'estoque:' || new.deposito_id::text || ':' || new.insumo_id::text;
    perform pg_advisory_xact_lock(hashtext(least(v_a, v_b)));
    perform pg_advisory_xact_lock(hashtext(greatest(v_a, v_b)));
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fn_estoque_recalcular_peps(old.deposito_id, old.insumo_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or (new.deposito_id, new.insumo_id) is distinct from (old.deposito_id, old.insumo_id)) then
    perform public.fn_estoque_recalcular_peps(new.deposito_id, new.insumo_id);
  end if;
  return null;
end $$;
revoke all on function public.fn_estoque_trg_peps() from public, anon, authenticated;

-- 3 -------------------------------------------------------------------------------------
-- A aba Saídas lê as entradas (material e saldo do formulário); a aba Entradas não lê saídas.
alter policy estoque_entradas_select on public.estoque_entradas using (
  (select public.tem_permissao('estoque.entradas', 'ver')) or (select public.tem_permissao('estoque.saidas', 'ver')));
alter policy estoque_saidas_select on public.estoque_saidas using (
  (select public.tem_permissao('estoque.saidas', 'ver')));
alter policy estoque_saida_camadas_select on public.estoque_saida_camadas using (
  (select public.tem_permissao('estoque.saidas', 'ver')));
