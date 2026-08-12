-- =============================================================
-- Ordenação da listagem de lançamentos, decidida no banco
--
-- Pedido do Tiago: clicar na coluna ordena crescente, clicar de novo
-- decrescente, clicar a terceira vez volta ao padrão.
--
-- POR QUE NO BANCO. A paginação é server-side: a tela tem 100 das 7.253
-- linhas. Ordenar no navegador ordenaria só as 100 carregadas, e o topo da
-- lista mostraria "o maior valor DESTA página" com cara de "o maior valor".
-- É o mesmo erro do total somado só na página, e igualmente invisível.
--
-- COMO, SEM SQL DINÂMICO. `p_ordenar_por` nunca chega ao SQL como texto:
-- vira uma de três chaves TIPADAS (texto, número, data) por um CASE que só
-- conhece os nomes que esta função aceita. O que não está na lista cai em
-- NULL e a ordem volta ao padrão. Assim não há concatenação, não há
-- injeção, e a função continua `language sql`.
--
-- A DIREÇÃO em seis cláusulas: para cada chave, uma asc que só vale quando
-- não é descendente e uma desc que só vale quando é. A que não vale vira
-- NULL para todas as linhas e não influencia nada. Sem ordenação pedida, as
-- três chaves são NULL e sobra só o padrão.
--
-- DESEMPATE SEMPRE. Toda ordenação termina em data_compra, created_at e id.
-- Com paginação server-side, ordem sem desempate estável repete linha numa
-- página e esconde na outra: duas linhas empatadas podem trocar de lugar
-- entre a consulta da página 1 e a da página 2.
--
-- STATUS E REVISÃO ordenam pela régua do processo, não pelo alfabeto.
-- Alfabético em status daria "a_pagar, aprovado, cancelado, pago, previsto",
-- que não é ordem de nada. Quem clica em Status quer a fila do trabalho:
-- previsto, a pagar, aprovado, pago, cancelado. Em Revisão, o que falta
-- resolver primeiro: sem conta, conta parcial, revisado, não se aplica.
-- =============================================================

-- Assinatura nova (dois parâmetros a mais, ambos com padrão). A antiga sai
-- de cena: mantê-la deixaria duas sobrecargas com todos os argumentos
-- opcionais, e uma chamada de três argumentos ficaria ambígua.
drop function if exists public.fn_listar_lancamentos(jsonb, int, int);

create or replace function public.fn_listar_lancamentos(
  p_filtros jsonb default '{}'::jsonb,
  p_pagina int default 0,
  p_tamanho int default 25,
  p_ordenar_por text default null,
  p_descendente boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with parametros as (
  select
    nullif(p_filtros->>'tipo', '') tipo,
    nullif(p_filtros->>'status', '') status,
    nullif(p_filtros->>'origem', '') origem,
    nullif(p_filtros->>'revisao', '') revisao,
    nullif(p_filtros->>'busca', '') busca,
    nullif(p_filtros->>'mes_competencia', '')::date mes_competencia,
    nullif(p_filtros->>'fornecedor_id', '')::uuid fornecedor_id,
    nullif(p_filtros->>'categoria_id', '')::uuid categoria_id,
    nullif(p_filtros->>'forma_pagamento_id', '')::uuid forma_pagamento_id,
    nullif(p_filtros->>'centro_custo_id', '')::uuid centro_custo_id,
    nullif(p_filtros->>'conta_bancaria_id', '')::uuid conta_bancaria_id,
    nullif(p_filtros->>'valor_de', '')::numeric valor_de,
    nullif(p_filtros->>'valor_ate', '')::numeric valor_ate,
    nullif(p_filtros->>'vencimento_de', '')::date vencimento_de,
    nullif(p_filtros->>'vencimento_ate', '')::date vencimento_ate,
    nullif(p_filtros->>'compra_de', '')::date compra_de,
    nullif(p_filtros->>'compra_ate', '')::date compra_ate,
    -- Instantes ja convertidos para o fuso de Rio Branco pelo app, que e
    -- quem sabe onde o dia do usuario comeca. O de baixo e exclusivo.
    nullif(p_filtros->>'criado_de', '')::timestamptz criado_de,
    nullif(p_filtros->>'criado_ate', '')::timestamptz criado_ate
),
base as (
  select l.id, l.numero, l.tipo, l.origem, l.descricao, l.valor,
         l.data_vencimento, l.status, l.data_compra, l.mes_competencia,
         l.created_at, l.categoria_id, l.fornecedor_id
  from public.lancamentos l, parametros f
  where (f.tipo is null or l.tipo = f.tipo)
    and (f.status is null or l.status = f.status)
    and (f.origem is null or l.origem = f.origem)
    and (f.mes_competencia is null or l.mes_competencia = f.mes_competencia)
    and (f.fornecedor_id is null or l.fornecedor_id = f.fornecedor_id)
    and (f.categoria_id is null or l.categoria_id = f.categoria_id)
    and (f.forma_pagamento_id is null or l.forma_pagamento_id = f.forma_pagamento_id)
    and (f.valor_de is null or l.valor >= f.valor_de)
    and (f.valor_ate is null or l.valor <= f.valor_ate)
    and (f.vencimento_de is null or l.data_vencimento >= f.vencimento_de)
    and (f.vencimento_ate is null or l.data_vencimento <= f.vencimento_ate)
    and (f.compra_de is null or l.data_compra >= f.compra_de)
    and (f.compra_ate is null or l.data_compra <= f.compra_ate)
    and (f.criado_de is null or l.created_at >= f.criado_de)
    and (f.criado_ate is null or l.created_at < f.criado_ate)
    and (
      f.busca is null
      or l.numero ilike '%' || replace(replace(f.busca, '%', '\%'), '_', '\_') || '%'
      or l.descricao ilike '%' || replace(replace(f.busca, '%', '\%'), '_', '\_') || '%'
    )
    and (
      f.conta_bancaria_id is null
      or exists (
        select 1 from public.lancamento_parcelas p
        where p.lancamento_id = l.id and p.conta_bancaria_id = f.conta_bancaria_id
      )
    )
    and (
      f.centro_custo_id is null
      or exists (
        select 1 from public.lancamento_rateios r
        where r.lancamento_id = l.id and r.centro_custo_id = f.centro_custo_id
      )
    )
    and (
      f.revisao is null
      or case f.revisao
        when 'em_revisao' then exists (
          select 1 from public.lancamento_parcelas p
          where p.lancamento_id = l.id and p.status = 'em_revisao'
        )
        when 'sem_conta' then l.tipo = 'a_pagar'
          and exists (select 1 from public.lancamento_parcelas p where p.lancamento_id = l.id)
          and not exists (
            select 1 from public.lancamento_parcelas p
            where p.lancamento_id = l.id
              and (p.status = 'pago' or p.conta_bancaria_id is not null)
          )
        when 'revisado' then l.tipo = 'a_pagar'
          and exists (select 1 from public.lancamento_parcelas p where p.lancamento_id = l.id)
          and not exists (
            select 1 from public.lancamento_parcelas p
            where p.lancamento_id = l.id
              and p.status <> 'pago' and p.conta_bancaria_id is null
          )
        when 'parcial' then l.tipo = 'a_pagar'
          and exists (
            select 1 from public.lancamento_parcelas p
            where p.lancamento_id = l.id
              and (p.status = 'pago' or p.conta_bancaria_id is not null)
          )
          and exists (
            select 1 from public.lancamento_parcelas p
            where p.lancamento_id = l.id
              and p.status <> 'pago' and p.conta_bancaria_id is null
          )
        when 'nao_revisado' then l.tipo = 'a_pagar'
          and exists (
            select 1 from public.lancamento_parcelas p
            where p.lancamento_id = l.id
              and p.status <> 'pago' and p.conta_bancaria_id is null
          )
        else false
      end
    )
),
com_revisao as (
  select b.*,
         pc.total qtd_parcelas,
         case
           when b.tipo <> 'a_pagar' or pc.total = 0 then 'nao-se-aplica'
           when pc.com_conta = 0 then 'sem-conta'
           when pc.com_conta = pc.total then 'revisado'
           else 'parcial'
         end revisao
  from base b
  cross join lateral (
    select count(*) total,
           count(*) filter (where p.status = 'pago' or p.conta_bancaria_id is not null) com_conta
    from public.lancamento_parcelas p
    where p.lancamento_id = b.id
  ) pc
),
ordenada as (
  select r.*,
         -- Chaves de ordenacao. So os nomes desta lista existem; qualquer
         -- outro valor cai fora e a ordem volta ao padrao.
         case p_ordenar_por
           when 'numero' then lower(coalesce(r.numero, ''))
           when 'descricao' then lower(r.descricao)
           when 'tipo' then r.tipo
         end k_texto,
         case p_ordenar_por
           when 'valor' then r.valor
           when 'qtdParcelas' then r.qtd_parcelas::numeric
           -- Regua do processo, nao alfabeto.
           when 'status' then case r.status
             when 'previsto' then 1 when 'a_pagar' then 2 when 'aprovado' then 3
             when 'pago' then 4 when 'cancelado' then 5 else 9 end
           when 'revisao' then case r.revisao
             when 'sem-conta' then 1 when 'parcial' then 2
             when 'revisado' then 3 else 4 end
         end k_num,
         case p_ordenar_por
           when 'dataCompra' then r.data_compra
           when 'mesCompetencia' then r.mes_competencia
           when 'dataVencimento' then r.data_vencimento
         end k_data
  from com_revisao r
),
pagina as (
  select o.id, o.numero, o.tipo, o.origem, o.descricao, o.valor,
         o.data_vencimento, o.status, o.data_compra, o.mes_competencia,
         o.created_at, o.qtd_parcelas, o.revisao,
         (select c.nome from public.categorias_financeiras c where c.id = o.categoria_id) categoria_nome,
         (select coalesce(fo.nome_fantasia, fo.razao_social) from public.fornecedores fo where fo.id = o.fornecedor_id) fornecedor_nome,
         row_number() over (
           order by
             case when not coalesce(p_descendente, false) then o.k_texto end asc nulls last,
             case when coalesce(p_descendente, false) then o.k_texto end desc nulls last,
             case when not coalesce(p_descendente, false) then o.k_num end asc nulls last,
             case when coalesce(p_descendente, false) then o.k_num end desc nulls last,
             case when not coalesce(p_descendente, false) then o.k_data end asc nulls last,
             case when coalesce(p_descendente, false) then o.k_data end desc nulls last,
             -- Desempate estavel: sem ele, linha empatada troca de pagina.
             o.data_compra desc, o.created_at desc, o.id
         ) ordem
  from ordenada o
  order by ordem
  limit greatest(p_tamanho, 1)
  offset greatest(p_pagina, 0) * greatest(p_tamanho, 1)
)
select jsonb_build_object(
  'total', (select count(*) from base),
  -- Soma do conjunto FILTRADO inteiro, nao da pagina.
  'valor_total', (select coalesce(sum(valor), 0) from base),
  'itens', coalesce((
    -- `ordem` e o que garante que a ordem sobrevive ao jsonb_agg. Sem ele, a
    -- ordem da agregacao nao e garantida por contrato.
    select jsonb_agg(to_jsonb(p) - 'ordem' order by p.ordem) from pagina p
  ), '[]'::jsonb)
);
$$;

revoke all on function public.fn_listar_lancamentos(jsonb, int, int, text, boolean) from public, anon;
grant execute on function public.fn_listar_lancamentos(jsonb, int, int, text, boolean) to authenticated;

comment on function public.fn_listar_lancamentos(jsonb, int, int, text, boolean) is
  'Pagina, ordena, conta e soma a listagem de lancamentos, com todos os filtros aplicados no banco. p_ordenar_por aceita apenas os nomes previstos na funcao (sem SQL dinamico); qualquer outro valor volta a ordem padrao. SECURITY INVOKER: a RLS continua valendo.';
