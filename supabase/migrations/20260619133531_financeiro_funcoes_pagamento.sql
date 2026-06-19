-- =============================================================
-- Fase 3 / Migration 22: funcoes do nucleo financeiro (pagamento)
-- Toda escrita de lancamento/parcela/rateio passa por funcao definer
-- que checa tem_permissao por dentro. authenticated so tem SELECT nas
-- tabelas (grants na 21); mutacao e exclusivamente por estas RPCs.
--
-- - fn_salvar_lancamento: cria/edita lancamento manual + parcelas + rateios,
--   validando soma das parcelas = valor e soma do rateio = valor.
-- - fn_aprovar_parcela / fn_desaprovar_parcela: ciclo de aprovacao da parcela.
-- - fn_pagar_parcela: baixa (a_pagar exige aprovado; a_receber baixa direto).
-- - fn_recalcular_status_lancamento: deriva o status do lancamento das parcelas.
-- =============================================================

create or replace function public.fn_salvar_lancamento(p_id uuid, p_dados jsonb, p_parcelas jsonb, p_rateios jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id; v_acao text; v_valor numeric(14,2);
  v_soma_parc numeric(14,2); v_soma_rat numeric(14,2); p jsonb; r jsonb;
begin
  v_acao := case when p_id is null then 'criar' else 'editar' end;
  if not public.tem_permissao('financeiro.lancamentos', v_acao) then
    raise exception 'Sem permissao para % lancamentos', v_acao;
  end if;

  v_valor := (p_dados->>'valor')::numeric;
  if v_valor is null or v_valor < 0 then raise exception 'Valor invalido'; end if;

  select coalesce(sum((x->>'valor')::numeric), 0) into v_soma_parc from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;
  if round(v_soma_parc, 2) <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_parc, v_valor;
  end if;
  select coalesce(sum((x->>'valor')::numeric), 0) into v_soma_rat from jsonb_array_elements(coalesce(p_rateios,'[]'::jsonb)) x;
  if round(v_soma_rat, 2) <> round(v_valor, 2) then
    raise exception 'A soma do rateio (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_rat, v_valor;
  end if;

  if v_acao = 'criar' then
    insert into public.lancamentos (tipo, origem, fornecedor_id, categoria_id, descricao, valor, status, competencia, data_vencimento, created_by)
    values (
      coalesce(p_dados->>'tipo','a_pagar'), 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid, nullif(p_dados->>'categoria_id','')::uuid,
      p_dados->>'descricao', v_valor, 'a_pagar',
      nullif(p_dados->>'competencia','')::date, nullif(p_dados->>'data_vencimento','')::date, (select auth.uid())
    ) returning id into v_id;
  else
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'pago') then
      raise exception 'Nao da para editar um lancamento com parcela ja paga';
    end if;
    update public.lancamentos set
      tipo = coalesce(p_dados->>'tipo', tipo),
      fornecedor_id = nullif(p_dados->>'fornecedor_id','')::uuid,
      categoria_id = nullif(p_dados->>'categoria_id','')::uuid,
      descricao = p_dados->>'descricao', valor = v_valor,
      competencia = nullif(p_dados->>'competencia','')::date,
      data_vencimento = nullif(p_dados->>'data_vencimento','')::date
    where id = v_id;
    delete from public.lancamento_parcelas where lancamento_id = v_id;
    delete from public.lancamento_rateios where lancamento_id = v_id;
  end if;

  for p in select * from jsonb_array_elements(p_parcelas) loop
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_id, coalesce((p->>'numero_parcela')::smallint, 1), (p->>'valor')::numeric, nullif(p->>'data_vencimento','')::date, 'pendente', (select auth.uid()));
  end loop;
  for r in select * from jsonb_array_elements(p_rateios) loop
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_id, (r->>'centro_custo_id')::uuid, (r->>'valor')::numeric, (select auth.uid()));
  end loop;

  return v_id;
end $$;

create or replace function public.fn_recalcular_status_lancamento(p_lanc_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_total int; v_pagas int; v_canceladas int;
begin
  select count(*), count(*) filter (where status = 'pago'), count(*) filter (where status = 'cancelado')
  into v_total, v_pagas, v_canceladas
  from public.lancamento_parcelas where lancamento_id = p_lanc_id;
  if v_total = 0 then return; end if;
  if v_pagas + v_canceladas = v_total and v_pagas > 0 then
    update public.lancamentos set status = 'pago' where id = p_lanc_id and status <> 'cancelado';
  elsif v_canceladas = v_total then
    update public.lancamentos set status = 'cancelado' where id = p_lanc_id;
  else
    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id and status in ('previsto', 'pago');
  end if;
end $$;

create or replace function public.fn_aprovar_parcela(p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar') then raise exception 'Sem permissao para aprovar pagamentos'; end if;
  select status into v_status from public.lancamento_parcelas where id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_status <> 'pendente' then raise exception 'So da para aprovar uma parcela pendente'; end if;
  update public.lancamento_parcelas set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now() where id = p_parcela_id;
end $$;

create or replace function public.fn_desaprovar_parcela(p_parcela_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'desaprovar') then raise exception 'Sem permissao para desaprovar pagamentos'; end if;
  if coalesce(btrim(p_motivo),'') = '' then raise exception 'Informe o motivo'; end if;
  select status into v_status from public.lancamento_parcelas where id = p_parcela_id;
  if v_status <> 'aprovado' then raise exception 'So da para desaprovar uma parcela aprovada e ainda nao paga'; end if;
  update public.lancamento_parcelas set status = 'pendente', aprovado_por = null, aprovado_em = null where id = p_parcela_id;
end $$;

create or replace function public.fn_pagar_parcela(p_parcela_id uuid, p_conta_id uuid, p_data_pagamento date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text; v_lanc uuid; v_tipo text;
begin
  select p.status, p.lancamento_id, l.tipo into v_status, v_lanc, v_tipo
  from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  -- a pagar exige aprovacao previa; a receber baixa direto pela aba de contas a receber
  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then raise exception 'Sem permissao para registrar pagamentos'; end if;
    if v_status <> 'aprovado' then raise exception 'A parcela precisa estar aprovada para pagamento'; end if;
  else
    if not public.tem_permissao('financeiro.contas-receber', 'editar') then raise exception 'Sem permissao para baixar recebimentos'; end if;
    if v_status not in ('pendente','aprovado') then raise exception 'Parcela ja baixada ou cancelada'; end if;
  end if;
  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;
  update public.lancamento_parcelas
  set status = 'pago', conta_bancaria_id = p_conta_id,
      data_pagamento = coalesce(p_data_pagamento, (now() at time zone 'America/Rio_Branco')::date),
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);
end $$;
