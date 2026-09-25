-- Medição de Contratos, Fase 1b, correção de revisão: mc_v_medicao_totais devolvia 0,00 quando o
-- contrato ainda não tem regra_arredondamento definida. A spec (6.2) e as demais views de cálculo
-- (mc_v_planilha_linhas, mc_v_planilha_totais, mc_v_versao_totais, mc_v_medicao_itens,
-- mc_v_item_acumulado) já devolvem nulo nesse caso: "Regra nula: valor nulo". Esta migration corrige
-- só mc_v_medicao_totais para a mesma regra, mantendo as mesmas colunas (medicao_id, contrato_id, valor).

create or replace view public.mc_v_medicao_totais with (security_invoker = true) as
select m.id as medicao_id, m.contrato_id,
       case when c.regra_arredondamento is null then null
            else round(coalesce(sum(i.valor_medicao), 0), 2)
       end as valor
from public.mc_medicoes m
join public.mc_contratos c on c.id = m.contrato_id
left join public.mc_v_medicao_itens i on i.medicao_id = m.id
group by m.id, m.contrato_id, c.regra_arredondamento;

revoke all on public.mc_v_medicao_totais from anon, authenticated;
grant select on public.mc_v_medicao_totais to authenticated;
