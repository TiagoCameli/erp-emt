-- Bloco 2, parte C: a aprovacao da OC desce a divisao por forma para o lancamento.
--
-- Antes desta migration a funcao criava UM bloco a partir da forma do cabecalho
-- da OC. Agora ela copia os blocos de oc_formas, e cada parcela do lancamento
-- nasce apontando para o bloco equivalente ao da parcela da ordem.
--
-- A ligacao entre os dois lados e o `forma_pagamento_id`, nao o id do bloco:
-- (lancamento_id, forma_pagamento_id) e unico, entao o join e exato e nao precisa
-- de tabela de mapeamento.
--
-- E a APROVACAO e o portao das somas. A OC nao tem trava continua (o valor_total
-- e derivado dos itens), entao e aqui que a conferencia tem de acontecer -- antes
-- de virar lancamento e entrar na fila de aprovacao de pagamento.

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
  v_qtd_formas int;
  v_soma_formas numeric(14, 2);
  v_falta text;
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

  -- O portao das formas. Como a OC nao tem trava continua (o total vem dos
  -- itens), uma edicao de item depois de declarar as formas pode ter deixado a
  -- divisao torta -- e e aqui, antes de virar lancamento, que isso tem de
  -- aparecer. Sem esta conferencia, a trava do lancamento estouraria no meio da
  -- aprovacao com uma mensagem que fala de lancamento para quem aprovou uma OC.
  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_formas, v_soma_formas
  from public.oc_formas
  where ordem_compra_id = p_oc_id;

  if v_qtd_formas > 0 then
    if v_soma_formas <> round(v_total, 2) then
      raise exception 'A soma das formas de pagamento (R$ %) nao fecha com o total da ordem (R$ %). Ajuste a divisao antes de aprovar.',
        v_soma_formas, round(v_total, 2);
    end if;

    if v_qtd_parcelas > 0 then
      if exists (
        select 1 from public.oc_parcelas
        where ordem_compra_id = p_oc_id and oc_forma_id is null
      ) then
        raise exception 'Ha parcela da ordem sem forma de pagamento. Diga por qual forma cada parcela sai antes de aprovar.';
      end if;

      select string_agg(
               f.nome||' (parcelas R$ '||to_char(t.soma,'FM999999999990.00')||
               ' contra R$ '||to_char(t.valor,'FM999999999990.00')||')', '; ')
      into v_falta
      from (
        select ofo.id, ofo.forma_pagamento_id, ofo.valor,
               coalesce((
                 select sum(p.valor) from public.oc_parcelas p
                 where p.oc_forma_id = ofo.id
               ), 0) as soma
        from public.oc_formas ofo
        where ofo.ordem_compra_id = p_oc_id
      ) t
      join public.formas_pagamento f on f.id = t.forma_pagamento_id
      where round(t.soma, 2) <> round(t.valor, 2);

      if v_falta is not null then
        raise exception 'As parcelas de cada forma tem que fechar com o valor dela: %', v_falta;
      end if;
    end if;
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

  -- O cabecalho do lancamento herda o da OC: com uma forma so ele guarda ela,
  -- com varias a OC ja o deixou nulo (fn_salvar_parcelas_oc cuida disso), e o
  -- lancamento nasce nulo tambem. Nao existe "a forma" de um documento pago por
  -- duas.
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

  -- Os blocos descem da ordem. Quando a OC nao tem bloco (ordem antiga, ou sem
  -- forma declarada) mas tem forma no cabecalho, nasce um bloco com o total:
  -- e o que mantem a invariante "tem forma no cabecalho <=> tem bloco", da qual
  -- o filtro da aba de pagamentos diretos depende.
  if v_qtd_formas > 0 then
    insert into public.lancamento_formas
      (lancamento_id, forma_pagamento_id, valor, created_by)
    select v_lanc_id, ofo.forma_pagamento_id, ofo.valor, (select auth.uid())
    from public.oc_formas ofo
    where ofo.ordem_compra_id = p_oc_id;
  elsif v_forma is not null then
    insert into public.lancamento_formas
      (lancamento_id, forma_pagamento_id, valor, created_by)
    values (v_lanc_id, v_forma, v_total, (select auth.uid()));
  end if;

  if v_qtd_parcelas > 0 then
    -- A ligacao entre os dois lados e o forma_pagamento_id, nao o id do bloco:
    -- (lancamento_id, forma_pagamento_id) e unico, entao este join e exato.
    -- Parcela de ordem sem bloco cai no bloco unico do lancamento quando ele
    -- existe (caminho antigo), e em nenhum quando nao existe.
    insert into public.lancamento_parcelas (
      lancamento_id, numero_parcela, valor, data_vencimento, status,
      lancamento_forma_id, created_by
    )
    select v_lanc_id, p.numero_parcela, p.valor, p.data_vencimento, 'pendente',
           coalesce(
             lf_da_parcela.id,
             (select lf.id from public.lancamento_formas lf
              where lf.lancamento_id = v_lanc_id
              limit 1)
           ),
           (select auth.uid())
    from public.oc_parcelas p
    left join public.oc_formas ofo on ofo.id = p.oc_forma_id
    left join public.lancamento_formas lf_da_parcela
      on lf_da_parcela.lancamento_id = v_lanc_id
     and lf_da_parcela.forma_pagamento_id = ofo.forma_pagamento_id
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
