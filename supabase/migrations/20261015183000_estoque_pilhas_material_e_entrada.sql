-- Estoque: pilhas, cache para a listagem (15/10/2026).
--
-- - `total_entrada`: soma das entradas ativas, para a tela mostrar "10 de 120 m³" sem ler
--   as entradas (a aba Pilhas não exige ver Entradas).
-- - `insumo_atual_id` fica com o material da última entrada quando a pilha zera: a pilha
--   inativa continua dizendo se era areia ou brita.
--
-- Alterada a partir de fn_estoque_atualizar_pilha da migration 20261015180000.

alter table public.estoque_pilhas add column total_entrada numeric(14,4) not null default 0;

create or replace function public.fn_estoque_atualizar_pilha(p_pilha uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_pilha record;
  v_n int;
  v_insumo uuid;
  v_saldo numeric;
  v_entrada numeric;
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

  -- Zerada: o material é o da última entrada.
  if v_insumo is null then
    select insumo_id into v_insumo from public.estoque_entradas
    where pilha_id = p_pilha and excluido_em is null
    order by data desc, created_at desc, id desc limit 1;
  end if;

  select coalesce(sum(quantidade), 0) into v_entrada
  from public.estoque_entradas where pilha_id = p_pilha and excluido_em is null;

  select max(data) into v_ultima_saida from public.estoque_saidas where pilha_id = p_pilha and excluido_em is null;
  v_ativo := not (v_ultima_saida is not null and coalesce(v_saldo, 0) = 0);
  v_zerada := case when v_ativo then null else v_ultima_saida end;

  update public.estoque_pilhas
  set saldo = coalesce(v_saldo, 0), total_entrada = v_entrada, insumo_atual_id = v_insumo, ativo = v_ativo, zerada_em = v_zerada
  where id = p_pilha
    and (saldo, total_entrada, insumo_atual_id, ativo, zerada_em)
        is distinct from (coalesce(v_saldo, 0), v_entrada, v_insumo, v_ativo, v_zerada);
end $$;
revoke all on function public.fn_estoque_atualizar_pilha(uuid) from public, anon, authenticated;
