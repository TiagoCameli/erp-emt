-- Estoque: transferências entre locais e pilhas alimentadas pelo Frete (15/10/2026).
--
-- Pedido do Tiago:
-- - transferir material de uma pilha (ou depósito, ou tanque) para outra;
-- - frete de material (pedreira → local): na chegada, as toneladas entram sozinhas na pilha
--   do destino, a (valor do material + valor do frete) / t;
-- - frete de transferência: sai da pilha da origem pelo custo dela e entra na do destino
--   a custo + frete / t;
-- - vale para os fretes NOVOS, criados a partir de 15/10/2026 (Rio Branco).
--
-- Decisões:
-- - A pilha ganha `localidade_id` (a mesma localidade de origem/destino do Frete),
--   obrigatória (CHECK NOT VALID: as pilhas antigas pedem na próxima edição). Uma pilha
--   ATIVA por localidade + insumo: é ela que o frete encontra. Sem pilha no destino, o
--   frete cria ("BRITA 1 - Usina Gregorio").
-- - Transferência é um registro (`estoque_transferencias`) que gera uma saída na origem e
--   uma entrada no destino. A entrada custa (valor PEPS da saída + custo adicional) / qtd e
--   acompanha o PEPS da origem quando ele é refeito.
-- - Movimento gerado por frete ou transferência só muda pelo dono (flag de transação
--   `erp.estoque_sync`): no Estoque ele é só leitura.
-- - Transferência por frete sem pilha ativa na origem, ou sem saldo, é RECUSADA no frete.
--
-- Funções de pilha/PEPS alteradas a partir das definições de 20261015180000/20261015220000.

-- 0. Corte -------------------------------------------------------------------------------------
create or replace function public.fn_estoque_frete_corte()
returns timestamptz language sql immutable set search_path to '' as $$
  select timestamptz '2026-10-15 00:00:00-05'  -- meia-noite de 15/10 em Rio Branco
$$;
revoke all on function public.fn_estoque_frete_corte() from public, anon, authenticated;

-- 1. Pilha com localidade ------------------------------------------------------------------------
alter table public.estoque_pilhas add column localidade_id uuid references public.localidades(id);
alter table public.estoque_pilhas add constraint estoque_pilhas_localidade_obrigatoria check (localidade_id is not null) not valid;
grant insert (localidade_id), update (localidade_id) on public.estoque_pilhas to authenticated;
create unique index uq_estoque_pilhas_ativa_local_insumo on public.estoque_pilhas (localidade_id, insumo_id)
  where ativo and localidade_id is not null;

create or replace function public.fn_estoque_trg_pilha_cadastro()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_outro text; v_dona text;
begin
  if tg_op = 'UPDATE' and (new.insumo_id, new.localidade_id) is not distinct from (old.insumo_id, old.localidade_id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and (
       exists (select 1 from public.estoque_entradas where pilha_id = new.id and excluido_em is null)
    or exists (select 1 from public.estoque_saidas where pilha_id = new.id and excluido_em is null)) then
    if new.insumo_id is distinct from old.insumo_id and old.insumo_id is not null then
      raise exception 'A pilha % já tem entrada ou saída: o insumo não pode mais ser trocado', new.nome;
    end if;
    if new.localidade_id is distinct from old.localidade_id and old.localidade_id is not null then
      raise exception 'A pilha % já tem entrada ou saída: o local não pode mais ser trocado', new.nome;
    end if;
  end if;
  if new.insumo_id is not null and new.insumo_id is distinct from (case when tg_op = 'UPDATE' then old.insumo_id end) then
    if not exists (select 1 from public.insumos where id = new.insumo_id and ativo) then
      raise exception 'Insumo inexistente ou inativo';
    end if;
    v_outro := public.fn_estoque_insumo_de_outro_modulo(new.insumo_id);
    if v_outro is not null then
      raise exception 'Este insumo é %: não vai para pilha do Estoque', v_outro;
    end if;
  end if;
  if new.localidade_id is not null and new.ativo then
    select p.nome into v_dona from public.estoque_pilhas p
    where p.localidade_id = new.localidade_id and p.insumo_id = new.insumo_id and p.ativo and p.id <> new.id limit 1;
    if v_dona is not null then
      raise exception 'Já existe a pilha ativa % deste insumo neste local: o frete precisa saber em qual pilha entrar', v_dona;
    end if;
  end if;
  return new;
end $$;
drop trigger trg_estoque_pilhas_cadastro on public.estoque_pilhas;
create trigger trg_estoque_pilhas_cadastro before insert or update of insumo_id, localidade_id on public.estoque_pilhas
  for each row execute function public.fn_estoque_trg_pilha_cadastro();

-- Reativar pilha (saída que zerou foi excluída) com outra ativa no mesmo local: frase, não 23505.
create or replace function public.fn_estoque_atualizar_pilha(p_pilha uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_pilha record;
  v_saldo numeric;
  v_entrada numeric;
  v_ultima_saida date;
  v_ativo boolean;
  v_zerada date;
  v_dona text;
begin
  select id, nome, ativo, localidade_id, insumo_id into v_pilha from public.estoque_pilhas where id = p_pilha for update;
  if not found then return; end if;

  select coalesce(sum(quantidade), 0) into v_entrada
  from public.estoque_entradas where pilha_id = p_pilha and excluido_em is null;
  select v_entrada - coalesce(sum(quantidade), 0), max(data) into v_saldo, v_ultima_saida
  from public.estoque_saidas where pilha_id = p_pilha and excluido_em is null;

  v_ativo := not (v_ultima_saida is not null and v_saldo = 0);
  v_zerada := case when v_ativo then null else v_ultima_saida end;

  if v_ativo and not v_pilha.ativo and v_pilha.localidade_id is not null then
    select nome into v_dona from public.estoque_pilhas
    where localidade_id = v_pilha.localidade_id and insumo_id = v_pilha.insumo_id and ativo and id <> p_pilha limit 1;
    if v_dona is not null then
      raise exception 'A pilha % voltaria a ficar ativa, mas a pilha % já está ativa no mesmo local com o mesmo insumo', v_pilha.nome, v_dona;
    end if;
  end if;

  update public.estoque_pilhas
  set saldo = v_saldo, total_entrada = v_entrada, ativo = v_ativo, zerada_em = v_zerada
  where id = p_pilha
    and (saldo, total_entrada, ativo, zerada_em) is distinct from (v_saldo, v_entrada, v_ativo, v_zerada);
end $$;
revoke all on function public.fn_estoque_atualizar_pilha(uuid) from public, anon, authenticated;

-- 2. Transferências -------------------------------------------------------------------------------
create table public.estoque_transferencias (
  id uuid primary key default gen_random_uuid(),
  origem_deposito_id uuid references public.almoxarifado_depositos(id),
  origem_tanque_id uuid references public.tanques(id),
  origem_pilha_id uuid references public.estoque_pilhas(id),
  destino_deposito_id uuid references public.almoxarifado_depositos(id),
  destino_tanque_id uuid references public.tanques(id),
  destino_pilha_id uuid references public.estoque_pilhas(id),
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  data_saida date not null,
  data_chegada date not null,
  -- Frete ou outro custo do transporte: entra no valor do material no destino.
  custo_adicional numeric(14,4) not null default 0 check (custo_adicional >= 0),
  frete_id uuid unique references public.fretes(id),
  observacoes text,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint estoque_transferencias_uma_origem check (num_nonnulls(origem_deposito_id, origem_tanque_id, origem_pilha_id) = 1),
  constraint estoque_transferencias_um_destino check (num_nonnulls(destino_deposito_id, destino_tanque_id, destino_pilha_id) = 1),
  constraint estoque_transferencias_locais_diferentes check (
    coalesce(origem_deposito_id, origem_tanque_id, origem_pilha_id) <> coalesce(destino_deposito_id, destino_tanque_id, destino_pilha_id))
);
create index idx_estoque_transferencias_data on public.estoque_transferencias (data_saida desc, id);
create index idx_estoque_transferencias_insumo on public.estoque_transferencias (insumo_id);
create index idx_estoque_transferencias_origem_pilha on public.estoque_transferencias (origem_pilha_id) where origem_pilha_id is not null;
create index idx_estoque_transferencias_destino_pilha on public.estoque_transferencias (destino_pilha_id) where destino_pilha_id is not null;

alter table public.estoque_transferencias enable row level security;
revoke all on public.estoque_transferencias from anon, authenticated;
grant select on public.estoque_transferencias to authenticated;
create policy estoque_transferencias_select on public.estoque_transferencias for select to authenticated using (
  (select public.tem_permissao('estoque.transferencias', 'ver')) or (select public.tem_permissao('estoque.entradas', 'ver'))
  or (select public.tem_permissao('estoque.saidas', 'ver')));
create trigger trg_estoque_transferencias_updated_at before update on public.estoque_transferencias for each row execute function public.fn_set_updated_at();
create trigger trg_set_created_by before insert on public.estoque_transferencias for each row execute function public.fn_set_created_by();
create trigger trg_audit_estoque_transferencias after insert or delete or update on public.estoque_transferencias for each row execute function public.fn_audit();

-- Vínculos dos movimentos.
alter table public.estoque_entradas add column transferencia_id uuid references public.estoque_transferencias(id);
alter table public.estoque_entradas add column frete_id uuid references public.fretes(id);
alter table public.estoque_saidas add column transferencia_id uuid references public.estoque_transferencias(id);
create unique index uq_estoque_entradas_transferencia on public.estoque_entradas (transferencia_id) where transferencia_id is not null;
create unique index uq_estoque_entradas_frete on public.estoque_entradas (frete_id) where frete_id is not null;
create unique index uq_estoque_saidas_transferencia on public.estoque_saidas (transferencia_id) where transferencia_id is not null;
-- A saída de transferência não vai para centro de custo: só muda o material de lugar.
alter table public.estoque_saidas alter column centro_custo_id drop not null;
alter table public.estoque_saidas add constraint estoque_saidas_centro_ou_transferencia
  check (centro_custo_id is not null or transferencia_id is not null);

-- 3. Movimento vinculado só muda pelo dono --------------------------------------------------------
create or replace function public.fn_estoque_trg_movimento_vinculado()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_linha jsonb := to_jsonb(old);
begin
  if coalesce(current_setting('erp.estoque_sync', true), '') = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_linha->>'frete_id' is not null then
    raise exception 'Este movimento veio de um frete: altere ou exclua o frete no módulo Frete';
  end if;
  if v_linha->>'transferencia_id' is not null then
    raise exception 'Este movimento é de uma transferência: altere ou exclua a transferência na aba Transferências';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.fn_estoque_trg_movimento_vinculado() from public, anon, authenticated;
create trigger trg_estoque_entradas_vinculo
  before update of deposito_id, tanque_id, pilha_id, insumo_id, quantidade, valor_unitario, data, excluido_em or delete
  on public.estoque_entradas for each row execute function public.fn_estoque_trg_movimento_vinculado();
create trigger trg_estoque_saidas_vinculo
  before update of deposito_id, tanque_id, pilha_id, insumo_id, quantidade, data, centro_custo_id, excluido_em or delete
  on public.estoque_saidas for each row execute function public.fn_estoque_trg_movimento_vinculado();

-- 4. Preço da entrada de transferência acompanha o PEPS da origem ---------------------------------
create or replace function public.fn_estoque_transferencia_reprecificar(p_transferencia uuid, p_valor_saida numeric)
returns void language plpgsql security definer set search_path to '' as $$
declare v_t record; v_vu numeric; v_flag text;
begin
  select quantidade, custo_adicional into v_t from public.estoque_transferencias where id = p_transferencia;
  if not found then return; end if;
  v_vu := round((p_valor_saida + v_t.custo_adicional) / v_t.quantidade, 4);
  v_flag := current_setting('erp.estoque_sync', true);
  perform set_config('erp.estoque_sync', '1', true);
  update public.estoque_entradas set valor_unitario = v_vu
  where transferencia_id = p_transferencia and excluido_em is null and valor_unitario is distinct from v_vu;
  perform set_config('erp.estoque_sync', coalesce(v_flag, ''), true);
end $$;
revoke all on function public.fn_estoque_transferencia_reprecificar(uuid, numeric) from public, anon, authenticated;

create or replace function public.fn_estoque_recalcular_peps(p_deposito uuid, p_tanque uuid, p_pilha uuid, p_insumo uuid)
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
    select id, quantidade, data, transferencia_id from public.estoque_saidas
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

    if s.transferencia_id is not null then
      perform public.fn_estoque_transferencia_reprecificar(s.transferencia_id, round(v_valor, 4));
    end if;
  end loop;

  if p_tanque is not null then
    perform public.fn_estoque_atualizar_tanque(p_tanque);
  end if;
  if p_pilha is not null then
    perform public.fn_estoque_atualizar_pilha(p_pilha);
  end if;
end $$;

-- 5. Aplicar a transferência: saída na origem, entrada no destino ---------------------------------
create or replace function public.fn_estoque_aplicar_transferencia(p_transferencia uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  t record;
  v_saida uuid;
  v_entrada uuid;
  v_valor numeric;
  v_vu numeric;
  v_destino text;
  v_origem text;
  v_flag text;
begin
  select * into t from public.estoque_transferencias where id = p_transferencia for update;
  if not found then return; end if;
  v_flag := current_setting('erp.estoque_sync', true);
  perform set_config('erp.estoque_sync', '1', true);

  if t.excluido_em is not null then
    -- Entrada antes: se o destino já consumiu, o PEPS recusa com a frase do saldo.
    update public.estoque_entradas set excluido_em = now(), excluido_por = (select auth.uid()),
      motivo_exclusao = 'Transferência excluída'
    where transferencia_id = p_transferencia and excluido_em is null;
    update public.estoque_saidas set excluido_em = now(), excluido_por = (select auth.uid()),
      motivo_exclusao = 'Transferência excluída'
    where transferencia_id = p_transferencia and excluido_em is null;
    perform set_config('erp.estoque_sync', coalesce(v_flag, ''), true);
    return;
  end if;

  select coalesce(d.nome, tq.nome, p.nome) into v_destino
  from (select 1) x
  left join public.almoxarifado_depositos d on d.id = t.destino_deposito_id
  left join public.tanques tq on tq.id = t.destino_tanque_id
  left join public.estoque_pilhas p on p.id = t.destino_pilha_id;
  select coalesce(d.nome, tq.nome, p.nome) into v_origem
  from (select 1) x
  left join public.almoxarifado_depositos d on d.id = t.origem_deposito_id
  left join public.tanques tq on tq.id = t.origem_tanque_id
  left join public.estoque_pilhas p on p.id = t.origem_pilha_id;

  select id into v_saida from public.estoque_saidas where transferencia_id = p_transferencia;
  if v_saida is null then
    insert into public.estoque_saidas (deposito_id, tanque_id, pilha_id, insumo_id, quantidade, data, centro_custo_id,
      transferencia_id, observacoes)
    values (t.origem_deposito_id, t.origem_tanque_id, t.origem_pilha_id, t.insumo_id, t.quantidade, t.data_saida, null,
      p_transferencia, 'Transferência para ' || v_destino)
    returning id into v_saida;
  else
    update public.estoque_saidas set
      deposito_id = t.origem_deposito_id, tanque_id = t.origem_tanque_id, pilha_id = t.origem_pilha_id,
      insumo_id = t.insumo_id, quantidade = t.quantidade, data = t.data_saida, centro_custo_id = null,
      observacoes = 'Transferência para ' || v_destino,
      excluido_em = null, excluido_por = null, motivo_exclusao = null
    where id = v_saida;
  end if;

  -- O PEPS da origem já rodou no gatilho da saída.
  select valor_total into v_valor from public.estoque_saidas where id = v_saida;
  v_vu := round((v_valor + t.custo_adicional) / t.quantidade, 4);

  select id into v_entrada from public.estoque_entradas where transferencia_id = p_transferencia;
  if v_entrada is null then
    insert into public.estoque_entradas (deposito_id, tanque_id, pilha_id, insumo_id, quantidade, valor_unitario, data,
      transferencia_id, observacoes)
    values (t.destino_deposito_id, t.destino_tanque_id, t.destino_pilha_id, t.insumo_id, t.quantidade, v_vu, t.data_chegada,
      p_transferencia, 'Transferência de ' || v_origem);
  else
    update public.estoque_entradas set
      deposito_id = t.destino_deposito_id, tanque_id = t.destino_tanque_id, pilha_id = t.destino_pilha_id,
      insumo_id = t.insumo_id, quantidade = t.quantidade, valor_unitario = v_vu, data = t.data_chegada,
      observacoes = 'Transferência de ' || v_origem,
      excluido_em = null, excluido_por = null, motivo_exclusao = null
    where id = v_entrada;
  end if;
  perform set_config('erp.estoque_sync', coalesce(v_flag, ''), true);
end $$;
revoke all on function public.fn_estoque_aplicar_transferencia(uuid) from public, anon, authenticated;

-- 6. Transferência manual (aba Transferências) ----------------------------------------------------
create or replace function public.fn_estoque_salvar_transferencia(
  p_id uuid,
  p_origem_deposito uuid, p_origem_tanque uuid, p_origem_pilha uuid,
  p_destino_deposito uuid, p_destino_tanque uuid, p_destino_pilha uuid,
  p_insumo uuid,
  p_quantidade numeric,
  p_data_saida date,
  p_data_chegada date,
  p_custo_adicional numeric default 0,
  p_observacoes text default null
) returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_atual public.estoque_transferencias%rowtype; v_outro text;
begin
  if p_id is null then
    if not public.tem_permissao('estoque.transferencias', 'criar') then raise exception 'Sem permissão para registrar transferências'; end if;
  else
    if not public.tem_permissao('estoque.transferencias', 'editar') then raise exception 'Sem permissão para editar transferências'; end if;
    select * into v_atual from public.estoque_transferencias where id = p_id and excluido_em is null for update;
    if not found then raise exception 'Transferência não encontrada ou excluída'; end if;
    if v_atual.frete_id is not null then raise exception 'Esta transferência veio de um frete: altere o frete no módulo Frete'; end if;
  end if;

  if p_data_saida is null or p_data_chegada is null then raise exception 'Informe as datas de saída e de chegada'; end if;
  if p_data_chegada < p_data_saida then raise exception 'A chegada não pode ser antes da saída'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'A quantidade tem de ser maior que zero'; end if;
  if coalesce(p_custo_adicional, 0) < 0 then raise exception 'O custo adicional não pode ser negativo'; end if;
  if num_nonnulls(p_origem_deposito, p_origem_tanque, p_origem_pilha) <> 1 then raise exception 'Escolha o local de origem'; end if;
  if coalesce(p_origem_deposito, p_origem_tanque, p_origem_pilha) = coalesce(p_destino_deposito, p_destino_tanque, p_destino_pilha) then
    raise exception 'A origem e o destino têm de ser locais diferentes';
  end if;
  if p_origem_tanque is not null and not exists (select 1 from public.tanques where id = p_origem_tanque and uso = 'material') then
    raise exception 'Tanque de origem inexistente ou de combustível';
  end if;
  -- O destino recebe como uma entrada: tem de estar ativo (ou ser o mesmo de antes).
  perform public.fn_estoque_conferir_local(p_destino_deposito, p_destino_tanque, p_destino_pilha,
    v_atual.destino_deposito_id, v_atual.destino_tanque_id, v_atual.destino_pilha_id);
  if not exists (select 1 from public.insumos where id = p_insumo) then raise exception 'Insumo inexistente'; end if;
  v_outro := public.fn_estoque_insumo_de_outro_modulo(p_insumo);
  if v_outro is not null then raise exception 'Este insumo é %: não se transfere pelo Estoque', v_outro; end if;

  if p_id is null then
    insert into public.estoque_transferencias (origem_deposito_id, origem_tanque_id, origem_pilha_id,
      destino_deposito_id, destino_tanque_id, destino_pilha_id, insumo_id, quantidade, data_saida, data_chegada,
      custo_adicional, observacoes)
    values (p_origem_deposito, p_origem_tanque, p_origem_pilha, p_destino_deposito, p_destino_tanque, p_destino_pilha,
      p_insumo, p_quantidade, p_data_saida, p_data_chegada, coalesce(p_custo_adicional, 0), nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update public.estoque_transferencias set
      origem_deposito_id = p_origem_deposito, origem_tanque_id = p_origem_tanque, origem_pilha_id = p_origem_pilha,
      destino_deposito_id = p_destino_deposito, destino_tanque_id = p_destino_tanque, destino_pilha_id = p_destino_pilha,
      insumo_id = p_insumo, quantidade = p_quantidade, data_saida = p_data_saida, data_chegada = p_data_chegada,
      custo_adicional = coalesce(p_custo_adicional, 0), observacoes = nullif(btrim(p_observacoes), '')
    where id = p_id returning id into v_id;
  end if;
  perform public.fn_estoque_aplicar_transferencia(v_id);
  return v_id;
end $$;

create or replace function public.fn_estoque_excluir_transferencia(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_frete uuid;
begin
  if not public.tem_permissao('estoque.transferencias', 'excluir') then raise exception 'Sem permissão para excluir transferências'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da exclusão'; end if;
  select frete_id into v_frete from public.estoque_transferencias where id = p_id and excluido_em is null;
  if not found then raise exception 'Transferência não encontrada ou já excluída'; end if;
  if v_frete is not null then raise exception 'Esta transferência veio de um frete: exclua o frete no módulo Frete'; end if;
  update public.estoque_transferencias set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
  where id = p_id;
  perform public.fn_estoque_aplicar_transferencia(p_id);
end $$;

create or replace function public.fn_estoque_restaurar_transferencia(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_frete uuid;
begin
  if not public.tem_permissao('estoque.transferencias', 'excluir') then raise exception 'Sem permissão para restaurar transferências'; end if;
  select frete_id into v_frete from public.estoque_transferencias where id = p_id and excluido_em is not null;
  if not found then raise exception 'Transferência não encontrada ou não excluída'; end if;
  if v_frete is not null then raise exception 'Esta transferência veio de um frete: restaure o frete no módulo Frete'; end if;
  update public.estoque_transferencias set excluido_em = null, excluido_por = null, motivo_exclusao = null where id = p_id;
  perform public.fn_estoque_aplicar_transferencia(p_id);
end $$;

-- 7. Frete → pilhas ---------------------------------------------------------------------------------
-- A pilha ativa do insumo naquela localidade; sem ela, cria quando pedido.
create or replace function public.fn_estoque_pilha_do_local(p_localidade uuid, p_insumo uuid, p_criar boolean)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_nome text;
begin
  select id into v_id from public.estoque_pilhas
  where localidade_id = p_localidade and insumo_id = p_insumo and ativo
  order by created_at limit 1;
  if v_id is not null or not p_criar then return v_id; end if;
  select i.nome || ' - ' || l.nome into v_nome
  from public.insumos i, public.localidades l where i.id = p_insumo and l.id = p_localidade;
  insert into public.estoque_pilhas (nome, insumo_id, localidade_id, observacoes)
  values (v_nome, p_insumo, p_localidade, 'Criada pelo frete')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.fn_estoque_pilha_do_local(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.fn_frete_sincronizar_estoque(p_frete uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  f record;
  v_ativo boolean;
  v_ent record;
  v_tr record;
  v_tr_id uuid;
  v_pilha uuid;
  v_origem uuid;
  v_vu numeric;
  v_fornecedor uuid;
  v_ins text;
  v_loc text;
  v_flag text;
begin
  select fr.*, lo.nome as origem_nome, ld.nome as destino_nome, lo.fornecedor_id as origem_fornecedor
    into f
  from public.fretes fr
  join public.localidades lo on lo.id = fr.origem_localidade_id
  join public.localidades ld on ld.id = fr.destino_localidade_id
  where fr.id = p_frete;
  if not found then return; end if;
  -- Só os fretes novos: os antigos não mexem no estoque, nem quando editados.
  if f.created_at < public.fn_estoque_frete_corte() or f.origem <> 'manual' then return; end if;

  v_ativo := f.excluido_em is null and f.data_chegada is not null and coalesce(f.peso_toneladas, 0) > 0;
  select e.id, e.pilha_id, e.excluido_em, p.localidade_id, p.insumo_id as pilha_insumo into v_ent
  from public.estoque_entradas e left join public.estoque_pilhas p on p.id = e.pilha_id
  where e.frete_id = p_frete;
  select t.*, po.localidade_id as origem_local, pd.localidade_id as destino_local into v_tr
  from public.estoque_transferencias t
  left join public.estoque_pilhas po on po.id = t.origem_pilha_id
  left join public.estoque_pilhas pd on pd.id = t.destino_pilha_id
  where t.frete_id = p_frete;

  -- Desfazer o que não vale mais (sem chegada, excluído, ou tipo trocado).
  if v_ent.id is not null and v_ent.excluido_em is null and not (v_ativo and f.tipo = 'material') then
    v_flag := current_setting('erp.estoque_sync', true);
  perform set_config('erp.estoque_sync', '1', true);
    update public.estoque_entradas set excluido_em = now(), excluido_por = (select auth.uid()),
      motivo_exclusao = case when f.excluido_em is not null then 'Frete excluído' else 'Frete sem chegada' end
    where id = v_ent.id;
    perform set_config('erp.estoque_sync', coalesce(v_flag, ''), true);
  end if;
  if v_tr.id is not null and v_tr.excluido_em is null and not (v_ativo and f.tipo = 'transferencia') then
    update public.estoque_transferencias set excluido_em = now(), excluido_por = (select auth.uid()),
      motivo_exclusao = case when f.excluido_em is not null then 'Frete excluído' else 'Frete sem chegada' end
    where id = v_tr.id;
    perform public.fn_estoque_aplicar_transferencia(v_tr.id);
  end if;
  if not v_ativo then return; end if;

  select nome into v_ins from public.insumos where id = f.insumo_id;

  if f.tipo = 'material' then
    -- Mantém a pilha já ligada enquanto destino e insumo forem os mesmos.
    v_pilha := case when v_ent.id is not null and v_ent.localidade_id = f.destino_localidade_id and v_ent.pilha_insumo = f.insumo_id
                    then v_ent.pilha_id end;
    v_pilha := coalesce(v_pilha, public.fn_estoque_pilha_do_local(f.destino_localidade_id, f.insumo_id, true));
    v_vu := round((coalesce(f.valor_material, 0) + coalesce(f.valor_total, 0)) / f.peso_toneladas, 4);
    v_fornecedor := f.origem_fornecedor;
    v_flag := current_setting('erp.estoque_sync', true);
  perform set_config('erp.estoque_sync', '1', true);
    if v_ent.id is null then
      insert into public.estoque_entradas (pilha_id, insumo_id, quantidade, valor_unitario, data, fornecedor_id,
        nota_fiscal, frete_id, observacoes)
      values (v_pilha, f.insumo_id, f.peso_toneladas, v_vu, f.data_chegada, v_fornecedor,
        nullif(btrim(concat_ws(' / ', f.nota_fiscal, f.nota_fiscal2)), ''), p_frete,
        'Frete ' || f.origem_nome || ' → ' || f.destino_nome);
    else
      update public.estoque_entradas set
        deposito_id = null, tanque_id = null, pilha_id = v_pilha, insumo_id = f.insumo_id, quantidade = f.peso_toneladas,
        valor_unitario = v_vu, data = f.data_chegada, fornecedor_id = v_fornecedor,
        nota_fiscal = nullif(btrim(concat_ws(' / ', f.nota_fiscal, f.nota_fiscal2)), ''),
        observacoes = 'Frete ' || f.origem_nome || ' → ' || f.destino_nome,
        excluido_em = null, excluido_por = null, motivo_exclusao = null
      where id = v_ent.id;
    end if;
    perform set_config('erp.estoque_sync', coalesce(v_flag, ''), true);
    return;
  end if;

  -- Transferência: sai da pilha da origem, entra na do destino a custo + frete / t.
  v_origem := case when v_tr.id is not null and v_tr.origem_local = f.origem_localidade_id and v_tr.insumo_id = f.insumo_id
                   then v_tr.origem_pilha_id end;
  v_origem := coalesce(v_origem, public.fn_estoque_pilha_do_local(f.origem_localidade_id, f.insumo_id, false));
  if v_origem is null then
    raise exception 'Não há pilha ativa de % em %: crie a pilha no Estoque (aba Pilhas) e dê entrada do saldo antes de registrar a transferência',
      v_ins, f.origem_nome;
  end if;
  v_pilha := case when v_tr.id is not null and v_tr.destino_local = f.destino_localidade_id and v_tr.insumo_id = f.insumo_id
                  then v_tr.destino_pilha_id end;
  v_pilha := coalesce(v_pilha, public.fn_estoque_pilha_do_local(f.destino_localidade_id, f.insumo_id, true));

  if v_tr.id is null then
    insert into public.estoque_transferencias (origem_pilha_id, destino_pilha_id, insumo_id, quantidade, data_saida, data_chegada,
      custo_adicional, frete_id, observacoes)
    values (v_origem, v_pilha, f.insumo_id, f.peso_toneladas, f.data, greatest(f.data, f.data_chegada),
      coalesce(f.valor_total, 0), p_frete, 'Frete ' || f.origem_nome || ' → ' || f.destino_nome)
    returning id into v_tr_id;
  else
    update public.estoque_transferencias set
      origem_deposito_id = null, origem_tanque_id = null, origem_pilha_id = v_origem,
      destino_deposito_id = null, destino_tanque_id = null, destino_pilha_id = v_pilha,
      insumo_id = f.insumo_id, quantidade = f.peso_toneladas, data_saida = f.data,
      data_chegada = greatest(f.data, f.data_chegada), custo_adicional = coalesce(f.valor_total, 0),
      observacoes = 'Frete ' || f.origem_nome || ' → ' || f.destino_nome,
      excluido_em = null, excluido_por = null, motivo_exclusao = null
    where id = v_tr.id;
    v_tr_id := v_tr.id;
  end if;
  perform public.fn_estoque_aplicar_transferencia(v_tr_id);
end $$;
revoke all on function public.fn_frete_sincronizar_estoque(uuid) from public, anon, authenticated;

create or replace function public.fn_frete_trg_estoque()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_frete_sincronizar_estoque(new.id);
  return null;
end $$;
revoke all on function public.fn_frete_trg_estoque() from public, anon, authenticated;
create trigger trg_fretes_estoque after insert or update of tipo, data, data_chegada, origem_localidade_id, destino_localidade_id,
  insumo_id, peso_toneladas, valor_total, valor_material, nota_fiscal, nota_fiscal2, excluido_em
  on public.fretes for each row execute function public.fn_frete_trg_estoque();

-- 8. Quem vê o Estoque, permissões, grants ---------------------------------------------------------
create or replace function public.fn_ve_estoque()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.tem_permissao('estoque.posicao', 'ver')
      or public.tem_permissao('estoque.entradas', 'ver')
      or public.tem_permissao('estoque.saidas', 'ver')
      or public.tem_permissao('estoque.depositos', 'ver')
      or public.tem_permissao('estoque.tanques', 'ver')
      or public.tem_permissao('estoque.pilhas', 'ver')
      or public.tem_permissao('estoque.transferencias', 'ver');
$$;

-- Quem vê pilhas e transferências lê as localidades (o nome do local).
alter policy localidades_select on public.localidades using (
  (select public.tem_permissao('cadastros.localidades', 'ver')) or (select public.fn_ve_frete())
  or (select public.fn_ve_estoque()));

do $grants$
declare f text;
begin
  foreach f in array array[
    'fn_estoque_salvar_transferencia(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,date,date,numeric,text)',
    'fn_estoque_excluir_transferencia(uuid,text)', 'fn_estoque_restaurar_transferencia(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.fn_estoque_recalcular_peps(uuid, uuid, uuid, uuid) from public, anon, authenticated;
end $grants$;

-- Quem registra saídas registra transferências.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select perfil_id, 'estoque.transferencias', acao from public.perfil_permissoes
where recurso = 'estoque.saidas' and acao in ('ver', 'criar', 'editar', 'excluir')
on conflict (perfil_id, recurso, acao) do nothing;
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select usuario_id, 'estoque.transferencias', acao from public.usuario_permissoes
where recurso = 'estoque.saidas' and acao in ('ver', 'criar', 'editar', 'excluir')
on conflict (usuario_id, recurso, acao) do nothing;
