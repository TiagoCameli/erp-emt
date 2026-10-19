-- Fluxo de caixa sem a distribuicao a socios (19/10/2026).
--
-- Pedido do Tiago: socio nao aparece em relatorio nenhum, so o mutuo com as
-- empresas ligadas. A distribuicao passa a ter `grupo_fluxo` nulo, como o
-- rendimento de aplicacao: fica fora do fluxo de caixa e do drill dele. O grupo
-- `socios` continua com esse nome (o cliente no ar le a chave), mas agora so
-- tem natureza mutuo; a tela o chama de "Mutuo".
--
-- Consequencia aceita: o saldo projetado deixa de descontar as parcelas de
-- distribuicao ainda em aberto. O saldo de HOJE das contas nao muda (vem de
-- `no_saldo`, que nao olha o grupo).
--
-- So troca uma linha do CASE de `grupo_fluxo`; o resto da view e o mesmo de
-- 20261015180000, conferido contra o banco vivo em 19/10 antes de reaplicar.

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
            WHEN COALESCE(cf.natureza, 'operacional'::text) = 'distribuicao'::text THEN NULL::text
            WHEN COALESCE(cf.natureza, 'operacional'::text) = 'mutuo'::text THEN 'socios'::text
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
  'Parcelas que contam para o caixa (D1, 03/10/2026). Sem filtro de natureza. no_saldo = paga, com conta, depois do corte. serie_fluxo = serie do fluxo de caixa (legado). grupo_fluxo = operacao | investimento | socios (so mutuo) | divida | aplicacao, pela natureza; null = origem aplicacao ou natureza distribuicao, fora do fluxo (19/10/2026).';

-- Trava: distribuicao fora, mutuo dentro, grant mantido.
do $$
begin
  if exists (select 1 from public.vw_parcelas_caixa where natureza = 'distribuicao' and grupo_fluxo is not null) then
    raise exception 'distribuicao ainda tem grupo no fluxo';
  end if;
  if exists (select 1 from public.vw_parcelas_caixa where natureza = 'mutuo' and origem <> 'aplicacao' and grupo_fluxo is distinct from 'socios') then
    raise exception 'mutuo saiu do grupo socios';
  end if;
  if not has_table_privilege('authenticated', 'public.vw_parcelas_caixa', 'select') then
    raise exception 'vw_parcelas_caixa sem select para authenticated';
  end if;
end $$;
