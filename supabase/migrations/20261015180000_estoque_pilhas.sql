-- Estoque: pilhas de agregado (15/10/2026).
--
-- Pedido do Tiago: além de depósitos e tanques, "Pilhas", que são pilhas de agregados
-- (areia, brita). A entrada e a saída funcionam como no tanque de material; a diferença é
-- que, quando a pilha zera, ela fica inativa.
--
-- - A pilha é um terceiro local dos movimentos do Estoque: depósito OU tanque OU pilha.
-- - Mesmo PEPS do depósito e do tanque, e um material por vez (como o tanque de material).
-- - `ativo` é DERIVADO, nunca digitado: a pilha que já teve saída e ficou com saldo zero
--   está inativa (`zerada_em` = data da última saída). Excluir a saída que zerou a
--   reativa sozinha. Entrada em pilha inativa é recusada; saída nem chega (não há saldo).
-- - Sem capacidade: pilha não tem teto.
--
-- Funções alteradas a partir das definições VIVAS de 15/10 (pg_get_functiondef).

-- 1. Tabela -------------------------------------------------------------------------------
create table public.estoque_pilhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  observacoes text,
  -- Cache escrito por fn_estoque_atualizar_pilha: material e saldo atuais, e o status.
  insumo_atual_id uuid references public.insumos(id),
  saldo numeric(14,4) not null default 0,
  ativo boolean not null default true,
  zerada_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index idx_estoque_pilhas_insumo on public.estoque_pilhas (insumo_atual_id) where insumo_atual_id is not null;

alter table public.estoque_pilhas enable row level security;
revoke all on public.estoque_pilhas from anon, authenticated;
grant select on public.estoque_pilhas to authenticated;
-- A tela só escreve nome e observações; o resto é do banco.
grant insert (nome, observacoes), update (nome, observacoes) on public.estoque_pilhas to authenticated;

create trigger trg_estoque_pilhas_updated_at before update on public.estoque_pilhas for each row execute function public.fn_set_updated_at();
create trigger trg_set_created_by before insert on public.estoque_pilhas for each row execute function public.fn_set_created_by();
create trigger trg_audit_estoque_pilhas after insert or delete or update on public.estoque_pilhas for each row execute function public.fn_audit();

-- 2. Quem vê o Estoque inclui quem vê Pilhas ------------------------------------------------
create or replace function public.fn_ve_estoque()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.tem_permissao('estoque.posicao', 'ver')
      or public.tem_permissao('estoque.entradas', 'ver')
      or public.tem_permissao('estoque.saidas', 'ver')
      or public.tem_permissao('estoque.depositos', 'ver')
      or public.tem_permissao('estoque.tanques', 'ver')
      or public.tem_permissao('estoque.pilhas', 'ver');
$$;

create policy estoque_pilhas_select on public.estoque_pilhas for select to authenticated
  using ((select public.fn_ve_estoque()));
create policy estoque_pilhas_insert on public.estoque_pilhas for insert to authenticated
  with check ((select public.tem_permissao('estoque.pilhas', 'criar')));
create policy estoque_pilhas_update on public.estoque_pilhas for update to authenticated
  using ((select public.tem_permissao('estoque.pilhas', 'editar')))
  with check ((select public.tem_permissao('estoque.pilhas', 'editar')));

-- Exclusão pela lixeira (fn_excluir_cadastro). Pilha com movimento: a FK recusa.
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
    when 'estoque_pilhas'    then 'estoque.pilhas'
    else null
  end;
$function$;

-- 3. Movimentos: depósito OU tanque OU pilha ------------------------------------------------
alter table public.estoque_entradas add column pilha_id uuid references public.estoque_pilhas(id);
alter table public.estoque_entradas drop constraint estoque_entradas_um_local;
alter table public.estoque_entradas add constraint estoque_entradas_um_local check (num_nonnulls(deposito_id, tanque_id, pilha_id) = 1);
alter table public.estoque_saidas add column pilha_id uuid references public.estoque_pilhas(id);
alter table public.estoque_saidas drop constraint estoque_saidas_um_local;
alter table public.estoque_saidas add constraint estoque_saidas_um_local check (num_nonnulls(deposito_id, tanque_id, pilha_id) = 1);
create index idx_estoque_entradas_peps_pilha on public.estoque_entradas (pilha_id, insumo_id, data, created_at)
  where excluido_em is null and pilha_id is not null;
create index idx_estoque_saidas_peps_pilha on public.estoque_saidas (pilha_id, insumo_id, data, created_at)
  where excluido_em is null and pilha_id is not null;

-- 4. Cache e status da pilha ----------------------------------------------------------------
create or replace function public.fn_estoque_atualizar_pilha(p_pilha uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_pilha record;
  v_n int;
  v_insumo uuid;
  v_saldo numeric;
  v_ultima_saida date;
  v_ativo boolean;
  v_zerada date;
begin
  -- Trava a pilha: duas entradas de materiais diferentes ao mesmo tempo não passam juntas
  -- (o lock do PEPS é por local + insumo).
  select id, nome into v_pilha from public.estoque_pilhas where id = p_pilha for update;
  if not found then return; end if;

  with mov as (
    select insumo_id, quantidade as q from public.estoque_entradas where pilha_id = p_pilha and excluido_em is null
    union all
    select insumo_id, -quantidade from public.estoque_saidas where pilha_id = p_pilha and excluido_em is null
  ), s as (select insumo_id, sum(q) as saldo from mov group by insumo_id having sum(q) > 0)
  select count(*), min(insumo_id::text)::uuid, sum(saldo) into v_n, v_insumo, v_saldo from s;

  if v_n > 1 then
    raise exception 'A pilha % ficaria com dois materiais ao mesmo tempo: cada pilha guarda um material só', v_pilha.nome;
  end if;

  select max(data) into v_ultima_saida from public.estoque_saidas where pilha_id = p_pilha and excluido_em is null;
  v_ativo := not (v_ultima_saida is not null and coalesce(v_saldo, 0) = 0);
  v_zerada := case when v_ativo then null else v_ultima_saida end;

  update public.estoque_pilhas
  set saldo = coalesce(v_saldo, 0), insumo_atual_id = v_insumo, ativo = v_ativo, zerada_em = v_zerada
  where id = p_pilha
    and (saldo, insumo_atual_id, ativo, zerada_em) is distinct from (coalesce(v_saldo, 0), v_insumo, v_ativo, v_zerada);
end $$;

-- 5. PEPS por local (depósito, tanque ou pilha) ---------------------------------------------
drop trigger trg_estoque_entradas_peps on public.estoque_entradas;
drop trigger trg_estoque_saidas_peps on public.estoque_saidas;
drop function public.fn_estoque_recalcular_peps(uuid, uuid, uuid);

create function public.fn_estoque_recalcular_peps(p_deposito uuid, p_tanque uuid, p_pilha uuid, p_insumo uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  s record;
  e record;
  v_falta numeric;
  v_q numeric;
  v_valor numeric;
  v_nome text;
begin
  perform pg_advisory_xact_lock(hashtext('estoque:' || coalesce(p_deposito, p_tanque, p_pilha)::text || ':' || p_insumo::text));

  delete from public.estoque_saida_camadas c
  using public.estoque_saidas s2
  where c.saida_id = s2.id and s2.deposito_id is not distinct from p_deposito
    and s2.tanque_id is not distinct from p_tanque and s2.pilha_id is not distinct from p_pilha
    and s2.insumo_id = p_insumo;

  for s in
    select id, quantidade, data from public.estoque_saidas
    where deposito_id is not distinct from p_deposito and tanque_id is not distinct from p_tanque
      and pilha_id is not distinct from p_pilha
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
        and en.pilha_id is not distinct from p_pilha
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
  if p_pilha is not null then
    perform public.fn_estoque_atualizar_pilha(p_pilha);
  end if;
end $$;

create or replace function public.fn_estoque_trg_peps()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_a text; v_b text;
begin
  if tg_op = 'UPDATE' and (new.deposito_id, new.tanque_id, new.pilha_id, new.insumo_id)
                          is distinct from (old.deposito_id, old.tanque_id, old.pilha_id, old.insumo_id) then
    -- Os dois pares, sempre na mesma ordem: A→B e B→A ao mesmo tempo não se travam.
    v_a := 'estoque:' || coalesce(old.deposito_id, old.tanque_id, old.pilha_id)::text || ':' || old.insumo_id::text;
    v_b := 'estoque:' || coalesce(new.deposito_id, new.tanque_id, new.pilha_id)::text || ':' || new.insumo_id::text;
    perform pg_advisory_xact_lock(hashtext(least(v_a, v_b)));
    perform pg_advisory_xact_lock(hashtext(greatest(v_a, v_b)));
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fn_estoque_recalcular_peps(old.deposito_id, old.tanque_id, old.pilha_id, old.insumo_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or (new.deposito_id, new.tanque_id, new.pilha_id, new.insumo_id)
                              is distinct from (old.deposito_id, old.tanque_id, old.pilha_id, old.insumo_id)) then
    perform public.fn_estoque_recalcular_peps(new.deposito_id, new.tanque_id, new.pilha_id, new.insumo_id);
  end if;
  return null;
end $$;

create trigger trg_estoque_entradas_peps
  after insert or delete or update of deposito_id, tanque_id, pilha_id, insumo_id, quantidade, valor_unitario, data, excluido_em
  on public.estoque_entradas for each row execute function public.fn_estoque_trg_peps();
create trigger trg_estoque_saidas_peps
  after insert or delete or update of deposito_id, tanque_id, pilha_id, insumo_id, quantidade, data, excluido_em
  on public.estoque_saidas for each row execute function public.fn_estoque_trg_peps();

-- 6. Local validado nas RPCs ----------------------------------------------------------------
drop function public.fn_estoque_conferir_local(uuid, uuid, uuid, uuid);
create function public.fn_estoque_conferir_local(
  p_deposito uuid, p_tanque uuid, p_pilha uuid,
  p_atual_deposito uuid, p_atual_tanque uuid, p_atual_pilha uuid
) returns void language plpgsql stable security definer set search_path to '' as $$
declare v_tanque record; v_pilha record;
begin
  if num_nonnulls(p_deposito, p_tanque, p_pilha) <> 1 then raise exception 'Escolha um depósito, um tanque ou uma pilha'; end if;
  if p_deposito is not null then
    if not exists (select 1 from public.almoxarifado_depositos
                   where id = p_deposito and (ativo or p_deposito = p_atual_deposito)) then
      raise exception 'Depósito inexistente ou inativo';
    end if;
  elsif p_tanque is not null then
    select nome, uso, ativo into v_tanque from public.tanques where id = p_tanque;
    if not found then raise exception 'Tanque inexistente'; end if;
    if v_tanque.uso <> 'material' then
      raise exception 'O tanque % é de combustível: a entrada e a saída dele são feitas no módulo Combustível', v_tanque.nome;
    end if;
    if not v_tanque.ativo and p_tanque is distinct from p_atual_tanque then
      raise exception 'O tanque % está inativo', v_tanque.nome;
    end if;
  else
    select nome, ativo into v_pilha from public.estoque_pilhas where id = p_pilha;
    if not found then raise exception 'Pilha inexistente'; end if;
    if not v_pilha.ativo and p_pilha is distinct from p_atual_pilha then
      raise exception 'A pilha % já zerou e está inativa: crie uma pilha nova', v_pilha.nome;
    end if;
  end if;
end $$;

drop function public.fn_estoque_salvar_entrada(uuid, uuid, uuid, uuid, numeric, numeric, date, uuid, text, text);
-- p_pilha por último e com default: o cliente que ainda não manda a pilha continua funcionando.
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
  p_observacoes text default null,
  p_pilha uuid default null
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
  perform public.fn_estoque_conferir_local(p_deposito, p_tanque, p_pilha, v_atual.deposito_id, v_atual.tanque_id, v_atual.pilha_id);

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
    insert into public.estoque_entradas (deposito_id, tanque_id, pilha_id, insumo_id, quantidade, valor_unitario, data,
      ordem_compra_id, oc_item_id, oc_numero, fornecedor_id, nota_fiscal, observacoes)
    values (p_deposito, p_tanque, p_pilha, v_insumo, p_quantidade, v_valor, p_data,
      v_oc_id, p_oc_item, v_oc_numero, v_fornecedor, nullif(btrim(p_nota_fiscal), ''), nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update public.estoque_entradas set
      deposito_id = p_deposito, tanque_id = p_tanque, pilha_id = p_pilha, insumo_id = v_insumo, quantidade = p_quantidade,
      valor_unitario = v_valor, data = p_data, ordem_compra_id = v_oc_id, oc_item_id = p_oc_item, oc_numero = v_oc_numero,
      fornecedor_id = v_fornecedor, nota_fiscal = nullif(btrim(p_nota_fiscal), ''), observacoes = nullif(btrim(p_observacoes), '')
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

drop function public.fn_estoque_salvar_saida(uuid, uuid, uuid, uuid, numeric, date, uuid, text);
create function public.fn_estoque_salvar_saida(
  p_id uuid,
  p_deposito uuid,
  p_tanque uuid,
  p_insumo uuid,
  p_quantidade numeric,
  p_data date,
  p_centro_custo uuid,
  p_observacoes text default null,
  p_pilha uuid default null
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
  -- (Pilha inativa tem saldo zero: o PEPS recusa a saída sozinho.)
  if num_nonnulls(p_deposito, p_tanque, p_pilha) <> 1 then raise exception 'Escolha um depósito, um tanque ou uma pilha'; end if;
  if p_deposito is not null and not exists (select 1 from public.almoxarifado_depositos where id = p_deposito) then
    raise exception 'Depósito inexistente';
  end if;
  if p_tanque is not null and not exists (select 1 from public.tanques where id = p_tanque and uso = 'material') then
    raise exception 'Tanque inexistente ou de combustível';
  end if;
  if p_pilha is not null and not exists (select 1 from public.estoque_pilhas where id = p_pilha) then
    raise exception 'Pilha inexistente';
  end if;
  if not exists (select 1 from public.insumos where id = p_insumo) then raise exception 'Insumo inexistente'; end if;
  if p_centro_custo is null then raise exception 'Informe o centro de custo'; end if;
  if not exists (select 1 from public.centros_custo where id = p_centro_custo and ativo) then
    raise exception 'Centro de custo inexistente ou inativo';
  end if;

  if p_id is null then
    insert into public.estoque_saidas (deposito_id, tanque_id, pilha_id, insumo_id, quantidade, data, centro_custo_id, observacoes)
    values (p_deposito, p_tanque, p_pilha, p_insumo, p_quantidade, p_data, p_centro_custo, nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update public.estoque_saidas set
      deposito_id = p_deposito, tanque_id = p_tanque, pilha_id = p_pilha, insumo_id = p_insumo, quantidade = p_quantidade,
      data = p_data, centro_custo_id = p_centro_custo, observacoes = nullif(btrim(p_observacoes), '')
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- 7. Posição: o local do Estoque pode ser pilha ----------------------------------------------
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
    select e.deposito_id, e.tanque_id, e.pilha_id, e.insumo_id, e.quantidade as q, e.valor_total as v
    from public.estoque_entradas e where e.excluido_em is null
    union all
    select s.deposito_id, s.tanque_id, s.pilha_id, s.insumo_id, -s.quantidade, -s.valor_total
    from public.estoque_saidas s where s.excluido_em is null
  ), est as (
    select m.deposito_id, m.tanque_id, m.pilha_id, m.insumo_id, sum(m.q) as q, sum(m.v) as v
    from mov m group by m.deposito_id, m.tanque_id, m.pilha_id, m.insumo_id
  )
  select 'estoque'::text,
         case when est.tanque_id is not null then 'tanque' when est.pilha_id is not null then 'pilha' else 'deposito' end,
         coalesce(d.id, t.id, p.id), coalesce(d.nome, t.nome, p.nome), i.id, i.nome, u.sigla, est.q, round(est.v, 4)
  from est
  left join public.almoxarifado_depositos d on d.id = est.deposito_id
  left join public.tanques t on t.id = est.tanque_id
  left join public.estoque_pilhas p on p.id = est.pilha_id
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

-- 8. Grants ---------------------------------------------------------------------------------
do $grants$
declare f text;
begin
  foreach f in array array[
    'fn_estoque_salvar_entrada(uuid,uuid,uuid,uuid,numeric,numeric,date,uuid,text,text,uuid)',
    'fn_estoque_salvar_saida(uuid,uuid,uuid,uuid,numeric,date,uuid,text,uuid)',
    'fn_estoque_posicao()', 'fn_ve_estoque()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['fn_estoque_recalcular_peps(uuid,uuid,uuid,uuid)', 'fn_estoque_trg_peps()',
    'fn_estoque_atualizar_pilha(uuid)', 'fn_estoque_conferir_local(uuid,uuid,uuid,uuid,uuid,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $grants$;

-- 9. Permissões: quem cuida dos tanques no Estoque cuida das pilhas -------------------------
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select perfil_id, 'estoque.pilhas', acao from public.perfil_permissoes
where recurso = 'estoque.tanques' and acao in ('ver', 'criar', 'editar', 'excluir')
on conflict (perfil_id, recurso, acao) do nothing;
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select usuario_id, 'estoque.pilhas', acao from public.usuario_permissoes
where recurso = 'estoque.tanques' and acao in ('ver', 'criar', 'editar', 'excluir')
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v_t int; v_p int;
begin
  select count(*) into v_t from public.usuario_permissoes where recurso = 'estoque.tanques';
  select count(*) into v_p from public.usuario_permissoes where recurso = 'estoque.pilhas';
  if v_p < v_t then raise exception 'Esperado ao menos % permissões estoque.pilhas, veio %', v_t, v_p; end if;
end $confere$;
