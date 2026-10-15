-- Ranking de fornecedores do "Extrato por fornecedor" (15/10/2026).
--
-- Sem fornecedor escolhido, a tela carregava 6.710 lançamentos em páginas de
-- 1000 e filtrava no navegador, sem resposta para "a quem devo mais?". Esta
-- função agrega no banco, uma linha por fornecedor (e uma para os lançamentos
-- sem fornecedor, 198 em 15/10/2026):
--
--   comprado      soma do documento (valor do lançamento) cujo mês de
--                 referência cai no período. Competência.
--   pago          parcelas pagas com data de pagamento no período, pelo
--                 LÍQUIDO (o que saiu da conta). Caixa.
--   em_aberto     parcelas não pagas nem canceladas, HOJE (posição, não
--                 período), pelo valor da parcela.
--   vencido       a parte do em aberto com vencimento antes de hoje.
--   proximos_30   a parte do em aberto que vence de hoje a 30 dias.
--
-- As regras de aberto, vencido e pago líquido são as mesmas de
-- `abertoPorPrazo` e `pagoDasParcelas` (financeiro/_shared/prazo.ts), que o
-- extrato de um fornecedor usa: o ranking e o drill fecham entre si. Hoje é a
-- data de Rio Branco.
--
-- Período nulo nas duas pontas = desde o início. Fim exclusivo, como as outras
-- fn_rel_*. SECURITY INVOKER: enxerga o que a RLS de lançamentos deixa, igual
-- ao extrato que ela substitui.

create or replace function public.fn_rel_fornecedores_ranking(p_inicio date default null, p_fim date default null)
returns table(
  fornecedor_id uuid,
  nome text,
  lancamentos bigint,
  comprado numeric,
  pago numeric,
  em_aberto numeric,
  vencido numeric,
  proximos_30 numeric
)
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  if not public.tem_permissao('financeiro.relatorios', 'ver') then
    raise exception 'Sem permissao para ver relatorios';
  end if;

  return query
    with lanc as (
      select l.id, l.fornecedor_id, l.valor, l.mes_competencia
        from public.lancamentos l
       where l.tipo = 'a_pagar'
         and l.status <> 'cancelado'
    ),
    doc as (
      select lanc.fornecedor_id,
             count(*) filter (
               where (p_inicio is null or lanc.mes_competencia >= date_trunc('month', p_inicio)::date)
                 and (p_fim is null or lanc.mes_competencia < p_fim)
             ) as lancamentos,
             coalesce(sum(lanc.valor) filter (
               where (p_inicio is null or lanc.mes_competencia >= date_trunc('month', p_inicio)::date)
                 and (p_fim is null or lanc.mes_competencia < p_fim)
             ), 0) as comprado
        from lanc
       group by lanc.fornecedor_id
    ),
    par as (
      select lanc.fornecedor_id,
             coalesce(sum(coalesce(p.valor_liquido, p.valor)) filter (
               where p.status = 'pago'
                 and (p_inicio is null or p.data_pagamento >= p_inicio)
                 and (p_fim is null or p.data_pagamento < p_fim)
             ), 0) as pago,
             coalesce(sum(p.valor) filter (where p.status not in ('pago', 'cancelado')), 0) as em_aberto,
             coalesce(sum(p.valor) filter (
               where p.status not in ('pago', 'cancelado') and p.data_vencimento < v_hoje
             ), 0) as vencido,
             coalesce(sum(p.valor) filter (
               where p.status not in ('pago', 'cancelado')
                 and p.data_vencimento >= v_hoje
                 and p.data_vencimento <= v_hoje + 30
             ), 0) as proximos_30
        from lanc
        join public.lancamento_parcelas p on p.lancamento_id = lanc.id
       group by lanc.fornecedor_id
    )
    select doc.fornecedor_id,
           coalesce(f.nome_fantasia, f.razao_social, 'Sem fornecedor')::text,
           doc.lancamentos,
           doc.comprado,
           coalesce(par.pago, 0),
           coalesce(par.em_aberto, 0),
           coalesce(par.vencido, 0),
           coalesce(par.proximos_30, 0)
      from doc
      left join par on par.fornecedor_id is not distinct from doc.fornecedor_id
      left join public.fornecedores f on f.id = doc.fornecedor_id
     -- Some quem não tem nada a dizer no recorte: nada comprado, nada pago e
     -- nada em aberto.
     where doc.comprado <> 0 or coalesce(par.pago, 0) <> 0 or coalesce(par.em_aberto, 0) <> 0
     order by coalesce(par.em_aberto, 0) desc, doc.comprado desc, doc.fornecedor_id;
end;
$function$;

revoke execute on function public.fn_rel_fornecedores_ranking(date, date) from public, anon;
grant execute on function public.fn_rel_fornecedores_ranking(date, date) to authenticated;
