-- A aprovacao da OC passa a criar o BLOCO de forma do lancamento.
--
-- Sem isto, lancamento nascido de OC ficava com a forma no cabecalho e sem
-- bloco, e a invariante "tem forma no cabecalho <=> tem bloco" nao valia. Quem
-- pagava o preco era a aba "Pagamentos diretos": ela filtra pelo TIPO da forma,
-- e num lancamento multi-forma o cabecalho e nulo -- o join obrigatorio com a
-- forma do cabecalho descartava o documento inteiro e a parte em dinheiro dele
-- nunca aparecia, calada. Com o bloco sempre presente, o filtro pode olhar o
-- bloco de cada parcela, que e onde a forma realmente mora agora.
--
-- A OC continua com UMA forma (dividir a OC entre formas e o bloco 2): ela desce
-- como um bloco unico, com o total.
--
-- So tres coisas mudaram na funcao: a variavel v_bloco, o insert do bloco depois
-- do lancamento, e o lancamento_forma_id no insert das parcelas. O resto e igual.

-- Backfill dos que nasceram na janela entre a migration da estrutura e esta.
insert into public.lancamento_formas (lancamento_id, forma_pagamento_id, valor, created_by)
select l.id, l.forma_pagamento_id, l.valor, l.created_by
from public.lancamentos l
where l.forma_pagamento_id is not null
  and not exists (
    select 1 from public.lancamento_formas lf where lf.lancamento_id = l.id
  );

update public.lancamento_parcelas p
set lancamento_forma_id = lf.id
from public.lancamento_formas lf
where lf.lancamento_id = p.lancamento_id
  and p.lancamento_forma_id is null;

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
  v_bloco uuid;
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

  -- O BLOCO de forma. A OC tem uma forma so, entao desce um bloco com o total.
  -- Sem forma na OC nao ha bloco (o lancamento roteia como bancario, pelo
  -- caminho antigo), que e o mesmo comportamento de antes.
  if v_forma is not null then
    insert into public.lancamento_formas
      (lancamento_id, forma_pagamento_id, valor, created_by)
    values (v_lanc_id, v_forma, v_total, (select auth.uid()))
    returning id into v_bloco;
  end if;

  if v_qtd_parcelas > 0 then
    insert into public.lancamento_parcelas (
      lancamento_id, numero_parcela, valor, data_vencimento, status,
      lancamento_forma_id, created_by
    )
    select v_lanc_id, p.numero_parcela, p.valor, p.data_vencimento, 'pendente',
           v_bloco, (select auth.uid())
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
