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
-- SO ACRESCENTA, nada e trocado: a view ganha a coluna no fim, e o fluxo por
-- grupo e o drill dele sao funcoes NOVAS. `fn_rel_fluxo_caixa` e
-- `fn_lancamentos_do_recorte` ficam como estao, para o cliente no ar
-- continuar igual na janela entre migrar e publicar; saem numa limpeza depois.

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

-- O fluxo por grupo: uma linha por mes, grupo, sentido e situacao. Mesma fatia
-- de rateio de `fn_rel_fluxo_caixa` quando ha centro escolhido.
create function public.fn_rel_fluxo_caixa_por_grupo(p_centros_custo uuid[] default null::uuid[], p_centros_receita uuid[] default null::uuid[])
 returns table(mes text, grupo text, sentido text, realizado boolean, total numeric)
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
      v.grupo_fluxo as grupo,
      case when v.tipo = 'a_receber' then 'entrada' else 'saida' end as sentido,
      (v.status = 'pago') as realizado,
      v.valor_liquido as valor,
      case
        when v.tipo = 'a_pagar'
          then coalesce(cardinality(p_centros_custo), 0) > 0
        else coalesce(cardinality(p_centros_receita), 0) > 0
      end as tem_corte
    from public.vw_parcelas_caixa v
    where v.grupo_fluxo is not null
  )
  select t.mes, t.grupo, t.sentido, t.realizado, round(sum(t.valor), 2) as total
  from (
    select
      pa.mes,
      pa.grupo,
      pa.sentido,
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
  group by t.mes, t.grupo, t.sentido, t.realizado
$function$;

-- O drill do fluxo por grupo: os lancamentos de um mes, com o valor no recorte.
-- Grupo, sentido e situacao nulos trazem todos.
create function public.fn_lancamentos_do_fluxo(p_mes text, p_realizado boolean default null::boolean, p_grupo text default null::text, p_sentido text default null::text)
 returns table(lancamento_id uuid, valor_no_recorte numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select v.lancamento_id, sum(coalesce(v.valor_liquido, v.valor))
  from public.vw_parcelas_caixa v
  where v.grupo_fluxo is not null
    and to_char(v.mes_fluxo, 'YYYY-MM') = p_mes
    and (p_grupo is null or v.grupo_fluxo = p_grupo)
    and (p_sentido is null
         or v.tipo = case p_sentido
                       when 'entrada' then 'a_receber'
                       when 'saida' then 'a_pagar'
                     end)
    and (p_realizado is null or (v.status = 'pago') = p_realizado)
  group by v.lancamento_id
$function$;

revoke all on function public.fn_rel_fluxo_caixa_por_grupo(uuid[], uuid[]) from public, anon;
grant execute on function public.fn_rel_fluxo_caixa_por_grupo(uuid[], uuid[]) to authenticated;
revoke all on function public.fn_lancamentos_do_fluxo(text, boolean, text, text) from public, anon;
grant execute on function public.fn_lancamentos_do_fluxo(text, boolean, text, text) to authenticated;

-- Trava: grant, INVOKER e nenhuma sobrecarga.
do $$
declare
  f text;
begin
  foreach f in array array['fn_rel_fluxo_caixa_por_grupo', 'fn_lancamentos_do_fluxo'] loop
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
