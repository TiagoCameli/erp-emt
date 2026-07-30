-- Descricao e categoria do custo passam a ser pedidas NA COMPRA.
--
-- Item 4 da lista de pendencias: o lancamento gerado pela OC nascia sem
-- categoria (`categoria_id` null), entao compra vinda de ordem nao classificava
-- no DRE por categoria. A causa era simples: nao existia onde informar.
--
-- Decisao do Tiago: pedir descricao + categoria na cotacao, na OC e no lancamento
-- avulso. A OC passa as duas para o lancamento. Categoria escolhida por quem sabe
-- o que esta comprando, em vez de deduzida do insumo (OC com insumos de grupos
-- diferentes seria ambigua e exigiria uma regra de desempate inventada).
--
-- Colunas nullable de proposito: OC e cotacao que ja existem continuam validas, e
-- o lancamento delas cai no texto antigo ("Ordem de compra OC-XXXX").

alter table public.ordens_compra
  add column if not exists descricao text,
  add column if not exists categoria_id uuid references public.categorias_financeiras(id);

alter table public.cotacoes
  add column if not exists descricao text,
  add column if not exists categoria_id uuid references public.categorias_financeiras(id);

comment on column public.ordens_compra.descricao is
  'O que esta sendo comprado, em uma linha. Vira a descricao do lancamento.';
comment on column public.ordens_compra.categoria_id is
  'Categoria do custo da compra. Vira a categoria do lancamento, e e o que classifica a compra no DRE.';

create index if not exists idx_ordens_compra_categoria
  on public.ordens_compra (categoria_id);
create index if not exists idx_cotacoes_categoria
  on public.cotacoes (categoria_id);

create or replace function public.fn_aprovar_ordem_compra(p_oc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
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

  perform public.fn_exigir_competencia_aberta(v_mes, 'ordem_compra', p_oc_id);

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_parcelas, v_soma_parcelas
  from public.oc_parcelas
  where ordem_compra_id = p_oc_id;

  if v_qtd_parcelas > 0 and v_soma_parcelas <> round(v_total, 2) then
    raise exception 'A soma das parcelas da ordem (R$ %) nao fecha com o total (R$ %). Ajuste as parcelas antes de aprovar.',
      v_soma_parcelas, round(v_total, 2);
  end if;

  update public.ordens_compra
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now()
  where id = p_oc_id;

  insert into public.lancamentos (
    tipo, origem, origem_id, fornecedor_id, forma_pagamento_id, descricao,
    categoria_id, valor, status, data_compra, mes_competencia, created_by
  )
  values (
    'a_pagar', 'oc', p_oc_id, v_fornecedor, v_forma,
    -- Descricao da compra quando existe; senao o texto antigo, para OC legada
    -- continuar legivel.
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

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
  select v_lanc_id, oi.centro_custo_id, sum(oi.quantidade * oi.preco_unitario), (select auth.uid())
  from public.oc_itens oi
  where oi.ordem_compra_id = p_oc_id
  group by oi.centro_custo_id;

  perform public.fn_propagar_anexos('ordem_compra', p_oc_id, 'lancamento', v_lanc_id);

  perform public.fn_aplicar_regra_pagamento(v_lanc_id);
end;
$$;

revoke all on function public.fn_aprovar_ordem_compra(uuid) from public;
grant execute on function public.fn_aprovar_ordem_compra(uuid) to authenticated;

notify pgrst, 'reload schema';
