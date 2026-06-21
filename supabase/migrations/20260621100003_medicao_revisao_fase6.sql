-- =============================================================
-- Fase 6 / Migration: correções da revisão adversarial
-- 1. fn_desaprovar_medicao volta a medição para RASCUNHO (não cancelada),
--    revertendo a fatura/lançamento, para permitir corrigir e reaprovar.
-- 2. fn_aprovar_medicao serializa por obra (advisory lock): duas aprovações
--    concorrentes da mesma obra não estouram o saldo contratual.
-- 3. Triggers de integridade: a planilha da medição pertence à obra; o item
--    medido pertence à planilha da medição (Server Action não basta).
-- =============================================================

-- 1 + 2. Recria as funções.
create or replace function public.fn_aprovar_medicao(p_medicao uuid, p_data_vencimento date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_status text; v_obra uuid; v_planilha uuid; v_numero text; v_reaj_tipo text; v_reaj_valor numeric;
  v_cliente uuid; v_cc uuid; v_competencia date;
  v_item record; v_acum numeric; v_saldo numeric;
  v_bruto numeric := 0; v_reajuste numeric := 0; v_total numeric;
  v_numero_fat text; v_fatura uuid; v_lanc uuid;
begin
  if not public.tem_permissao('medicao.medicoes', 'aprovar') then raise exception 'Sem permissao para aprovar medicao'; end if;

  select status, obra_id, planilha_id, numero, reajuste_tipo, reajuste_valor, competencia
  into v_status, v_obra, v_planilha, v_numero, v_reaj_tipo, v_reaj_valor, v_competencia
  from public.medicoes where id = p_medicao;
  if v_status is null then raise exception 'Medicao nao encontrada'; end if;
  if v_status <> 'rascunho' then raise exception 'So da para aprovar uma medicao em rascunho'; end if;

  -- Serializa aprovações concorrentes da mesma obra (saldo contratual e regra dura).
  perform pg_advisory_xact_lock(hashtextextended(v_obra::text, 0));

  if not exists (select 1 from public.medicao_itens where medicao_id = p_medicao and quantidade > 0) then
    raise exception 'A medicao nao tem item medido';
  end if;

  for v_item in
    select mi.planilha_item_id, mi.quantidade, pi.quantidade_contratada, pi.preco_unitario, pi.descricao
    from public.medicao_itens mi join public.planilha_itens pi on pi.id = mi.planilha_item_id
    where mi.medicao_id = p_medicao
  loop
    select coalesce(sum(mi2.quantidade), 0) into v_acum
    from public.medicao_itens mi2 join public.medicoes m2 on m2.id = mi2.medicao_id
    where mi2.planilha_item_id = v_item.planilha_item_id
      and m2.status = 'aprovada' and m2.id <> p_medicao;
    v_saldo := v_item.quantidade_contratada - v_acum;
    if v_item.quantidade > v_saldo then
      raise exception 'Item "%" excede o saldo contratual (saldo %, medido %)', v_item.descricao, v_saldo, v_item.quantidade;
    end if;
    v_bruto := v_bruto + round(v_item.quantidade * v_item.preco_unitario, 2);
  end loop;

  v_reajuste := case v_reaj_tipo
    when 'percentual' then round(v_bruto * v_reaj_valor / 100.0, 2)
    when 'valor' then round(v_reaj_valor, 2)
    else 0 end;
  v_total := v_bruto + v_reajuste;

  select cliente_id into v_cliente from public.obras where id = v_obra;
  select id into v_cc from public.centros_custo where obra_id = v_obra and nivel = 1 limit 1;
  v_numero_fat := public.proximo_numero_documento('FAT');

  insert into public.faturas (numero, medicao_id, obra_id, cliente_id, competencia, valor, data_vencimento, status, created_by)
  values (v_numero_fat, p_medicao, v_obra, v_cliente, v_competencia, v_total, p_data_vencimento, 'aberta', (select auth.uid()))
  returning id into v_fatura;

  insert into public.lancamentos (tipo, origem, origem_id, centro_custo_id, descricao, valor, status, competencia, data_vencimento, created_by)
  values ('a_receber', 'fatura', v_fatura, v_cc, 'Fatura ' || v_numero_fat || ' - Medicao ' || coalesce(v_numero, ''), v_total, 'a_pagar', v_competencia, p_data_vencimento, (select auth.uid()))
  returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_total, p_data_vencimento, 'pendente', (select auth.uid()));

  update public.faturas set lancamento_id = v_lanc where id = v_fatura;
  update public.medicoes
  set status = 'aprovada', valor_bruto = v_bruto, valor_reajuste = v_reajuste, valor_total = v_total,
      data_aprovacao = (now() at time zone 'America/Rio_Branco')::date
  where id = p_medicao;

  return v_fatura;
end $$;
revoke all on function public.fn_aprovar_medicao(uuid, date) from public, anon;
grant execute on function public.fn_aprovar_medicao(uuid, date) to authenticated;

create or replace function public.fn_desaprovar_medicao(p_medicao uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_fatura uuid; v_lanc uuid; v_recebido boolean;
begin
  if not public.tem_permissao('medicao.medicoes', 'desaprovar') then raise exception 'Sem permissao para desaprovar medicao'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  select status into v_status from public.medicoes where id = p_medicao;
  if v_status is null then raise exception 'Medicao nao encontrada'; end if;
  if v_status <> 'aprovada' then raise exception 'So da para desaprovar uma medicao aprovada'; end if;

  select id, lancamento_id into v_fatura, v_lanc from public.faturas where medicao_id = p_medicao and status = 'aberta' order by created_at desc limit 1;

  if v_lanc is not null then
    select exists (select 1 from public.lancamento_parcelas where lancamento_id = v_lanc and status = 'pago') into v_recebido;
    if v_recebido then raise exception 'A fatura ja foi recebida; nao da para desaprovar a medicao'; end if;
    update public.lancamento_parcelas set status = 'cancelado' where lancamento_id = v_lanc and status <> 'pago';
    update public.lancamentos set status = 'cancelado' where id = v_lanc;
  end if;
  if v_fatura is not null then
    update public.faturas set status = 'cancelada' where id = v_fatura;
  end if;

  -- Volta para rascunho para corrigir e reaprovar (gera nova fatura).
  update public.medicoes
  set status = 'rascunho', data_aprovacao = null,
      valor_bruto = 0, valor_reajuste = 0, valor_total = 0, motivo_cancelamento = null
  where id = p_medicao;
end $$;
revoke all on function public.fn_desaprovar_medicao(uuid, text) from public, anon;
grant execute on function public.fn_desaprovar_medicao(uuid, text) to authenticated;

-- 3. Integridade obra <-> planilha <-> item (Server Action não é barreira suficiente).
create or replace function public.fn_check_medicao_planilha()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_obra_planilha uuid;
begin
  select obra_id into v_obra_planilha from public.planilhas_contratuais where id = new.planilha_id;
  if v_obra_planilha is null or v_obra_planilha <> new.obra_id then
    raise exception 'A planilha contratual nao pertence a obra da medicao';
  end if;
  return new;
end $$;
create trigger trg_check_medicao_planilha before insert or update of obra_id, planilha_id on public.medicoes
  for each row execute function public.fn_check_medicao_planilha();

create or replace function public.fn_check_medicao_item_planilha()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_planilha_med uuid; v_planilha_item uuid;
begin
  select planilha_id into v_planilha_med from public.medicoes where id = new.medicao_id;
  select planilha_id into v_planilha_item from public.planilha_itens where id = new.planilha_item_id;
  if v_planilha_med is null or v_planilha_item is null or v_planilha_med <> v_planilha_item then
    raise exception 'O item medido nao pertence a planilha da medicao';
  end if;
  return new;
end $$;
create trigger trg_check_medicao_item_planilha before insert or update of medicao_id, planilha_item_id on public.medicao_itens
  for each row execute function public.fn_check_medicao_item_planilha();
