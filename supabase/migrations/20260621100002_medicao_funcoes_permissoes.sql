-- =============================================================
-- Fase 6 / Migration: funções e permissões da Medição
-- Numeração automática (MED), aprovar medição (valida saldo, calcula
-- bruto+reajuste+total, gera fatura + lançamento a receber + parcela),
-- cancelar (rascunho) e desaprovar (aprovada -> reverte fatura/lançamento
-- se ainda não recebida). Permissões do módulo.
-- =============================================================

-- Numeração MED-AAAA-NNNN no insert da medição.
create or replace function public.fn_set_medicao_numero()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.numero is null then
    new.numero := public.proximo_numero_documento('MED');
  end if;
  return new;
end $$;
create trigger trg_set_medicao_numero before insert on public.medicoes for each row execute function public.fn_set_medicao_numero();

-- ---------- Aprovar medição -> fatura + a receber ----------
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
  if not exists (select 1 from public.medicao_itens where medicao_id = p_medicao and quantidade > 0) then
    raise exception 'A medicao nao tem item medido';
  end if;

  -- Valida cada item contra o saldo contratual (acumulado das medições já aprovadas).
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

-- ---------- Cancelar medição em rascunho ----------
create or replace function public.fn_cancelar_medicao(p_medicao uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.tem_permissao('medicao.medicoes', 'editar') then raise exception 'Sem permissao'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  select status into v_status from public.medicoes where id = p_medicao;
  if v_status is null then raise exception 'Medicao nao encontrada'; end if;
  if v_status <> 'rascunho' then raise exception 'So da para cancelar uma medicao em rascunho (use desaprovar para uma aprovada)'; end if;
  update public.medicoes set status = 'cancelada', motivo_cancelamento = p_motivo where id = p_medicao;
end $$;
revoke all on function public.fn_cancelar_medicao(uuid, text) from public, anon;
grant execute on function public.fn_cancelar_medicao(uuid, text) to authenticated;

-- ---------- Desaprovar medição (reverte fatura + a receber) ----------
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

  update public.medicoes set status = 'cancelada', motivo_cancelamento = p_motivo where id = p_medicao;
end $$;
revoke all on function public.fn_desaprovar_medicao(uuid, text) from public, anon;
grant execute on function public.fn_desaprovar_medicao(uuid, text) to authenticated;

-- ---------- Permissões do módulo ----------
create temporary table _med_pares (recurso text, acao text) on commit drop;
insert into _med_pares (recurso, acao) values
  ('medicao.planilha-contratual','ver'),('medicao.planilha-contratual','criar'),('medicao.planilha-contratual','editar'),('medicao.planilha-contratual','excluir'),
  ('medicao.medicoes','ver'),('medicao.medicoes','criar'),('medicao.medicoes','editar'),('medicao.medicoes','aprovar'),('medicao.medicoes','desaprovar'),
  ('medicao.faturas','ver');

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, m.recurso, m.acao from public.perfis p cross join _med_pares m
where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

-- Engenharia: monta planilha e medições (sem desaprovar).
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, m.recurso, m.acao from public.perfis p cross join _med_pares m
where p.nome = 'Engenharia' and m.acao <> 'desaprovar'
on conflict (perfil_id, recurso, acao) do nothing;

-- Financeiro: vê medições e faturas.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, m.recurso, 'ver' from public.perfis p cross join _med_pares m
where p.nome = 'Financeiro' and m.acao = 'ver'
on conflict (perfil_id, recurso, acao) do nothing;

-- Gestor: só leitura.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, m.recurso, 'ver' from public.perfis p cross join _med_pares m
where p.nome = 'Gestor' and m.acao = 'ver'
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
join public.perfil_permissoes pp on pp.perfil_id = p.id
where pp.recurso like 'medicao.%'
on conflict (usuario_id, recurso, acao) do nothing;
