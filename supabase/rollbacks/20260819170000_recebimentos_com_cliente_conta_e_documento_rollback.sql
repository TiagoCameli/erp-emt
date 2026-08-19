-- Rollback de 20260819170000_recebimentos_com_cliente_conta_e_documento.sql
--
-- Volta o recurso para financeiro.contas-receber, restaura as policies e as duas
-- funcoes como estavam, e derruba a coluna cliente_id e a funcao de apoio.
--
-- Perda de dado assumida: cliente_id vai embora com a coluna. Na data da
-- migration nao existia nenhum lancamento a_receber, entao rodar este rollback
-- logo depois nao perde nada; rodar depois de recebimentos lancados apaga quem
-- pagou (o resto do recebimento, incluindo numero de documento e conta,
-- permanece).

-- 1. Recurso volta ao nome antigo
update public.usuario_permissoes
set recurso = 'financeiro.contas-receber'
where recurso = 'financeiro.recebimentos';

update public.perfil_permissoes
set recurso = 'financeiro.contas-receber'
where recurso = 'financeiro.recebimentos';

-- 2. Policies como estavam

drop policy if exists lancamentos_select on public.lancamentos;
create policy lancamentos_select on public.lancamentos
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.contas-receber', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or (
      (select public.tem_permissao('rh.folha', 'ver'))
      and origem = any (array['folha', 'folha_guia'])
    )
    or (
      (select public.tem_permissao('rh.adiantamentos', 'ver'))
      and origem = 'adiantamento'
    )
  );

drop policy if exists lancamento_parcelas_select on public.lancamento_parcelas;
create policy lancamento_parcelas_select on public.lancamento_parcelas
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.contas-receber', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or (
      (select public.tem_permissao('rh.folha', 'ver'))
      and exists (
        select 1 from public.lancamentos l
        where l.id = lancamento_parcelas.lancamento_id
          and l.origem = any (array['folha', 'folha_guia'])
      )
    )
    or (
      (select public.tem_permissao('rh.adiantamentos', 'ver'))
      and exists (
        select 1 from public.lancamentos l
        where l.id = lancamento_parcelas.lancamento_id
          and l.origem = 'adiantamento'
      )
    )
  );

drop policy if exists fornecedores_select on public.fornecedores;
create policy fornecedores_select on public.fornecedores
  for select
  using (
    (select public.tem_permissao('cadastros.fornecedores', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or (select public.tem_permissao('compras.cotacoes', 'ver'))
    or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.contas-receber', 'ver'))
  );

drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes
  for select to authenticated
  using ((select public.tem_permissao('cadastros.clientes', 'ver')));

drop policy if exists contas_bancarias_select on public.contas_bancarias;
create policy contas_bancarias_select on public.contas_bancarias
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.contas-bancarias', 'ver'))
    or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
  );

drop policy if exists centros_custo_select on public.centros_custo;
create policy centros_custo_select on public.centros_custo
  for select
  using (
    (select public.tem_permissao('cadastros.centros-custo', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or (select public.tem_permissao('compras.cotacoes', 'ver'))
    or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('rh.folha', 'ver'))
    or (select public.tem_permissao('cadastros.colaboradores', 'ver'))
  );

drop policy if exists categorias_financeiras_select on public.categorias_financeiras;
create policy categorias_financeiras_select on public.categorias_financeiras
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.categorias', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or (select public.tem_permissao('compras.cotacoes', 'ver'))
  );

drop policy if exists condicoes_pagamento_select on public.condicoes_pagamento;
create policy condicoes_pagamento_select on public.condicoes_pagamento
  for select to authenticated
  using (
    (select public.tem_permissao('compras.ordens', 'ver'))
    or (select public.tem_permissao('compras.cotacoes', 'ver'))
    or (select public.tem_permissao('cadastros.condicoes-pagamento', 'ver'))
  );

drop policy if exists lancamento_rateios_select on public.lancamento_rateios;
create policy lancamento_rateios_select on public.lancamento_rateios
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
  );

-- 3. fn_salvar_lancamento como estava (sem cliente, sem conta de destino, sem
--    numero de documento obrigatorio e exigindo financeiro.lancamentos)

create or replace function public.fn_salvar_lancamento(
  p_id uuid, p_dados jsonb, p_parcelas jsonb, p_rateios jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid := p_id; v_acao text; v_valor numeric(14,2);
  v_soma_parc numeric(14,2); v_soma_rat numeric(14,2); v_origem text; r jsonb;
  v_compra date; v_mes date; v_mes_atual date;
  v_numero_documento text;
begin
  v_acao := case when p_id is null then 'criar' else 'editar' end;
  if not public.tem_permissao('financeiro.lancamentos', v_acao) then
    raise exception 'Sem permissao para % lancamentos', v_acao;
  end if;

  v_valor := (p_dados->>'valor')::numeric;
  if v_valor is null or v_valor < 0 then raise exception 'Valor invalido'; end if;

  v_numero_documento := nullif(btrim(p_dados->>'numero_documento'), '');

  v_compra := nullif(p_dados->>'data_compra','')::date;
  if v_compra is null then
    raise exception 'Informe a data da compra ou do documento';
  end if;
  v_mes := date_trunc('month', coalesce(nullif(p_dados->>'mes_competencia','')::date, v_compra))::date;

  select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_parc from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;
  if v_soma_parc <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_parc, v_valor;
  end if;
  if jsonb_array_length(coalesce(p_rateios,'[]'::jsonb)) = 0 then
    raise exception 'Escolha o centro de custo: nenhum custo existe sem centro de custo';
  end if;
  if true then
    select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_rat from jsonb_array_elements(p_rateios) x;
    if v_soma_rat <> round(v_valor, 2) then
      raise exception 'A soma do rateio (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_rat, v_valor;
    end if;
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_id);

  if v_acao = 'criar' then
    insert into public.lancamentos (tipo, origem, fornecedor_id, categoria_id, forma_pagamento_id, condicao_pagamento_id, descricao, observacoes, valor, status, data_compra, mes_competencia, data_vencimento, numero_documento, created_by)
    values (
      coalesce(p_dados->>'tipo','a_pagar'), 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid, nullif(p_dados->>'categoria_id','')::uuid,
      nullif(p_dados->>'forma_pagamento_id','')::uuid,
      nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      p_dados->>'descricao', nullif(btrim(p_dados->>'observacoes'),''), v_valor, 'a_pagar',
      v_compra, v_mes, nullif(p_dados->>'data_vencimento','')::date, v_numero_documento, (select auth.uid())
    ) returning id into v_id;
  else
    select origem, mes_competencia into v_origem, v_mes_atual
    from public.lancamentos where id = v_id;
    if v_origem is null then raise exception 'Lancamento nao encontrado'; end if;
    if v_origem <> 'manual' then
      raise exception 'Lancamento de origem % e somente-leitura aqui. Edite na origem.', v_origem;
    end if;
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'pago') then
      raise exception 'Nao da para editar um lancamento com parcela ja paga';
    end if;
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'aprovado') then
      raise exception 'Nao da para editar um lancamento com pagamento aprovado. Desaprove o pagamento em Financeiro > Aprovacao de pagamentos, edite e aprove de novo.';
    end if;
    if exists (
      select 1 from public.lancamento_parcelas
      where lancamento_id = v_id and status in ('aprovado', 'pago')
    ) and v_mes_atual <> v_mes then
      raise exception 'O mes de referencia nao muda com pagamento aprovado ou pago. Desaprove ou estorne o pagamento antes.';
    end if;
    perform public.fn_exigir_competencia_aberta(v_mes_atual, 'lancamento', v_id);
    update public.lancamentos set
      tipo = coalesce(p_dados->>'tipo', tipo),
      fornecedor_id = nullif(p_dados->>'fornecedor_id','')::uuid,
      categoria_id = nullif(p_dados->>'categoria_id','')::uuid,
      forma_pagamento_id = nullif(p_dados->>'forma_pagamento_id','')::uuid,
      condicao_pagamento_id = nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      descricao = p_dados->>'descricao', valor = v_valor,
      observacoes = nullif(btrim(p_dados->>'observacoes'),''),
      data_compra = v_compra,
      mes_competencia = v_mes,
      data_vencimento = nullif(p_dados->>'data_vencimento','')::date,
      numero_documento = v_numero_documento
    where id = v_id;
    delete from public.lancamento_parcelas where lancamento_id = v_id;
    delete from public.lancamento_rateios where lancamento_id = v_id;
  end if;

  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  select
    v_id,
    row_number() over (
      order by nullif(x->>'data_vencimento','')::date nulls last, x->>'valor'
    )::smallint,
    (x->>'valor')::numeric,
    nullif(x->>'data_vencimento','')::date,
    'pendente',
    (select auth.uid())
  from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;

  for r in select * from jsonb_array_elements(coalesce(p_rateios,'[]'::jsonb)) loop
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_id, (r->>'centro_custo_id')::uuid, (r->>'valor')::numeric, (select auth.uid()));
  end loop;

  perform public.fn_aplicar_regra_pagamento(v_id);

  return v_id;
end;
$function$;

-- 4. fn_pagar_parcela com a chave antiga do recurso

create or replace function public.fn_pagar_parcela(
  p_parcela_id uuid, p_conta_id uuid, p_data_pagamento date,
  p_desconto numeric default 0, p_juros numeric default 0, p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
  v_programada date; v_janela text; v_data_informada date; v_status_lanc text;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_desconto numeric(14, 2);
  v_juros numeric(14, 2);
  v_liquido numeric(14, 2);
begin
  select p.status, p.lancamento_id, l.tipo, p.valor, p.data_programada, l.status
  into v_status, v_lanc, v_tipo, v_valor, v_programada, v_status_lanc
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.id = p_parcela_id;

  if v_status is null then raise exception 'Parcela nao encontrada'; end if;

  if v_status_lanc = 'cancelado' then
    raise exception 'Este lancamento esta cancelado: nao da para pagar esta parcela';
  end if;

  v_data_informada := coalesce(p_data_pagamento, v_hoje);

  if v_data_informada > v_hoje then
    raise exception 'A data do pagamento nao pode ser no futuro (hoje e %).',
      to_char(v_hoje, 'DD/MM/YYYY');
  end if;

  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then
      raise exception 'Sem permissao para registrar pagamentos';
    end if;
    if v_status = 'em_revisao' then
      raise exception 'Esta parcela esta em revisao: ela precisa ser reenviada e aprovada antes de pagar';
    end if;
    if v_status <> 'aprovado' then
      raise exception 'A parcela precisa estar aprovada para pagamento';
    end if;

    if v_programada is null then
      raise exception 'Esta parcela esta aprovada sem data programada: reprograme a data antes de pagar';
    end if;

    v_janela := public.fn_janela_pagamento();

    if v_data_informada <> v_programada then
      if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Este pagamento esta fora da data autorizada (%): informe o motivo.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if not public.tem_permissao('financeiro.contas-receber', 'editar') then
      raise exception 'Sem permissao para baixar recebimentos';
    end if;
    if v_status not in ('pendente', 'aprovado') then
      raise exception 'Parcela ja baixada ou cancelada';
    end if;
  end if;

  v_desconto := round(coalesce(p_desconto, 0), 2);
  v_juros := round(coalesce(p_juros, 0), 2);

  if v_desconto < 0 then
    raise exception 'O desconto nao pode ser negativo.';
  end if;

  if v_juros < 0 then
    raise exception 'Os juros nao podem ser negativos.';
  end if;

  if v_desconto > v_valor then
    raise exception 'O desconto (R$ %) nao pode ser maior que o valor da parcela (R$ %).',
      round(v_desconto, 2), round(v_valor, 2);
  end if;

  v_liquido := round(v_valor - v_desconto + v_juros, 2);

  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  if v_tipo = 'a_pagar' then
    select c.saldo_inicial
      + coalesce(sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end), 0)
    into v_saldo
    from public.contas_bancarias c
    left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
    left join public.lancamentos l on l.id = p.lancamento_id
    where c.id = p_conta_id
    group by c.saldo_inicial;

    if coalesce(v_saldo, 0) - v_liquido < 0 then
      raise exception 'Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.',
        round(coalesce(v_saldo, 0), 2), round(v_liquido, 2);
    end if;
  end if;

  update public.lancamento_parcelas
  set status = 'pago', conta_bancaria_id = p_conta_id,
      data_pagamento = v_data_informada,
      desconto = v_desconto,
      juros = v_juros,
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  if v_tipo = 'a_pagar' and v_data_informada <> v_programada then
    insert into public.parcela_eventos
      (parcela_id, tipo, motivo, data_de, data_para, created_by)
    values
      (p_parcela_id, 'pagou_fora_da_janela', btrim(p_motivo),
       v_programada, v_data_informada, (select auth.uid()));
  end if;

  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end;
$function$;

-- 5. Coluna e funcao de apoio

drop index if exists public.idx_lancamentos_cliente_id;
alter table public.lancamentos drop column if exists cliente_id;
drop function if exists public.fn_pode_lancar_tipo(text, text);
