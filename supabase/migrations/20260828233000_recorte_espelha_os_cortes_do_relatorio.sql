-- =============================================================
-- O recorte do drill volta a espelhar o corte da RPC gemea
--
-- ============================================================
-- O QUE ESTAVA ERRADO
-- ============================================================
-- `fn_lancamentos_do_recorte` existe para uma coisa so: abrir a lista de
-- lancamentos com EXATAMENTE o conjunto que a celula clicada somou. Os tres
-- ramos dela tinham deixado de acompanhar as RPCs de relatorio, e o sintoma e
-- o pior possivel -- a lista abre sem erro nenhum mostrando outro total.
--
-- Medido em 28/08/2026, antes desta migration:
--
--   ramo `conta_paga` x fn_rel_posicao_bancaria
--     BANCO DO BRASIL 102.124-9 : celula R$    932.631,66 | lista R$ 37.308.791,61
--     BANCO DO BRASIL  30.893-5 : celula R$          0,00 | lista R$ 42.826.139,77
--     CAIXA ECONOMICA 578367973-5: celula R$         0,00 | lista R$ 13.932.904,68
--     CAIXINHA DE DINHEIRO      : celula R$      2.000,00 | lista R$  1.192.103,67
--     Faltavam DOIS cortes: o `saldo_inicial_data` da conta (a posicao so conta
--     o que passou DEPOIS do saldo inicial digitado, senao o movimento antigo
--     entra de novo por cima do saldo que ja o embute) e a exclusao de natureza
--     `movimentacao`. Faltava tambem o join com `contas_bancarias`, que na
--     posicao e INNER.
--
--   ramo `fluxo` x fn_rel_fluxo_caixa
--     33 barras divergentes, R$ 7.143.175,36 no total.
--     Faltava `coalesce(cf.natureza,'operacional') <> 'movimentacao'`.
--
--   ramo `aging` x fn_rel_aging
--     faixa a_vencer / a_pagar: celula R$ 9.941.603,46 | lista R$ 11.342.224,46
--     Diferenca de R$ 1.400.621,00, que sao 18 parcelas de "Pagamento de
--     Emprestimo" (categoria de natureza `movimentacao`).
--     Faltava a mesma exclusao.
--
-- ============================================================
-- A REGRA DESTE ARQUIVO
-- ============================================================
-- Cada ramo repete o WHERE da RPC gemea, linha por linha. Quando uma das
-- quatro mudar, esta tem de mudar junto -- e e por isso que o corte fica todo
-- num lugar so, e nao espalhado em quem chama.
--
-- Assinatura IGUAL, entao `create or replace` basta (sem drop, sem re-grant:
-- o ACL de `authenticated` sobrevive ao replace).
-- =============================================================

create or replace function public.fn_lancamentos_do_recorte(
  p_tipo_recorte text,
  p_faixa text default null,
  p_tipo_lancamento text default null,
  p_mes text default null,
  p_realizado boolean default null,
  p_conta uuid default null,
  p_hoje date default null
)
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
      p.lancamento_id,
      l.tipo as tipo_lancamento,
      p.status,
      p.valor,
      coalesce(p.valor_liquido, p.valor) as liquido,
      p.conta_bancaria_id,
      p.data_pagamento,
      -- A natureza da categoria do LANCAMENTO (nao a do rateio), que e de onde
      -- as tres RPCs de relatorio a leem.
      coalesce(cf.natureza, 'operacional') as natureza,
      p.data_vencimento - c.hoje as dias,
      case
        when p.status = 'pago'
          then to_char(coalesce(p.data_pagamento, p.data_vencimento), 'YYYY-MM')
        else to_char(coalesce(p.data_programada, p.data_vencimento), 'YYYY-MM')
      end as mes_fluxo
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    cross join corte c
    where l.status <> 'cancelado'
  ),
  -- ---------- aging: espelha fn_rel_aging ----------
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
        -- fn_rel_aging exclui movimentacao: principal de emprestimo e de
        -- aplicacao nao e conta a pagar da operacao, e a analise dele vive em
        -- Creditos.
        and b.natureza <> 'movimentacao'
    ) f
    where p_tipo_recorte = 'aging' and f.faixa = p_faixa
    group by f.lancamento_id
  ),
  -- ---------- fluxo: espelha fn_rel_fluxo_caixa ----------
  fluxo as (
    select lancamento_id, sum(liquido) as total
    from parcela
    where p_tipo_recorte = 'fluxo'
      and status <> 'cancelado'
      and mes_fluxo = p_mes
      and (status = 'pago') = p_realizado
      and natureza <> 'movimentacao'
    group by lancamento_id
  ),
  -- ---------- conta_paga: espelha fn_rel_posicao_bancaria ----------
  -- O join com contas_bancarias e INNER de proposito: e assim na posicao
  -- bancaria, e e ele que traz o `saldo_inicial_data` do corte.
  conta_paga as (
    select b.lancamento_id, sum(b.liquido) as total
    from parcela b
    join public.contas_bancarias c on c.id = b.conta_bancaria_id
    where p_tipo_recorte = 'conta_paga'
      and b.status = 'pago'
      and b.conta_bancaria_id is not null
      and b.natureza <> 'movimentacao'
      and (
        c.saldo_inicial_data is null
        or b.data_pagamento is null
        or b.data_pagamento > c.saldo_inicial_data
      )
      and (p_conta is null or b.conta_bancaria_id = p_conta)
    group by b.lancamento_id
  )
  select lancamento_id, total from aging
  union all
  select lancamento_id, total from fluxo
  union all
  select lancamento_id, total from conta_paga
$function$;

comment on function public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date) is
  'Valor de cada lancamento DENTRO de um recorte de relatorio (aging, fluxo de caixa, conta paga). Cada ramo repete o WHERE da RPC gemea (fn_rel_aging, fn_rel_fluxo_caixa, fn_rel_posicao_bancaria) para a lista abrir com o mesmo total da celula clicada.';
