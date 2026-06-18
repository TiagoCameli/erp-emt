-- =============================================================
-- Fase 2 / Migration 18: correcoes da revisao adversarial
-- 1. Storage do bucket anexos: policies passam a checar a permissao por aba
--    (recurso derivado do path), nao so o bucket_id. Fecha o objeto, nao so
--    a linha de metadados.
-- 2. fn_registrar_recebimento: trava receber acima do saldo da OC e rejeita
--    item que nao pertence a OC informada. Tambem corrige o sinal de % na
--    mensagem de divergencia de NF.
-- 3. nomes_usuarios_compras: nomes de solicitante/aprovador para quem ve a
--    aba de pedidos, sem ler public.usuarios direto (RLS so deixa ver o
--    proprio registro).
-- =============================================================

-- -------------------------------------------------------------
-- 1. Storage: recurso derivado do path + policies com permissao por aba.
-- -------------------------------------------------------------
create or replace function public.fn_recurso_do_path_anexo(p_path text)
returns text language sql immutable set search_path = '' as $$
  select public.fn_recurso_do_anexo(split_part(p_path, '/', 1));
$$;
revoke all on function public.fn_recurso_do_path_anexo(text) from public, anon, authenticated;
grant execute on function public.fn_recurso_do_path_anexo(text) to authenticated;

drop policy if exists "anexos storage select" on storage.objects;
drop policy if exists "anexos storage insert" on storage.objects;
drop policy if exists "anexos storage delete" on storage.objects;

create policy "anexos storage select" on storage.objects
  for select to authenticated using (
    bucket_id = 'anexos'
    and (select public.tem_permissao(public.fn_recurso_do_path_anexo(name), 'ver'))
  );
create policy "anexos storage insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'anexos'
    and public.fn_recurso_do_path_anexo(name) is not null
    and (
      (select public.tem_permissao(public.fn_recurso_do_path_anexo(name), 'criar'))
      or (select public.tem_permissao(public.fn_recurso_do_path_anexo(name), 'editar'))
    )
  );
create policy "anexos storage delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'anexos'
    and (select public.tem_permissao(public.fn_recurso_do_path_anexo(name), 'editar'))
  );

-- -------------------------------------------------------------
-- 2. fn_registrar_recebimento: trava saldo + item da OC + mensagem de %.
-- -------------------------------------------------------------
create or replace function public.fn_registrar_recebimento(
  p_oc_id uuid,
  p_numero_nf text,
  p_valor_nf numeric,
  p_data_recebimento date,
  p_data_vencimento date,
  p_itens jsonb,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oc_status text;
  v_fornecedor uuid;
  v_numero_oc text;
  v_recebimento_id uuid;
  v_esperado numeric(14, 2);
  v_tolerancia numeric;
  v_item jsonb;
  v_oc_item_id uuid;
  v_qtd_recebida numeric(14, 3);
  v_qtd_pedida numeric(14, 3);
  v_ja_recebido numeric(14, 3);
  v_total_pedido numeric(14, 3);
  v_total_recebido numeric(14, 3);
  v_lancamento_id uuid;
begin
  if not public.tem_permissao('compras.recebimentos', 'criar') then
    raise exception 'Sem permissao para registrar recebimentos';
  end if;

  select status, fornecedor_id, numero
  into v_oc_status, v_fornecedor, v_numero_oc
  from public.ordens_compra where id = p_oc_id;

  if v_oc_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_oc_status not in ('aprovado', 'recebido_parcial') then
    raise exception 'So da para receber uma OC aprovada';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item recebido';
  end if;

  -- Todo item informado precisa pertencer a esta OC e nao pode ultrapassar o
  -- saldo (quantidade pedida menos o ja recebido em recebimentos registrados).
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_oc_item_id := (v_item->>'oc_item_id')::uuid;
    v_qtd_recebida := (v_item->>'quantidade_recebida')::numeric;

    select quantidade into v_qtd_pedida
    from public.oc_itens
    where id = v_oc_item_id and ordem_compra_id = p_oc_id;

    if v_qtd_pedida is null then
      raise exception 'Item nao pertence a ordem de compra informada';
    end if;

    select coalesce(sum(ri.quantidade_recebida), 0) into v_ja_recebido
    from public.recebimento_itens ri
    join public.recebimentos r on r.id = ri.recebimento_id
    where ri.oc_item_id = v_oc_item_id and r.status = 'registrado';

    if v_ja_recebido + v_qtd_recebida > v_qtd_pedida then
      raise exception 'Quantidade recebida (%) ultrapassa o saldo (%) do item da ordem',
        v_qtd_recebida, (v_qtd_pedida - v_ja_recebido);
    end if;
  end loop;

  -- Valor esperado desta remessa = soma(qtd recebida x preco do item na OC).
  select coalesce(sum(
    (item->>'quantidade_recebida')::numeric * oi.preco_unitario
  ), 0)
  into v_esperado
  from jsonb_array_elements(p_itens) item
  join public.oc_itens oi on oi.id = (item->>'oc_item_id')::uuid
  where oi.ordem_compra_id = p_oc_id;

  -- Divergencia NF x esperado acima da tolerancia trava (plano secao 5.2).
  select coalesce((valor)::numeric, 0) into v_tolerancia
  from public.configuracoes where chave = 'tolerancia_divergencia_nf_percentual';

  if p_valor_nf is not null and v_esperado > 0 then
    if abs(p_valor_nf - v_esperado) > v_esperado * (coalesce(v_tolerancia, 0) / 100.0) then
      raise exception 'Valor da NF (R$ %) diverge do esperado (R$ %) acima da tolerancia de %. Ajuste antes de registrar.',
        p_valor_nf, v_esperado, coalesce(v_tolerancia, 0)::text || '%';
    end if;
  end if;

  insert into public.recebimentos (ordem_compra_id, numero_nf, valor_nf, data_recebimento, data_vencimento, observacoes, created_by)
  values (p_oc_id, p_numero_nf, p_valor_nf, coalesce(p_data_recebimento, (now() at time zone 'America/Rio_Branco')::date), p_data_vencimento, p_observacoes, (select auth.uid()))
  returning id into v_recebimento_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.recebimento_itens (recebimento_id, oc_item_id, quantidade_recebida)
    values (v_recebimento_id, (v_item->>'oc_item_id')::uuid, (v_item->>'quantidade_recebida')::numeric);
  end loop;

  -- Total pedido x total recebido (acumulado) define o status da OC.
  select coalesce(sum(quantidade), 0) into v_total_pedido
  from public.oc_itens where ordem_compra_id = p_oc_id;

  select coalesce(sum(ri.quantidade_recebida), 0) into v_total_recebido
  from public.recebimento_itens ri
  join public.recebimentos r on r.id = ri.recebimento_id
  where r.ordem_compra_id = p_oc_id and r.status = 'registrado';

  update public.ordens_compra
  set status = case when v_total_recebido >= v_total_pedido then 'recebido' else 'recebido_parcial' end
  where id = p_oc_id;

  -- Confirma o financeiro: usa o lancamento previsto da OC no primeiro
  -- recebimento; recebimentos seguintes criam um a_pagar proprio.
  select id into v_lancamento_id
  from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id and status = 'previsto'
  order by created_at limit 1;

  if v_lancamento_id is not null then
    update public.lancamentos
    set status = 'a_pagar',
        valor = coalesce(p_valor_nf, valor),
        data_vencimento = p_data_vencimento
    where id = v_lancamento_id;
  else
    insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, data_vencimento, created_by)
    values ('a_pagar', 'oc', p_oc_id, v_fornecedor,
      'Recebimento da OC ' || coalesce(v_numero_oc, ''), coalesce(p_valor_nf, 0), 'a_pagar', p_data_vencimento, (select auth.uid()));
  end if;

  return v_recebimento_id;
end $$;

revoke all on function public.fn_registrar_recebimento(uuid, text, numeric, date, date, jsonb, text) from public, anon;
grant execute on function public.fn_registrar_recebimento(uuid, text, numeric, date, date, jsonb, text) to authenticated;

-- -------------------------------------------------------------
-- 3. nomes_usuarios_compras: nome de solicitante/aprovador de pedidos para
-- quem tem compras.pedidos ver, sem ler public.usuarios direto (a RLS de
-- usuarios so deixa o usuario ver o proprio registro).
-- -------------------------------------------------------------
create or replace function public.nomes_usuarios_compras(p_ids uuid[])
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.nome
  from public.usuarios u
  where u.id = any (p_ids)
    and public.tem_permissao('compras.pedidos', 'ver');
$$;

revoke all on function public.nomes_usuarios_compras(uuid[]) from public, anon;
grant execute on function public.nomes_usuarios_compras(uuid[]) to authenticated;
