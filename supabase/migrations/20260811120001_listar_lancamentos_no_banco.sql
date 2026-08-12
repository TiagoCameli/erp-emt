-- =============================================================
-- A listagem de lancamentos passa a ser filtrada NO BANCO
--
-- O QUE QUEBROU. Os filtros de revisao, conta bancaria e centro de custo
-- nao filtravam no banco: o app resolvia a lista de lancamento_id em
-- consultas auxiliares e mandava TODOS os ids num `.in()` dentro da URL.
-- Com a base vazia nunca apareceu. Com 7.253 lancamentos:
--
--   conta BANCO DO BRASIL 102.124-9   5.634 ids   ~220 KB de URL
--   centro Escritorio Central         2.122 ids    ~83 KB
--   centro 009 - BR-364               1.963 ids    ~77 KB
--   centro Manutencao/Documentacao    1.728 ids    ~67 KB
--   conta CAIXINHA DE DINHEIRO          899 ids    ~35 KB
--   revisao "nao revisado"              402 ids    16,1 KB
--
-- E o cliente recusa: "HeadersOverflowError ... HTTP headers exceeded
-- server limits (typically 16KB). Your request URL is 16073 characters".
-- Ate o filtro de revisao, o menor deles, estourava por 73 bytes. Alem do
-- teto, resolver os ids lia as 9.244 parcelas em 10 requisicoes
-- sequenciais: 11 segundos para desenhar uma pagina de 100 linhas.
--
-- POR QUE UMA FUNCAO, E NAO UM REMENDO NA URL. Nenhum ajuste de tamanho
-- resolve: a lista de ids cresce com a base, entao qualquer teto e uma
-- data marcada para quebrar de novo. Filtrar onde os dados estao troca 12
-- idas ao banco por uma, e tira o limite do caminho.
--
-- REVISAO CALCULADA UMA VEZ SO. O estado de revisao decide duas coisas: o
-- selo da coluna e quem passa no filtro. Antes eram dois calculos em dois
-- lugares (o filtro em idsPorRevisao, o selo no map da listagem), com um
-- comentario no codigo avisando que precisavam casar. Agora e a mesma
-- expressao SQL para os dois, e nao ha como discordarem.
--
-- Semantica preservada, inclusive as decisoes que estavam nos comentarios:
--   - parcela PAGA conta como resolvida (pagar exige conta bancaria);
--   - "nao_revisado" e o complemento de "revisado" DENTRO do que tem
--     parcela a pagar, entao lancamento quitado nao entra;
--   - lancamento a receber, ou sem parcela, e "nao-se-aplica" e fica fora
--     de todos os filtros de revisao menos "em_revisao";
--   - conta bancaria vale parcela paga e a pagar ("o que passou por esta
--     conta"), e centro de custo mora no rateio.
--
-- SECURITY INVOKER de proposito: a RLS de lancamentos continua valendo
-- para quem chama. Uma funcao SECURITY DEFINER aqui seria furo de
-- permissao disfarcado de otimizacao.
-- =============================================================

create or replace function public.fn_listar_lancamentos(
  p_filtros jsonb default '{}'::jsonb,
  p_pagina int default 0,
  p_tamanho int default 25
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
    -- Busca por numero ou descricao. `%` e `_` do usuario sao escapados:
    -- sem isso, digitar "50%" viraria curinga e traria o que nao foi pedido.
    and (
      f.busca is null
      or l.numero ilike '%' || replace(replace(f.busca, '%', '\%'), '_', '\_') || '%'
      or l.descricao ilike '%' || replace(replace(f.busca, '%', '\%'), '_', '\_') || '%'
    )
    -- Conta bancaria: vale parcela paga e a pagar.
    and (
      f.conta_bancaria_id is null
      or exists (
        select 1 from public.lancamento_parcelas p
        where p.lancamento_id = l.id and p.conta_bancaria_id = f.conta_bancaria_id
      )
    )
    -- Centro de custo: mora no rateio, nunca na tabela mae.
    and (
      f.centro_custo_id is null
      or exists (
        select 1 from public.lancamento_rateios r
        where r.lancamento_id = l.id and r.centro_custo_id = f.centro_custo_id
      )
    )
    -- Revisao. Escrito com EXISTS em vez de contagem porque o planejador
    -- para no primeiro acerto: contar todas as parcelas de cada lancamento
    -- so para saber se existe uma sem conta e trabalho jogado fora.
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
        -- Complemento de "revisado" dentro de quem tem parcela a pagar.
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
pagina as (
  select b.*,
         (select c.nome from public.categorias_financeiras c where c.id = b.categoria_id) categoria_nome,
         (select coalesce(fo.nome_fantasia, fo.razao_social) from public.fornecedores fo where fo.id = b.fornecedor_id) fornecedor_nome,
         pc.total qtd_parcelas,
         -- Mesmo criterio do filtro acima, e e por isso que selo e filtro
         -- nao podem discordar: e a mesma regra, no mesmo lugar.
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
  order by b.data_compra desc, b.created_at desc
  limit greatest(p_tamanho, 1)
  offset greatest(p_pagina, 0) * greatest(p_tamanho, 1)
)
select jsonb_build_object(
  'total', (select count(*) from base),
  -- Soma do conjunto FILTRADO inteiro, nao da pagina. Aqui e uma agregacao
  -- de verdade: o app nao precisa mais buscar milhares de valores para
  -- somar fora do banco.
  'valor_total', (select coalesce(sum(valor), 0) from base),
  'itens', coalesce((
    select jsonb_agg(to_jsonb(p) order by p.data_compra desc, p.created_at desc)
    from pagina p
  ), '[]'::jsonb)
);
$$;

revoke all on function public.fn_listar_lancamentos(jsonb, int, int) from public, anon;
grant execute on function public.fn_listar_lancamentos(jsonb, int, int) to authenticated;

comment on function public.fn_listar_lancamentos(jsonb, int, int) is
  'Pagina, conta e soma a listagem de lancamentos com todos os filtros aplicados no banco. Substitui a resolucao de ids em lista + `in` na URL, que estourava o limite de 16 KB de cabecalho com o volume real. SECURITY INVOKER: a RLS continua valendo.';

-- Indices para os EXISTS do filtro de revisao e de conta. lancamento_id ja
-- e indexado; o que faltava era alcancar a parcela por conta e por status
-- sem varrer as 9.244.
create index if not exists idx_lancamento_parcelas_lanc_conta
  on public.lancamento_parcelas (lancamento_id, conta_bancaria_id, status);
create index if not exists idx_lancamento_rateios_centro_lanc
  on public.lancamento_rateios (centro_custo_id, lancamento_id);

analyze public.lancamento_parcelas;
analyze public.lancamento_rateios;
