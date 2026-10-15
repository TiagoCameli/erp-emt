-- Fluxo de caixa por NATUREZA (15/10/2026).
--
-- A auditoria de 15/10 achou o fluxo contando a historia errada: "Entradas
-- operacionais" levava R$ 9,03 mi de "Resgate de aplicacao" manual, e "Saidas
-- operacionais" seguia o `tipo` e ignorava a natureza (CAPEX 4,86 mi,
-- distribuicao a socios 3,71 mi, mutuo 1,33 mi). No projetado, 76% das saidas
-- futuras eram parcelas de CAPEX.
--
-- `grupo_fluxo` e a pergunta "de onde veio / para onde foi o dinheiro":
--   operacao      natureza operacional ou financeira (tarifa, juros)
--   investimento  natureza investimento (CAPEX: equipamento, consorcio, terreno)
--   socios        natureza distribuicao ou mutuo (vai e volta de socio e ligada)
--   divida        movimentacao rateada no centro raiz financeiro (tomada e
--                 amortizacao de emprestimo)
--   aplicacao     outra movimentacao (resgate e aplicacao manuais)
--   null          origem 'aplicacao' (rendimento, rendimento negativo, ajuste de
--                 abertura): variacao DENTRO da subconta, nao passou pela conta
--                 corrente.
-- O sentido (entrada/saida) continua sendo o `tipo` do lancamento.
--
-- COMPATIVEL COM O CLIENTE NO AR: `serie_fluxo` nao muda. `fn_rel_fluxo_caixa`
-- ganha a coluna `grupo` no fim e agrupa tambem por ela; o cliente antigo soma
-- por `tipo` com `+=`, entao linha a mais do mesmo mes/serie da o mesmo total.
-- `fn_lancamentos_do_recorte` ganha `p_grupo` e `p_sentido` no fim, com default.

create or replace view public.vw_parcelas_caixa
with (security_invoker = true) as
 SELECT p.id AS parcela_id,
    p.lancamento_id,
    p.numero_parcela,
    p.conta_bancaria_id,
    l.tipo,
    p.data_pagamento,
    p.data_vencimento,
    p.mes_fluxo,
    p.valor,
    p.valor_liquido,
    p.status,
    l.origem,
    l.categoria_id,
    COALESCE(cf.natureza, 'operacional'::text) AS natureza,
    p.status = 'pago'::text AND p.conta_bancaria_id IS NOT NULL AND (c.saldo_inicial_data IS NULL OR p.data_pagamento IS NULL OR p.data_pagamento > c.saldo_inicial_data) AS no_saldo,
    p.status = 'pago'::text AND c.saldo_inicial_data IS NOT NULL AND p.data_pagamento IS NOT NULL AND p.data_pagamento <= c.saldo_inicial_data AS antes_do_corte,
        CASE
            WHEN l.origem = 'aplicacao'::text AND COALESCE(cf.natureza, 'operacional'::text) = 'movimentacao'::text THEN NULL::text
            WHEN COALESCE(cf.natureza, 'operacional'::text) <> 'movimentacao'::text THEN l.tipo
            WHEN l.tipo = 'a_pagar'::text THEN 'amortizacao'::text
            WHEN (EXISTS ( WITH RECURSIVE subida AS (
                     SELECT cc.id,
                        cc.pai_id,
                        cc.tipo
                       FROM public.lancamento_rateios r
                         JOIN public.centros_custo cc ON cc.id = r.centro_custo_id
                      WHERE r.lancamento_id = l.id
                    UNION
                     SELECT pai.id,
                        pai.pai_id,
                        pai.tipo
                       FROM public.centros_custo pai
                         JOIN subida s_1 ON pai.id = s_1.pai_id
                    )
             SELECT 1
               FROM subida s
              WHERE s.pai_id IS NULL AND s.tipo = 'financeiro'::text)) THEN 'emprestimo_tomado'::text
            ELSE 'a_receber'::text
        END AS serie_fluxo,
        CASE
            WHEN l.origem = 'aplicacao'::text THEN NULL::text
            WHEN COALESCE(cf.natureza, 'operacional'::text) = 'investimento'::text THEN 'investimento'::text
            WHEN COALESCE(cf.natureza, 'operacional'::text) = ANY (ARRAY['distribuicao'::text, 'mutuo'::text]) THEN 'socios'::text
            WHEN COALESCE(cf.natureza, 'operacional'::text) <> 'movimentacao'::text THEN 'operacao'::text
            WHEN (EXISTS ( WITH RECURSIVE subida AS (
                     SELECT cc.id,
                        cc.pai_id,
                        cc.tipo
                       FROM public.lancamento_rateios r
                         JOIN public.centros_custo cc ON cc.id = r.centro_custo_id
                      WHERE r.lancamento_id = l.id
                    UNION
                     SELECT pai.id,
                        pai.pai_id,
                        pai.tipo
                       FROM public.centros_custo pai
                         JOIN subida s_1 ON pai.id = s_1.pai_id
                    )
             SELECT 1
               FROM subida s
              WHERE s.pai_id IS NULL AND s.tipo = 'financeiro'::text)) THEN 'divida'::text
            ELSE 'aplicacao'::text
        END AS grupo_fluxo
   FROM public.lancamento_parcelas p
     JOIN public.lancamentos l ON l.id = p.lancamento_id
     LEFT JOIN public.categorias_financeiras cf ON cf.id = l.categoria_id
     LEFT JOIN public.contas_bancarias c ON c.id = p.conta_bancaria_id
  WHERE p.status <> 'cancelado'::text AND l.status <> 'cancelado'::text;

comment on view public.vw_parcelas_caixa is
  'Parcelas que contam para o caixa (D1, 03/10/2026). Sem filtro de natureza. no_saldo = paga, com conta, depois do corte. serie_fluxo = serie do fluxo de caixa (legado). grupo_fluxo = operacao | investimento | socios | divida | aplicacao, pela natureza; null = origem aplicacao, fora do caixa (15/10/2026).';

-- A saida muda (coluna `grupo`), entao DROP + CREATE com a mesma assinatura.
drop function if exists public.fn_rel_fluxo_caixa(uuid[], uuid[]);

create function public.fn_rel_fluxo_caixa(p_centros_custo uuid[] default null::uuid[], p_centros_receita uuid[] default null::uuid[])
 returns table(mes text, tipo text, realizado boolean, total numeric, grupo text)
 language sql
 stable
 set search_path to ''
as $function$
  with alvo_custo as (
    select distinct s.id as centro_id
    from unnest(coalesce(p_centros_custo, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  alvo_receita as (
    select distinct s.id as centro_id
    from unnest(coalesce(p_centros_receita, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  fatia as (
    select
      r.lancamento_id,
      sum(r.valor) as rateio_total,
      sum(case
            when l.tipo = 'a_pagar'   and ac.centro_id is not null then r.valor
            when l.tipo = 'a_receber' and ar.centro_id is not null then r.valor
            else 0
          end) as rateio_escolhido
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join alvo_custo ac on ac.centro_id = r.centro_custo_id
    left join alvo_receita ar on ar.centro_id = r.centro_custo_id
    where l.status <> 'cancelado'
    group by r.lancamento_id
  ),
  parcela as (
    select
      to_char(v.mes_fluxo, 'YYYY-MM') as mes,
      v.lancamento_id,
      v.serie_fluxo as serie,
      v.grupo_fluxo as grupo,
      (v.status = 'pago') as realizado,
      v.valor_liquido as valor,
      case
        when v.tipo = 'a_pagar'
          then coalesce(cardinality(p_centros_custo), 0) > 0
        else coalesce(cardinality(p_centros_receita), 0) > 0
      end as tem_corte
    from public.vw_parcelas_caixa v
    where v.serie_fluxo is not null
  )
  select t.mes, t.serie, t.realizado, round(sum(t.valor), 2) as total, t.grupo
  from (
    select
      pa.mes,
      pa.serie,
      pa.grupo,
      pa.realizado,
      case
        when pa.tem_corte
          then pa.valor * f.rateio_escolhido / nullif(f.rateio_total, 0)
        else pa.valor
      end as valor
    from parcela pa
    left join fatia f on f.lancamento_id = pa.lancamento_id
    where pa.mes is not null
      and (not pa.tem_corte or coalesce(f.rateio_escolhido, 0) <> 0)
  ) t
  group by t.mes, t.serie, t.grupo, t.realizado
$function$;

revoke all on function public.fn_rel_fluxo_caixa(uuid[], uuid[]) from public, anon;
grant execute on function public.fn_rel_fluxo_caixa(uuid[], uuid[]) to authenticated;

-- Drill: `p_grupo` e `p_sentido` (entrada | saida) no fim, com default. Nulo em
-- `p_realizado` passa a trazer as duas situacoes no ramo fluxo (antes nao trazia
-- nada): a barra do grupo soma realizado e previsto do mes.
drop function if exists public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date);

create function public.fn_lancamentos_do_recorte(p_tipo_recorte text, p_faixa text default null::text, p_tipo_lancamento text default null::text, p_mes text default null::text, p_realizado boolean default null::boolean, p_conta uuid default null::uuid, p_hoje date default null::date, p_grupo text default null::text, p_sentido text default null::text)
 returns table(lancamento_id uuid, valor_no_recorte numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with corte as (
    select coalesce(p_hoje, (now() at time zone 'America/Rio_Branco')::date) as hoje
  ),
  parcela as (
    select
      v.lancamento_id,
      v.tipo as tipo_lancamento,
      v.serie_fluxo,
      v.grupo_fluxo,
      v.status,
      v.valor,
      coalesce(v.valor_liquido, v.valor) as liquido,
      v.conta_bancaria_id,
      v.no_saldo,
      v.data_vencimento - c.hoje as dias,
      to_char(v.mes_fluxo, 'YYYY-MM') as mes_fluxo
    from public.vw_parcelas_caixa v
    cross join corte c
  ),
  aging as (
    select f.lancamento_id, sum(f.valor) as total
    from (
      select b.lancamento_id, b.valor,
        case
          when b.dias is null  then 'a_vencer'
          when b.dias >= 0     then 'a_vencer'
          when b.dias >= -7    then 'v_1_7'
          when b.dias >= -15   then 'v_8_15'
          when b.dias >= -30   then 'v_16_30'
          when b.dias >= -60   then 'v_31_60'
          else                      'v_60_mais'
        end as faixa
      from parcela b
      where b.status in ('pendente', 'em_revisao', 'aprovado')
        and b.tipo_lancamento = p_tipo_lancamento
    ) f
    where p_tipo_recorte = 'aging' and f.faixa = p_faixa
    group by f.lancamento_id
  ),
  fluxo as (
    select lancamento_id, sum(liquido) as total
    from parcela
    where p_tipo_recorte = 'fluxo'
      and serie_fluxo is not null
      and (p_tipo_lancamento is null or serie_fluxo = p_tipo_lancamento)
      and (p_grupo is null or grupo_fluxo = p_grupo)
      and (p_sentido is null
           or tipo_lancamento = case p_sentido
                                  when 'entrada' then 'a_receber'
                                  when 'saida' then 'a_pagar'
                                end)
      and mes_fluxo = p_mes
      and (p_realizado is null or (status = 'pago') = p_realizado)
    group by lancamento_id
  ),
  conta_paga as (
    select b.lancamento_id, sum(b.liquido) as total
    from parcela b
    where p_tipo_recorte = 'conta_paga'
      and b.no_saldo
      and (p_conta is null or b.conta_bancaria_id = p_conta)
    group by b.lancamento_id
  )
  select lancamento_id, total from aging
  union all
  select lancamento_id, total from fluxo
  union all
  select lancamento_id, total from conta_paga
$function$;

revoke all on function public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date, text, text) from public, anon;
grant execute on function public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date, text, text) to authenticated;

-- Trava: grant e INVOKER das duas funcoes, e nenhuma sobrecarga sobrando.
do $$
declare
  f text;
begin
  foreach f in array array['fn_rel_fluxo_caixa', 'fn_lancamentos_do_recorte'] loop
    if (select count(*) from pg_proc where proname = f and pronamespace = 'public'::regnamespace) <> 1 then
      raise exception '% ficou com sobrecarga', f;
    end if;
    if not has_function_privilege('authenticated', (select oid from pg_proc where proname = f and pronamespace = 'public'::regnamespace), 'execute') then
      raise exception '% sem execute para authenticated', f;
    end if;
    if has_function_privilege('anon', (select oid from pg_proc where proname = f and pronamespace = 'public'::regnamespace), 'execute') then
      raise exception '% com execute para anon', f;
    end if;
    if (select prosecdef from pg_proc where proname = f and pronamespace = 'public'::regnamespace) then
      raise exception '% virou security definer', f;
    end if;
  end loop;
end $$;
