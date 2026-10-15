-- Estoque: a pilha nasce com o insumo (15/10/2026).
--
-- Pedido do Tiago: "quando crio a pilha, já tem que colocar o insumo e unidade de medida".
-- A unidade é a do cadastro do insumo (o mesmo agregado existe como insumos diferentes por
-- unidade, ex. BRITA 1 em t e PEDRA BRITADA N. 1 em m³): escolher o insumo escolhe a unidade.
--
-- - `insumo_atual_id` (cache derivado) vira `insumo_id` (ESCOLHIDO no cadastro).
-- - Obrigatório por CHECK NOT VALID: vale para toda pilha nova e toda edição. As 3 pilhas
--   criadas antes disto (todas "Brita 1 - ...", sem movimento) ficam sem insumo até serem
--   editadas: há BRITA 1 em t e em m³, e o banco não escolhe pelo Tiago.
-- - Movimento de outro insumo numa pilha é recusado (gatilho antes de gravar), e pilha sem
--   insumo não recebe movimento.
-- - Trocar o insumo de pilha que já tem movimento é recusado.
--
-- fn_estoque_atualizar_pilha alterada a partir da definição de 20261015183000.

alter table public.estoque_pilhas rename column insumo_atual_id to insumo_id;
alter index public.idx_estoque_pilhas_insumo rename to idx_estoque_pilhas_insumo_id;
alter table public.estoque_pilhas add constraint estoque_pilhas_insumo_obrigatorio check (insumo_id is not null) not valid;
grant insert (insumo_id), update (insumo_id) on public.estoque_pilhas to authenticated;

-- 1. O insumo da pilha: ativo, do Estoque, e fixo depois do primeiro movimento ----------------
create or replace function public.fn_estoque_trg_pilha_cadastro()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_outro text;
begin
  if tg_op = 'UPDATE' and new.insumo_id is not distinct from old.insumo_id then return new; end if;
  if new.insumo_id is null then return new; end if; -- o CHECK responde
  if tg_op = 'UPDATE' and old.insumo_id is not null and (
       exists (select 1 from public.estoque_entradas where pilha_id = new.id and excluido_em is null)
    or exists (select 1 from public.estoque_saidas where pilha_id = new.id and excluido_em is null)) then
    raise exception 'A pilha % já tem entrada ou saída: o insumo não pode mais ser trocado', new.nome;
  end if;
  if not exists (select 1 from public.insumos where id = new.insumo_id and ativo) then
    raise exception 'Insumo inexistente ou inativo';
  end if;
  v_outro := public.fn_estoque_insumo_de_outro_modulo(new.insumo_id);
  if v_outro is not null then
    raise exception 'Este insumo é %: não vai para pilha do Estoque', v_outro;
  end if;
  return new;
end $$;
revoke all on function public.fn_estoque_trg_pilha_cadastro() from public, anon, authenticated;
create trigger trg_estoque_pilhas_cadastro before insert or update of insumo_id on public.estoque_pilhas
  for each row execute function public.fn_estoque_trg_pilha_cadastro();

-- 2. Movimento na pilha só do insumo dela ----------------------------------------------------
create or replace function public.fn_estoque_trg_movimento_pilha()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_pilha record; v_nome text;
begin
  if new.pilha_id is null or new.excluido_em is not null then return new; end if;
  select p.nome, p.insumo_id, i.nome as insumo_nome, u.sigla
    into v_pilha
  from public.estoque_pilhas p
  left join public.insumos i on i.id = p.insumo_id
  left join public.unidades_medida u on u.id = i.unidade_id
  where p.id = new.pilha_id;
  if not found then raise exception 'Pilha inexistente'; end if;
  if v_pilha.insumo_id is null then
    raise exception 'A pilha % está sem insumo: edite a pilha e escolha o insumo antes de movimentar', v_pilha.nome;
  end if;
  if new.insumo_id <> v_pilha.insumo_id then
    select nome into v_nome from public.insumos where id = new.insumo_id;
    raise exception 'A pilha % é de % (%): % não entra nela', v_pilha.nome, v_pilha.insumo_nome,
      coalesce(v_pilha.sigla, 'sem unidade'), v_nome;
  end if;
  return new;
end $$;
revoke all on function public.fn_estoque_trg_movimento_pilha() from public, anon, authenticated;
create trigger trg_estoque_entradas_pilha before insert or update of pilha_id, insumo_id, excluido_em on public.estoque_entradas
  for each row execute function public.fn_estoque_trg_movimento_pilha();
create trigger trg_estoque_saidas_pilha before insert or update of pilha_id, insumo_id, excluido_em on public.estoque_saidas
  for each row execute function public.fn_estoque_trg_movimento_pilha();

-- 3. O cache não mexe mais no insumo ---------------------------------------------------------
create or replace function public.fn_estoque_atualizar_pilha(p_pilha uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_pilha record;
  v_saldo numeric;
  v_entrada numeric;
  v_ultima_saida date;
  v_ativo boolean;
  v_zerada date;
begin
  select id, nome into v_pilha from public.estoque_pilhas where id = p_pilha for update;
  if not found then return; end if;

  -- Um insumo só, garantido pelo gatilho dos movimentos.
  select coalesce(sum(quantidade), 0) into v_entrada
  from public.estoque_entradas where pilha_id = p_pilha and excluido_em is null;
  select v_entrada - coalesce(sum(quantidade), 0), max(data) into v_saldo, v_ultima_saida
  from public.estoque_saidas where pilha_id = p_pilha and excluido_em is null;

  v_ativo := not (v_ultima_saida is not null and v_saldo = 0);
  v_zerada := case when v_ativo then null else v_ultima_saida end;

  update public.estoque_pilhas
  set saldo = v_saldo, total_entrada = v_entrada, ativo = v_ativo, zerada_em = v_zerada
  where id = p_pilha
    and (saldo, total_entrada, ativo, zerada_em) is distinct from (v_saldo, v_entrada, v_ativo, v_zerada);
end $$;
revoke all on function public.fn_estoque_atualizar_pilha(uuid) from public, anon, authenticated;
