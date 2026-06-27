-- =============================================================
-- Orcamentos: calculo automatico de totais
--  - item folha (sem filhos): preco_unitario = custo_unitario * (1 + BDI/100);
--    custo_total = qtd * custo_unitario; preco_total = qtd * preco_unitario.
--    (trigger BEFORE, por linha)
--  - etapa/subetapa (no com filhos): total = soma dos totais das folhas
--    descendentes (rollup).
--  - cabecalho orcamentos: soma das raizes.
-- O rollup roda sozinho a cada insert/update/delete de item (trigger AFTER),
-- protegido por um guard transacional pra nao recursar nos updates internos.
-- =============================================================

-- ---------- derivados da folha (BEFORE INSERT/UPDATE) ----------
create or replace function public.fn_orcamento_item_calc()
returns trigger
language plpgsql
as $$
declare
  v_tem_filhos boolean;
begin
  -- preco unitario sempre derivado de custo + BDI (modo "preco = custo*(1+BDI)")
  if new.custo_unitario is not null then
    new.preco_unitario := round(new.custo_unitario * (1 + coalesce(new.bdi, 0) / 100.0), 4);
  end if;

  -- folha: total = qtd * unitario. No com filhos: rollup cuida, nao mexe aqui.
  select exists (
    select 1 from public.orcamento_itens c where c.parent_id = new.id
  ) into v_tem_filhos;

  if not v_tem_filhos then
    new.custo_total := round(coalesce(new.quantidade, 0) * coalesce(new.custo_unitario, 0), 2);
    new.preco_total := round(coalesce(new.quantidade, 0) * coalesce(new.preco_unitario, 0), 2);
  end if;

  return new;
end;
$$;

-- ---------- rollup do orcamento inteiro (SECURITY DEFINER) ----------
create or replace function public.recalcular_orcamento(p_orc uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- guard: liga so DURANTE os updates internos, pra o trigger AFTER nao
  -- re-disparar neles. Desliga no fim, pra nao bloquear outros statements da
  -- mesma transacao (vale tambem quando chamado direto, sem recursar).
  perform set_config('orcamento.recalc', '1', true);

  -- nos internos = soma dos totais das folhas descendentes
  with recursive subindo as (
    -- ancora: cada folha carrega o proprio total
    select i.id as folha, i.id as anc, i.custo_total as ct, i.preco_total as pt
    from public.orcamento_itens i
    where i.orcamento_id = p_orc
      and not exists (select 1 from public.orcamento_itens c where c.parent_id = i.id)
    union all
    -- sobe pro pai carregando o total da folha
    select s.folha, p.parent_id as anc, s.ct, s.pt
    from subindo s
    join public.orcamento_itens p on p.id = s.anc
    where p.parent_id is not null
  ),
  agg as (
    select anc as id, round(sum(ct), 2) as ct, round(sum(pt), 2) as pt
    from subindo
    group by anc
  )
  update public.orcamento_itens t
  set custo_total = a.ct,
      preco_total = a.pt
  from agg a
  where t.id = a.id
    and t.orcamento_id = p_orc
    and exists (select 1 from public.orcamento_itens c where c.parent_id = t.id);

  -- cabecalho = soma das raizes
  update public.orcamentos o
  set custo_total = coalesce(
        (select sum(custo_total) from public.orcamento_itens
         where orcamento_id = p_orc and parent_id is null), 0),
      preco_total = coalesce(
        (select sum(preco_total) from public.orcamento_itens
         where orcamento_id = p_orc and parent_id is null), 0)
  where o.id = p_orc;

  perform set_config('orcamento.recalc', '0', true);
end;
$$;

grant execute on function public.recalcular_orcamento(uuid) to authenticated;

-- ---------- dispara o rollup apos qualquer mudanca de item ----------
create or replace function public.fn_orcamento_rollup_trg()
returns trigger
language plpgsql
as $$
begin
  -- nao re-dispara durante os updates internos do recalcular
  if coalesce(current_setting('orcamento.recalc', true), '') = '1' then
    return null;
  end if;
  perform public.recalcular_orcamento(coalesce(new.orcamento_id, old.orcamento_id));
  return null;
end;
$$;

create trigger trg_orcamento_itens_calc
  before insert or update on public.orcamento_itens
  for each row execute function public.fn_orcamento_item_calc();

create trigger trg_orcamento_itens_rollup
  after insert or update or delete on public.orcamento_itens
  for each row execute function public.fn_orcamento_rollup_trg();

-- ---------- backfill: normaliza os totais dos orcamentos ja carregados ----------
do $$
declare r record;
begin
  for r in select id from public.orcamentos loop
    perform public.recalcular_orcamento(r.id);
  end loop;
end;
$$;
