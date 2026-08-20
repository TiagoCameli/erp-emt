-- Rollback das quatro migrations de "varias formas por ordem de compra" (20/08/2026):
--   20260820180000_oc_com_varias_formas_estrutura
--   20260820180100_oc_salva_formas_com_as_parcelas
--   20260820180200_aprovar_oc_desce_a_divisao_por_forma
--   20260820190000_oc_multiforma_exige_parcelas
--
-- ORDEM IMPORTA: as funcoes voltam primeiro, a estrutura depois. Derrubar
-- oc_formas com fn_salvar_parcelas_oc ainda escrevendo nela quebraria toda
-- gravacao de parcela de OC no intervalo.
--
-- NAO desfaz o bloco 1 (varias formas por LANCAMENTO). fn_aprovar_ordem_compra
-- volta para a versao de 20260820164000, que ainda cria UM bloco de
-- lancamento_formas a partir da forma do cabecalho da OC -- e isso tem de
-- continuar valendo, porque o filtro de "Pagamentos diretos" depende da
-- invariante "tem forma no cabecalho <=> tem bloco". Para desfazer o bloco 1,
-- rode 20260820160000_lancamento_com_varias_formas_rollback.sql DEPOIS deste.
--
-- PERDA DE DADO ASSUMIDA: a divisao por forma da ordem vai embora com a tabela.
-- Ordem que tinha 2+ formas fica com `forma_pagamento_id` NULO no cabecalho (era
-- null de proposito, porque "a forma" nao existia): perde a informacao de como
-- ela seria paga. Antes de rodar, exporte:
--
--   select oc.numero, f.nome, ofo.valor
--   from oc_formas ofo
--   join ordens_compra oc on oc.id = ofo.ordem_compra_id
--   join formas_pagamento f on f.id = ofo.forma_pagamento_id
--   where ofo.ordem_compra_id in (select ordem_compra_id from oc_formas
--                                 group by ordem_compra_id having count(*) > 1);
--
-- E antes de derrubar a tabela, devolva o cabecalho dessas ordens para UMA forma
-- (a de maior valor), senao elas ficam sem forma nenhuma e a aprovacao passa a
-- gerar lancamento sem bloco:
--
--   update ordens_compra oc
--   set forma_pagamento_id = (
--     select ofo.forma_pagamento_id from oc_formas ofo
--     where ofo.ordem_compra_id = oc.id
--     order by ofo.valor desc, ofo.forma_pagamento_id limit 1)
--   where oc.forma_pagamento_id is null
--     and exists (select 1 from oc_formas x where x.ordem_compra_id = oc.id);
--
-- Rodar logo depois de aplicar (nenhuma ordem multi-forma criada ainda) nao
-- perde nada.

-- ---------------------------------------------------------------------------
-- 1. fn_aprovar_ordem_compra volta a versao de 20260820164000
--    (um bloco de lancamento_formas a partir da forma do cabecalho)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 2. fn_salvar_parcelas_oc volta a assinatura de 2 argumentos
--
--    O DROP e obrigatorio: a versao com p_formas tem default, entao criar a de
--    2 argumentos ao lado dela deixaria DUAS sobrecargas e o PostgREST
--    escolheria uma em runtime.
-- ---------------------------------------------------------------------------

drop function if exists public.fn_salvar_parcelas_oc(uuid, jsonb, jsonb);

create or replace function public.fn_salvar_parcelas_oc(p_oc_id uuid, p_parcelas jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text;
  v_total numeric(14, 2);
  v_compra date;
  v_soma numeric(14, 2);
  v_qtd int;
begin
  if not (
    public.tem_permissao('compras.ordens', 'editar')
    or public.tem_permissao('compras.ordens', 'criar')
  ) then
    raise exception 'Sem permissao para definir parcelas da ordem de compra';
  end if;

  select status, valor_total, data_compra
  into v_status, v_total, v_compra
  from public.ordens_compra
  where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status not in ('rascunho', 'pendente_aprovacao') then
    raise exception 'So da para mexer nas parcelas de uma ordem em rascunho ou pendente de aprovacao. Depois de aprovada, edite as parcelas no lancamento.';
  end if;

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));

  delete from public.oc_parcelas where ordem_compra_id = p_oc_id;
  if v_qtd = 0 then
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_parcelas) x
    where coalesce((x->>'valor')::numeric, 0) <= 0
  ) then
    raise exception 'Toda parcela precisa de um valor maior que zero';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_parcelas) x
    where nullif(x->>'data_vencimento', '') is null
  ) then
    raise exception 'Toda parcela precisa de uma data de vencimento';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_parcelas) x
    where (x->>'data_vencimento')::date < v_compra
  ) then
    raise exception 'Nenhuma parcela pode vencer antes da data da compra (%)', v_compra;
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2)
  into v_soma
  from jsonb_array_elements(p_parcelas) x;

  if v_soma <> round(v_total, 2) then
    raise exception 'A soma das parcelas (R$ %) precisa fechar com o total da ordem (R$ %)', v_soma, round(v_total, 2);
  end if;

  insert into public.oc_parcelas (
    ordem_compra_id, numero_parcela, data_vencimento, valor, created_by
  )
  select
    p_oc_id,
    row_number() over (
      order by (x->>'data_vencimento')::date, x->>'valor'
    )::smallint,
    (x->>'data_vencimento')::date,
    round((x->>'valor')::numeric, 2),
    (select auth.uid())
  from jsonb_array_elements(p_parcelas) x;
end;
$$;

revoke all on function public.fn_salvar_parcelas_oc(uuid, jsonb) from public;
grant execute on function public.fn_salvar_parcelas_oc(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. a estrutura
-- ---------------------------------------------------------------------------

drop index if exists public.idx_oc_parcelas_forma;
alter table public.oc_parcelas drop column if exists oc_forma_id;

drop table if exists public.oc_formas;
