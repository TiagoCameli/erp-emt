-- Exclusão de registros transacionais, gated por dependência (regra do Tiago):
-- só exclui se nada "rio abaixo" na cadeia (pedido>cotacao>OC>recebimento>
-- lancamento>pagamento>conciliacao) estiver usando a informação. Excluir
-- apaga o registro + os sub-itens dele (cascade das FKs); as FKs RESTRICT
-- rio abaixo são a rede de segurança, e aqui damos a mensagem amigável.
-- Apaga de vez (decisão do Tiago). Pagamento pago é ESTORNADO (volta ao saldo).

-- Cotação: travada se já gerou uma OC. Cascateia itens + fornecedores.
create or replace function public.fn_excluir_cotacao(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.tem_permissao('compras.cotacoes', 'excluir') then
    raise exception 'Sem permissao para excluir cotacoes';
  end if;
  if exists (select 1 from public.ordens_compra o where o.cotacao_id = p_id) then
    raise exception 'Nao da para excluir: existe uma ordem de compra gerada desta cotacao';
  end if;
  delete from public.cotacoes where id = p_id;
end $$;
revoke all on function public.fn_excluir_cotacao(uuid) from public, anon;
grant execute on function public.fn_excluir_cotacao(uuid) to authenticated;

-- Ordem de compra: travada se tem recebimento, ou se o lancamento dela tem
-- parcela paga/conciliada. Livre: apaga OC + itens + o lancamento previsto dela.
create or replace function public.fn_excluir_ordem_compra(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_lanc uuid;
begin
  if not public.tem_permissao('compras.ordens', 'excluir') then
    raise exception 'Sem permissao para excluir ordens de compra';
  end if;
  if exists (select 1 from public.recebimentos r where r.ordem_compra_id = p_id) then
    raise exception 'Nao da para excluir: esta ordem de compra ja tem recebimento registrado';
  end if;
  select id into v_lanc from public.lancamentos
    where origem = 'oc' and origem_id = p_id limit 1;
  if v_lanc is not null then
    if exists (select 1 from public.lancamento_parcelas p where p.lancamento_id = v_lanc and p.status = 'pago') then
      raise exception 'Nao da para excluir: o lancamento desta ordem ja tem parcela paga';
    end if;
    if exists (
      select 1 from public.extrato_transacoes t
      join public.lancamento_parcelas p on p.id = t.parcela_id
      where p.lancamento_id = v_lanc
    ) then
      raise exception 'Nao da para excluir: o lancamento desta ordem tem parcela conciliada';
    end if;
    delete from public.lancamentos where id = v_lanc;
  end if;
  delete from public.ordens_compra where id = p_id;
end $$;
revoke all on function public.fn_excluir_ordem_compra(uuid) from public, anon;
grant execute on function public.fn_excluir_ordem_compra(uuid) to authenticated;

-- Lançamento: travado se veio de recebimento (OC) ou diaria, ou se tem parcela
-- paga/conciliada. Livre: apaga lancamento + parcelas + rateios (cascade).
create or replace function public.fn_excluir_lancamento(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_origem text;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'excluir') then
    raise exception 'Sem permissao para excluir lancamentos';
  end if;
  select origem into v_origem from public.lancamentos where id = p_id;
  if v_origem is null then raise exception 'Lancamento nao encontrado'; end if;
  -- Lancamento gerado por outra area sai pela origem, pra nao deixar orfa.
  if v_origem = 'oc' then
    raise exception 'Nao da para excluir aqui: este lancamento e de uma ordem de compra. Exclua pela ordem de compra';
  end if;
  if v_origem = 'diaria' then
    raise exception 'Nao da para excluir aqui: este lancamento veio de uma diaria. Exclua pela diaria';
  end if;
  if exists (select 1 from public.lancamento_parcelas p where p.lancamento_id = p_id and p.status = 'pago') then
    raise exception 'Nao da para excluir: este lancamento ja tem parcela paga';
  end if;
  if exists (
    select 1 from public.extrato_transacoes t
    join public.lancamento_parcelas p on p.id = t.parcela_id
    where p.lancamento_id = p_id
  ) then
    raise exception 'Nao da para excluir: este lancamento tem parcela conciliada';
  end if;
  delete from public.lancamentos where id = p_id;
end $$;
revoke all on function public.fn_excluir_lancamento(uuid) from public, anon;
grant execute on function public.fn_excluir_lancamento(uuid) to authenticated;

-- Pagamento: ESTORNA a parcela paga (volta ao estado anterior; o saldo, que e
-- derivado, se restaura sozinho). Travado se conciliado.
create or replace function public.fn_estornar_pagamento(p_parcela_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_lanc uuid; v_tipo text;
begin
  if not public.tem_permissao('financeiro.pagamentos', 'excluir') then
    raise exception 'Sem permissao para estornar pagamentos';
  end if;
  select p.status, p.lancamento_id, l.tipo into v_status, v_lanc, v_tipo
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_status <> 'pago' then raise exception 'Esta parcela nao esta paga'; end if;
  if exists (select 1 from public.extrato_transacoes t where t.parcela_id = p_parcela_id) then
    raise exception 'Nao da para estornar: este pagamento esta conciliado. Desfaca a conciliacao primeiro';
  end if;
  update public.lancamento_parcelas
    set status = case when v_tipo = 'a_pagar' then 'aprovado' else 'pendente' end,
        conta_bancaria_id = null, data_pagamento = null, pago_por = null, pago_em = null
    where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);
end $$;
revoke all on function public.fn_estornar_pagamento(uuid) from public, anon;
grant execute on function public.fn_estornar_pagamento(uuid) to authenticated;

-- Agendamento: tira a programacao da parcela (nao apaga a parcela). Travado se paga.
create or replace function public.fn_cancelar_programacao(p_parcela_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.tem_permissao('financeiro.programados', 'editar') then
    raise exception 'Sem permissao para cancelar programacao';
  end if;
  select status into v_status from public.lancamento_parcelas where id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_status = 'pago' then raise exception 'Nao da para cancelar: esta parcela ja foi paga'; end if;
  update public.lancamento_parcelas set data_programada = null where id = p_parcela_id;
end $$;
revoke all on function public.fn_cancelar_programacao(uuid) from public, anon;
grant execute on function public.fn_cancelar_programacao(uuid) to authenticated;
