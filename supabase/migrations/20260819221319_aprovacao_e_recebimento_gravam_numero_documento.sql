-- Aprovacao e recebimento carregam o numero do documento.
--
-- Aprovar copia o numero da OC para o lancamento que nasce dela; registrar
-- recebimento grava o numero CONFIRMADO nos tres lugares (recebimento, OC e
-- lancamento), porque o numero e um so.
--
-- Assinatura das duas continua igual: CREATE OR REPLACE preserva os grants.

create or replace function public.fn_aprovar_ordem_compra(p_oc_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_status text;
  v_fornecedor uuid;
  v_total numeric(14, 2);
  v_numero text;
  v_forma uuid;
  v_compra date;
  v_mes date;
  v_lanc_id uuid;
  v_qtd_parcelas int;
  v_soma_parcelas numeric(14, 2);
  v_descricao text;
  v_categoria uuid;
  v_numero_documento text;
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para aprovar ordens de compra';
  end if;

  select status, fornecedor_id, valor_total, numero, forma_pagamento_id,
         data_compra, mes_competencia, descricao, categoria_id, numero_documento
  into v_status, v_fornecedor, v_total, v_numero, v_forma, v_compra, v_mes,
       v_descricao, v_categoria, v_numero_documento
  from public.ordens_compra where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A ordem de compra precisa estar pendente de aprovacao';
  end if;

  if exists (
    select 1 from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where oi.ordem_compra_id = p_oc_id and i.categoria_financeira_id is null
  ) then
    raise exception 'Ha item sem categoria de custo. Classifique o insumo antes de aprovar';
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'ordem_compra', p_oc_id);

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_parcelas, v_soma_parcelas
  from public.oc_parcelas
  where ordem_compra_id = p_oc_id;

  if v_qtd_parcelas > 0 and v_soma_parcelas <> round(v_total, 2) then
    raise exception 'A soma das parcelas da ordem (R$ %) nao fecha com o total (R$ %). Ajuste as parcelas antes de aprovar.',
      v_soma_parcelas, round(v_total, 2);
  end if;

  select coalesce(
    (select i.categoria_financeira_id
     from public.oc_itens oi
     join public.insumos i on i.id = oi.insumo_id
     where oi.ordem_compra_id = p_oc_id and i.categoria_financeira_id is not null
     group by i.categoria_financeira_id
     order by sum(oi.quantidade * oi.preco_unitario) desc, i.categoria_financeira_id
     limit 1),
    v_categoria)
  into v_categoria;

  update public.ordens_compra
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now(),
      categoria_id = v_categoria
  where id = p_oc_id;

  -- O numero do documento desce junto: sem isto o lancamento nascido da OC
  -- apareceria em branco na coluna do Financeiro, e a mesma compra teria numero
  -- em Compras e nada aqui.
  insert into public.lancamentos (
    tipo, origem, origem_id, fornecedor_id, forma_pagamento_id, descricao,
    categoria_id, valor, status, data_compra, mes_competencia,
    numero_documento, created_by
  )
  values (
    'a_pagar', 'oc', p_oc_id, v_fornecedor, v_forma,
    coalesce(
      nullif(btrim(coalesce(v_descricao, '')), ''),
      'Ordem de compra ' || coalesce(v_numero, '')
    ),
    v_categoria,
    v_total, 'previsto', v_compra, v_mes,
    v_numero_documento, (select auth.uid())
  )
  returning id into v_lanc_id;

  if v_qtd_parcelas > 0 then
    insert into public.lancamento_parcelas (
      lancamento_id, numero_parcela, valor, data_vencimento, status, created_by
    )
    select v_lanc_id, p.numero_parcela, p.valor, p.data_vencimento, 'pendente', (select auth.uid())
    from public.oc_parcelas p
    where p.ordem_compra_id = p_oc_id
    order by p.numero_parcela;

    update public.lancamentos
    set data_vencimento = (
      select min(p.data_vencimento) from public.oc_parcelas p
      where p.ordem_compra_id = p_oc_id
    )
    where id = v_lanc_id;
  end if;

  with fatia as (
    select oi.centro_custo_id,
           i.categoria_financeira_id as categoria_id,
           round(sum(oi.quantidade * oi.preco_unitario), 2) as bruto
    from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where oi.ordem_compra_id = p_oc_id
    group by oi.centro_custo_id, i.categoria_financeira_id
  ),
  base as (select coalesce(sum(bruto), 0) as total_itens from fatia),
  proporcional as (
    select f.centro_custo_id, f.categoria_id,
           case when b.total_itens = 0 then 0
                else round(f.bruto * v_total / b.total_itens, 2) end as valor,
           row_number() over (order by f.bruto desc, f.centro_custo_id) as ordem
    from fatia f cross join base b
  ),
  resto as (select v_total - coalesce(sum(valor), 0) as sobra from proporcional)
  insert into public.lancamento_rateios
    (lancamento_id, centro_custo_id, categoria_id, valor, created_by)
  select v_lanc_id, p.centro_custo_id, p.categoria_id,
         p.valor + case when p.ordem = 1 then (select sobra from resto) else 0 end,
         (select auth.uid())
  from proporcional p;

  perform public.fn_propagar_anexos('ordem_compra', p_oc_id, 'lancamento', v_lanc_id);

  perform public.fn_aplicar_regra_pagamento(v_lanc_id);
end;
$function$;

create or replace function public.fn_registrar_recebimento(p_oc_id uuid, p_numero_nf text, p_valor_nf numeric, p_data_recebimento date)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_status text;
  v_condicao_id uuid;
  v_valor_total numeric;
  v_tolerancia numeric;
  v_numero_nf text;
  v_lanc_id uuid;
  v_status_lanc text;
  v_qtd_parcelas int;
  v_soma_parcelas numeric(14, 2);
  v_parcela_id uuid;
  v_valor_parcela numeric(14, 2);
  v_diferenca numeric(14, 2);
  v_divergencia numeric(14, 2);
  v_tudo_pago boolean;
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para registrar recebimento de ordens de compra';
  end if;

  v_numero_nf := btrim(p_numero_nf);
  if coalesce(v_numero_nf, '') = '' then
    raise exception 'Informe o numero do documento';
  end if;
  if p_valor_nf is null or p_valor_nf <= 0 then
    raise exception 'Informe um valor de nota fiscal maior que zero';
  end if;
  if p_data_recebimento is null then
    raise exception 'Informe a data do recebimento';
  end if;

  select status, condicao_pagamento_id, valor_total
  into v_status, v_condicao_id, v_valor_total
  from public.ordens_compra
  where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'aprovado' then
    raise exception 'So da para registrar recebimento de uma ordem de compra aprovada';
  end if;
  if v_condicao_id is null then
    raise exception 'Ordem de compra sem condicao de pagamento definida';
  end if;

  select coalesce((valor #>> '{}')::numeric, 0) into v_tolerancia
  from public.configuracoes
  where chave = 'tolerancia_divergencia_nf_percentual';

  if v_valor_total is not null and v_valor_total > 0 then
    if abs(p_valor_nf - v_valor_total) > v_valor_total * (coalesce(v_tolerancia, 0) / 100.0) then
      raise exception 'A nota fiscal (R$ %) diverge do total da ordem de compra (R$ %) acima da tolerancia permitida (% por cento).',
        round(p_valor_nf, 2), round(v_valor_total, 2), coalesce(v_tolerancia, 0);
    end if;
  end if;

  if exists (select 1 from public.recebimentos where ordem_compra_id = p_oc_id) then
    raise exception 'Esta ordem de compra ja tem recebimento registrado';
  end if;

  select id, status into v_lanc_id, v_status_lanc
  from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id and status <> 'cancelado'
  order by created_at desc
  limit 1;

  if v_lanc_id is null then
    raise exception 'Lancamento desta ordem de compra nao encontrado';
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_parcelas, v_soma_parcelas
  from public.lancamento_parcelas
  where lancamento_id = v_lanc_id;

  if v_qtd_parcelas = 0 then
    update public.lancamentos set valor = p_valor_nf where id = v_lanc_id;

  elsif v_soma_parcelas <> round(p_valor_nf, 2) then
    select id, valor into v_parcela_id, v_valor_parcela
    from public.lancamento_parcelas
    where lancamento_id = v_lanc_id and status = 'pendente'
    order by numero_parcela desc
    limit 1;

    if v_parcela_id is null then
      v_divergencia := round(p_valor_nf, 2) - v_soma_parcelas;
    else
      v_diferenca := round(p_valor_nf, 2) - v_soma_parcelas;

      if round(v_valor_parcela + v_diferenca, 2) <= 0 then
        raise exception 'A diferenca da nota fiscal (R$ %) zeraria a ultima parcela em aberto (R$ %). Ajuste as parcelas antes de registrar o recebimento.',
          v_diferenca, v_valor_parcela;
      end if;

      update public.lancamento_parcelas
      set valor = round(v_valor_parcela + v_diferenca, 2)
      where id = v_parcela_id;

      update public.lancamentos set valor = p_valor_nf where id = v_lanc_id;
    end if;
  end if;

  update public.lancamentos
  set data_vencimento = (
    select min(lp.data_vencimento)
    from public.lancamento_parcelas lp
    where lp.lancamento_id = v_lanc_id
  )
  where id = v_lanc_id;

  insert into public.recebimentos (
    ordem_compra_id, lancamento_id, numero_nf, valor_nf, data_recebimento,
    divergencia_valor, created_by
  )
  values (
    p_oc_id, v_lanc_id, v_numero_nf, p_valor_nf, p_data_recebimento,
    nullif(v_divergencia, 0), (select auth.uid())
  );

  -- O numero confirmado aqui manda: se a OC foi digitada com o numero do pedido
  -- e a nota chegou com outro, quem vale e o da nota. Um numero so, nos tres
  -- lugares (recebimento, OC e lancamento), nunca dois divergindo.
  update public.ordens_compra
  set status = 'recebido', numero_documento = v_numero_nf
  where id = p_oc_id;

  update public.lancamentos
  set numero_documento = v_numero_nf
  where id = v_lanc_id;

  if v_status_lanc = 'previsto' then
    perform public.fn_aplicar_regra_pagamento(v_lanc_id);
  end if;

  select v_qtd_parcelas > 0 and not exists (
    select 1 from public.lancamento_parcelas
    where lancamento_id = v_lanc_id and status <> 'pago'
  )
  into v_tudo_pago;

  if v_tudo_pago then
    update public.ordens_compra set status = 'pago' where id = p_oc_id;
  end if;
end;
$function$;
