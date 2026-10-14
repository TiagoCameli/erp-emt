-- Busca universal, bloco 1: os helpers e as listagens de Compras.
--
-- Toda caixa "Buscar" do ERP passa a procurar na linha INTEIRA: número,
-- fornecedor, insumo, centro de custo, valor, data e mês. O contrato está em
-- src/lib/busca.ts: cada linha vira um texto minúsculo e sem acento, com valor e
-- data em todas as grafias, e cada palavra digitada tem que ser um pedaço dele.
--
-- As listagens paginadas no banco leem esse texto por uma função
-- `busca(<tabela>)`, que o PostgREST expõe como COLUNA COMPUTADA: a consulta
-- filtra `busca=ilike.%palavra%` sem coluna nova, sem trigger e sem nada para
-- ficar defasado quando o fornecedor muda de nome ou a OC ganha um item.
-- Nenhum contrato de escrita muda: o frontend publicado continua funcionando
-- igual até o deploy.
--
-- As funções são SECURITY INVOKER (padrão): os subselects respeitam a RLS de
-- quem consulta, então a busca nunca revela texto de linha que a pessoa não vê.

-- Minúsculo e sem acento. Espelha `normalizarBusca` (NFD + tira diacrítico).
-- Sem a extensão unaccent: translate é imutável e não depende de dicionário.
create or replace function public.fn_busca_norm(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(regexp_replace(
    translate(
      coalesce(texto, ''),
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- "1500,00 1.500,00". Espelha `textoDeValor`. As vírgulas e pontos do
-- to_char são LITERAIS (não o G/D do locale) e trocados depois.
create or replace function public.fn_busca_valor(valor numeric)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when valor is null then '' else
    replace(to_char(abs(valor), 'FM9999999999990.00'), '.', ',') || ' ' ||
    translate(to_char(abs(valor), 'FM9,999,999,999,990.00'), ',.', '.,')
  end;
$$;

-- "03/2026 2026-03 marco/2026 mar/26 03/26". Espelha `textoDeMes`.
create or replace function public.fn_busca_mes(dia date)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when dia is null then '' else concat_ws(' ',
    to_char(dia, 'MM/YYYY'),
    to_char(dia, 'YYYY-MM'),
    nome || '/' || to_char(dia, 'YYYY'),
    left(nome, 3) || '/' || to_char(dia, 'YY'),
    to_char(dia, 'MM/YY')
  ) end
  from (select (array['janeiro','fevereiro','marco','abril','maio','junho','julho',
                      'agosto','setembro','outubro','novembro','dezembro'])
               [extract(month from dia)::int] as nome) m;
$$;

-- "15/03/2026 2026-03-15 " + as formas do mês. Espelha `textoDeData`.
create or replace function public.fn_busca_data(dia date)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when dia is null then '' else
    to_char(dia, 'DD/MM/YYYY') || ' ' || to_char(dia, 'YYYY-MM-DD') || ' ' ||
    public.fn_busca_mes(dia)
  end;
$$;

-- Nome do centro de custo com o do pai: o item fica na etapa, e quem busca
-- pela obra tem que achar.
create or replace function public.fn_busca_centro(centro_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws(' ', c.codigo, c.nome, p.codigo, p.nome)
  from public.centros_custo c
  left join public.centros_custo p on p.id = c.pai_id
  where c.id = centro_id;
$$;

-- Ordem de compra: número, nota, descrição, fornecedor (nome e CNPJ com e sem
-- pontuação), forma, condição, categoria, os insumos e centros dos itens, o
-- valor, a data da compra e o mês de competência.
create or replace function public.busca(oc public.ordens_compra)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws(' ',
    public.fn_busca_norm(concat_ws(' ',
      oc.numero, oc.numero_documento, oc.descricao, oc.observacoes,
      replace(oc.status, '_', ' '),
      f.razao_social, f.nome_fantasia, f.cnpj_cpf,
      regexp_replace(f.cnpj_cpf, '\D', '', 'g'),
      fp.nome, cp.descricao, cf.nome,
      (select string_agg(concat_ws(' ', i.codigo, i.nome, ci.nome,
                                   public.fn_busca_centro(it.centro_custo_id)), ' ')
         from public.oc_itens it
         left join public.insumos i on i.id = it.insumo_id
         left join public.categorias_insumo ci on ci.id = i.categoria_id
        where it.ordem_compra_id = oc.id)
    )),
    public.fn_busca_valor(oc.valor_total),
    public.fn_busca_data(oc.data_compra),
    public.fn_busca_mes(oc.mes_competencia)
  )
  from (select 1) as uma
  left join public.fornecedores f on f.id = oc.fornecedor_id
  left join public.formas_pagamento fp on fp.id = oc.forma_pagamento_id
  left join public.condicoes_pagamento cp on cp.id = oc.condicao_pagamento_id
  left join public.categorias_financeiras cf on cf.id = oc.categoria_id;
$$;

-- Cotação: número, descrição, observações, motivo, categoria, vencedor e
-- participantes, os insumos cotados e o dia em que foi criada (no fuso local).
create or replace function public.busca(c public.cotacoes)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws(' ',
    public.fn_busca_norm(concat_ws(' ',
      c.numero, c.descricao, c.observacoes, c.motivo_selecao,
      replace(c.status, '_', ' '),
      cf.nome, v.razao_social, v.nome_fantasia,
      (select string_agg(concat_ws(' ', f.razao_social, f.nome_fantasia), ' ')
         from public.cotacao_fornecedores cfo
         join public.fornecedores f on f.id = cfo.fornecedor_id
        where cfo.cotacao_id = c.id),
      (select string_agg(distinct concat_ws(' ', i.codigo, i.nome), ' ')
         from public.cotacao_itens ct
         join public.insumos i on i.id = ct.insumo_id
        where ct.cotacao_id = c.id)
    )),
    public.fn_busca_data((c.created_at at time zone 'America/Rio_Branco')::date)
  )
  from (select 1) as uma
  left join public.categorias_financeiras cf on cf.id = c.categoria_id
  left join public.fornecedores v on v.id = c.vencedor_fornecedor_id;
$$;

-- Função nasce com EXECUTE para PUBLIC: fechar antes de abrir.
revoke all on function public.fn_busca_norm(text) from public, anon;
revoke all on function public.fn_busca_valor(numeric) from public, anon;
revoke all on function public.fn_busca_mes(date) from public, anon;
revoke all on function public.fn_busca_data(date) from public, anon;
revoke all on function public.fn_busca_centro(uuid) from public, anon;
revoke all on function public.busca(public.ordens_compra) from public, anon;
revoke all on function public.busca(public.cotacoes) from public, anon;

grant execute on function public.fn_busca_norm(text) to authenticated;
grant execute on function public.fn_busca_valor(numeric) to authenticated;
grant execute on function public.fn_busca_mes(date) to authenticated;
grant execute on function public.fn_busca_data(date) to authenticated;
grant execute on function public.fn_busca_centro(uuid) to authenticated;
grant execute on function public.busca(public.ordens_compra) to authenticated;
grant execute on function public.busca(public.cotacoes) to authenticated;

notify pgrst, 'reload schema';
