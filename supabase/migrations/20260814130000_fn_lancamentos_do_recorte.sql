-- Ids de lançamento e valor NA FATIA, para as fatias de nível de parcela que os
-- relatórios recortam (aging, fluxo de caixa, posição bancária).
--
-- Existe para a listagem de Lançamentos não reescrever em TypeScript a
-- classificação que já vive em fn_rel_aging (faixa por dias de atraso) e em
-- fn_rel_fluxo_caixa (mês do PAGAMENTO no realizado, mês programado no previsto).
-- Duas cópias da mesma regra divergem, e o sintoma é uma lista que abre sem erro
-- somando diferente da célula que foi clicada.
--
-- Não é hipótese: medido em 14/08/2026, 694 parcelas foram pagas em mês diferente
-- do vencimento. Um drill que mandasse faixa de vencimento erraria nessas 694.
--
-- Devolve o AGREGADO por lançamento (não a parcela), porque é disso que a
-- listagem precisa: quais lançamentos entram, e quanto de cada um está na fatia.
--
-- A medida acompanha o relatório de origem: aging soma `valor` (é dívida viva, o
-- desconto só nasce no ato do pagamento), fluxo e posição bancária somam o
-- líquido, porque foi o que passou no caixa. Igual a lancamentos/recorte.ts.
create or replace function public.fn_lancamentos_do_recorte(
  p_tipo_recorte text,
  p_faixa text default null,
  p_tipo_lancamento text default null,
  p_mes text default null,
  p_realizado boolean default null,
  p_conta uuid default null,
  p_hoje date default null
)
returns table (lancamento_id uuid, valor_no_recorte numeric)
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
      -- Mesma defesa de dinheiroDasParcelas: valor_liquido aceita nulo em parcela
      -- antiga, e aí o valor cheio é a melhor verdade disponível.
      coalesce(p.valor_liquido, p.valor) as liquido,
      p.conta_bancaria_id,
      p.data_vencimento - c.hoje as dias,
      case
        when p.status = 'pago'
          then to_char(coalesce(p.data_pagamento, p.data_vencimento), 'YYYY-MM')
        else to_char(coalesce(p.data_programada, p.data_vencimento), 'YYYY-MM')
      end as mes_fluxo
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    cross join corte c
    where l.status <> 'cancelado'
  ),
  -- Faixa de aging IDÊNTICA à de fn_rel_aging: parcela sem vencimento é
  -- 'a_vencer', e as bordas usam >= para não deixar dia nenhum entre duas faixas.
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
      and status <> 'cancelado'
      and mes_fluxo = p_mes
      and (status = 'pago') = p_realizado
    group by lancamento_id
  ),
  conta_paga as (
    select lancamento_id, sum(liquido) as total
    from parcela
    where p_tipo_recorte = 'conta_paga'
      and status = 'pago'
      and conta_bancaria_id is not null
      and (p_conta is null or conta_bancaria_id = p_conta)
    group by lancamento_id
  )
  select lancamento_id, total from aging
  union all
  select lancamento_id, total from fluxo
  union all
  select lancamento_id, total from conta_paga
$function$;

comment on function public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date) is
  'Ids e valor na fatia para os recortes de parcela (aging, fluxo, conta paga). Reusa a classificacao de fn_rel_aging e fn_rel_fluxo_caixa para o total do drill-down fechar com a celula do relatorio.';

-- Sem security definer: roda como o chamador, então a RLS de lancamentos e
-- lancamento_parcelas continua valendo. Grant explícito, anon não recebe nada.
revoke all on function public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date) from public;
grant execute on function public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date) to authenticated;
