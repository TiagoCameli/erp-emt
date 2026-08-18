-- A aprovação da OC rateia por categoria, e inclui o rodapé no rateio.
--
-- ## O defeito que isto conserta
--
-- O bloco de rateio somava `quantidade * preco_unitario` agrupado só por centro de
-- custo, enquanto o lançamento recebia `ordens_compra.valor_total`, que já inclui
-- frete, outras despesas, impostos e desconto. Medido em 17/08/2026, seis das 17
-- ordens carregadas do Mais Controle divergiriam:
--
--   OC-2026-0017 (BRITAS)  valor 100.000,00  rateio 103.835,95  -3.835,95
--   OC-2026-0004           valor    151,38   rateio    174,00      -22,62
--   OC-2026-0007           valor  2.200,55   rateio  2.194,56       +5,99
--   OC-2026-0001/0002/0003                                        centavos
--
-- Não havia trava, então isso entrava calado no DRE e na conciliação com o Mais
-- Controle. A migration 20260817190000 criou a trava; esta faz a conta certa.
--
-- ## O que muda
--
-- 1. O rateio agrupa por (centro de custo, CATEGORIA DE CUSTO), e a categoria vem do
--    insumo (`insumos.categoria_financeira_id`), não é digitada. Uma compra que mistura
--    coisas deixa de cair inteira numa categoria: a 2592 tem brita, rachão e BGS.
-- 2. O rodapé entra proporcionalmente, e o resto do arredondamento vai para a maior
--    fatia — a mesma regra de `ratearPorCategoria()` em
--    src/modules/compras/ordens/rateio-categoria.ts. Duas aritméticas diferentes
--    divergiriam no primeiro centavo.
-- 3. A categoria do lançamento e da ordem passa a ser a de maior valor entre os itens,
--    calculada ANTES do insert, para o lançamento nascer certo.
-- 4. Aprovar com item cujo insumo não tem categoria de custo é recusado — é o par no
--    servidor da trava que o formulário aplica.
--
-- Um documento do fornecedor continua sendo UM lançamento. Essa invariante é o que
-- sustenta a conciliação fechada em 17/08/2026, e quebrá-la já custou R$ 14.190,82.

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
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para aprovar ordens de compra';
  end if;

  select status, fornecedor_id, valor_total, numero, forma_pagamento_id,
         data_compra, mes_competencia, descricao, categoria_id
  into v_status, v_fornecedor, v_total, v_numero, v_forma, v_compra, v_mes,
       v_descricao, v_categoria
  from public.ordens_compra where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A ordem de compra precisa estar pendente de aprovacao';
  end if;

  -- Item sem categoria de custo nao entra em lancamento: o DRE receberia um valor
  -- que ninguem sabe onde cai. Par no servidor da trava do formulario.
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

  -- Categoria predominante: a de maior valor entre os itens. Calculada antes do
  -- insert para o lancamento nascer com ela, em vez de nascer errado e ser corrigido.
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
    categoria_id, valor, status, data_compra, mes_competencia, created_by
  )
  values (
    'a_pagar', 'oc', p_oc_id, v_fornecedor, v_forma,
    coalesce(
      nullif(btrim(coalesce(v_descricao, '')), ''),
      'Ordem de compra ' || coalesce(v_numero, '')
    ),
    v_categoria,
    v_total, 'previsto', v_compra, v_mes, (select auth.uid())
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

  -- Rateio por (centro de custo, categoria), com o rodapé proporcional e o resto do
  -- arredondamento na maior fatia. `v_total` ja vem com frete/imposto/desconto.
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
