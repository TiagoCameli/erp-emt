-- =============================================================
-- Fase 4 / Migration: integração recebimento -> entrada de estoque
-- + permissões do módulo estoque.
-- fn_registrar_recebimento (Fase 2/3) agora dá entrada no estoque para
-- os itens com depósito de destino, com o custo unitário da OC (PEPS).
-- Mantém tudo que a revisão da Fase 3 já corrigiu (competência, rateio).
-- =============================================================

create or replace function public.fn_registrar_recebimento(
  p_oc_id uuid, p_numero_nf text, p_valor_nf numeric, p_data_recebimento date,
  p_data_vencimento date, p_itens jsonb, p_observacoes text default null
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_oc_status text; v_fornecedor uuid; v_numero_oc text; v_recebimento_id uuid;
  v_esperado numeric(14, 2); v_tolerancia numeric; v_item jsonb;
  v_total_pedido numeric(14, 3); v_total_recebido numeric(14, 3); v_lancamento_id uuid;
  v_ja_recebido numeric(14, 3); v_qtd_pedida numeric(14, 3);
  v_valor_lanc numeric(14, 2); v_competencia date; v_soma_rat numeric(14, 2); v_ajuste numeric(14, 2);
  v_ins uuid; v_dep uuid; v_preco numeric(14, 2);
begin
  if not public.tem_permissao('compras.recebimentos', 'criar') then
    raise exception 'Sem permissao para registrar recebimentos';
  end if;

  select status, fornecedor_id, numero into v_oc_status, v_fornecedor, v_numero_oc
  from public.ordens_compra where id = p_oc_id;
  if v_oc_status is null then raise exception 'Ordem de compra nao encontrada'; end if;
  if v_oc_status not in ('aprovado', 'recebido_parcial') then raise exception 'So da para receber uma OC aprovada'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Informe ao menos um item recebido'; end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select oi.quantidade into v_qtd_pedida from public.oc_itens oi where oi.id = (v_item->>'oc_item_id')::uuid and oi.ordem_compra_id = p_oc_id;
    if v_qtd_pedida is null then raise exception 'Item nao pertence a ordem de compra informada'; end if;
    select coalesce(sum(ri.quantidade_recebida), 0) into v_ja_recebido
    from public.recebimento_itens ri join public.recebimentos r on r.id = ri.recebimento_id
    where ri.oc_item_id = (v_item->>'oc_item_id')::uuid and r.status = 'registrado';
    if v_ja_recebido + (v_item->>'quantidade_recebida')::numeric > v_qtd_pedida then raise exception 'Quantidade recebida excede o saldo do item'; end if;
  end loop;

  select coalesce(sum((item->>'quantidade_recebida')::numeric * oi.preco_unitario), 0) into v_esperado
  from jsonb_array_elements(p_itens) item join public.oc_itens oi on oi.id = (item->>'oc_item_id')::uuid where oi.ordem_compra_id = p_oc_id;
  select coalesce((valor)::numeric, 0) into v_tolerancia from public.configuracoes where chave = 'tolerancia_divergencia_nf_percentual';
  if p_valor_nf is not null and v_esperado > 0 then
    if abs(p_valor_nf - v_esperado) > v_esperado * (coalesce(v_tolerancia, 0) / 100.0) then
      raise exception 'Valor da NF (R$ %) diverge do esperado (R$ %) acima da tolerancia de %.', p_valor_nf, v_esperado, (coalesce(v_tolerancia, 0)::text || '%');
    end if;
  end if;

  v_competencia := coalesce(p_data_recebimento, (now() at time zone 'America/Rio_Branco')::date);

  insert into public.recebimentos (ordem_compra_id, numero_nf, valor_nf, data_recebimento, data_vencimento, observacoes, created_by)
  values (p_oc_id, p_numero_nf, p_valor_nf, v_competencia, p_data_vencimento, p_observacoes, (select auth.uid()))
  returning id into v_recebimento_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    insert into public.recebimento_itens (recebimento_id, oc_item_id, quantidade_recebida)
    values (v_recebimento_id, (v_item->>'oc_item_id')::uuid, (v_item->>'quantidade_recebida')::numeric);
    -- entrada no estoque para itens com deposito de destino (PEPS, custo da OC)
    select oi.insumo_id, oi.deposito_id, oi.preco_unitario into v_ins, v_dep, v_preco
    from public.oc_itens oi where oi.id = (v_item->>'oc_item_id')::uuid;
    if v_dep is not null then
      perform public.fn_estoque_entrada_interna(v_ins, v_dep, (v_item->>'quantidade_recebida')::numeric, v_preco, 'recebimento', v_recebimento_id, v_competencia, 'Recebimento da OC ' || coalesce(v_numero_oc, ''));
    end if;
  end loop;

  select coalesce(sum(quantidade), 0) into v_total_pedido from public.oc_itens where ordem_compra_id = p_oc_id;
  select coalesce(sum(ri.quantidade_recebida), 0) into v_total_recebido
  from public.recebimento_itens ri join public.recebimentos r on r.id = ri.recebimento_id
  where r.ordem_compra_id = p_oc_id and r.status = 'registrado';
  update public.ordens_compra set status = case when v_total_recebido >= v_total_pedido then 'recebido' else 'recebido_parcial' end where id = p_oc_id;

  select id into v_lancamento_id from public.lancamentos where origem = 'oc' and origem_id = p_oc_id and status = 'previsto' order by created_at limit 1;
  if v_lancamento_id is not null then
    v_valor_lanc := coalesce(p_valor_nf, (select valor from public.lancamentos where id = v_lancamento_id));
    update public.lancamentos set status = 'a_pagar', valor = v_valor_lanc, competencia = v_competencia, data_vencimento = p_data_vencimento where id = v_lancamento_id;
    update public.lancamento_parcelas set valor = v_valor_lanc, data_vencimento = p_data_vencimento where lancamento_id = v_lancamento_id;
    select coalesce(sum(valor), 0) into v_soma_rat from public.lancamento_rateios where lancamento_id = v_lancamento_id;
    if v_soma_rat > 0 and v_soma_rat <> v_valor_lanc then
      update public.lancamento_rateios set valor = round(valor * v_valor_lanc / v_soma_rat, 2) where lancamento_id = v_lancamento_id;
      select v_valor_lanc - coalesce(sum(valor), 0) into v_ajuste from public.lancamento_rateios where lancamento_id = v_lancamento_id;
      if v_ajuste <> 0 then
        update public.lancamento_rateios set valor = valor + v_ajuste where id = (select id from public.lancamento_rateios where lancamento_id = v_lancamento_id order by valor desc, id limit 1);
      end if;
    end if;
  else
    insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, competencia, data_vencimento, created_by)
    values ('a_pagar', 'oc', p_oc_id, v_fornecedor, 'Recebimento da OC ' || coalesce(v_numero_oc, ''), coalesce(p_valor_nf, 0), 'a_pagar', v_competencia, p_data_vencimento, (select auth.uid()))
    returning id into v_lancamento_id;
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lancamento_id, 1, coalesce(p_valor_nf, 0), p_data_vencimento, 'pendente', (select auth.uid()));
  end if;

  return v_recebimento_id;
end $function$;

-- -------------------------------------------------------------
-- Permissões do módulo estoque
-- -------------------------------------------------------------
create temporary table _est_pares (recurso text, acao text) on commit drop;
insert into _est_pares (recurso, acao) values
  ('estoque.posicao','ver'),
  ('estoque.entradas','ver'),('estoque.entradas','criar'),
  ('estoque.saidas','ver'),('estoque.saidas','criar'),
  ('estoque.transferencias','ver'),('estoque.transferencias','criar'),
  ('estoque.inventario','ver'),('estoque.inventario','criar'),
  ('estoque.tanques','ver'),('estoque.tanques','criar'),
  ('estoque.alertas','ver'),('estoque.alertas','editar');

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, e.recurso, e.acao from public.perfis p cross join _est_pares e
where p.nome in ('Admin', 'Almoxarife')
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, e.recurso, 'ver' from public.perfis p cross join _est_pares e
where p.nome = 'Gestor' and e.acao = 'ver'
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
join public.perfil_permissoes pp on pp.perfil_id = p.id
where pp.recurso like 'estoque.%'
on conflict (usuario_id, recurso, acao) do nothing;
