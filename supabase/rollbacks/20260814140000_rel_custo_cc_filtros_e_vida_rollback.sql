-- Rollback de 20260814140000_rel_custo_cc_filtros_e_vida.sql
--
-- Derruba as duas funções novas e recria fn_rel_custo_centro_custo com a
-- assinatura ANTIGA (só p_inicio e p_fim), idêntica ao que estava antes. Depois do
-- rollback, a tela do relatório precisa voltar junto (ela passa a mandar
-- parâmetros que a função não conhece), então este rollback vai com o revert do
-- código, não sozinho.

drop function if exists public.fn_rel_custo_centro_serie(uuid, date, date);
drop function if exists public.fn_rel_custo_centro_vida(uuid);
drop function if exists public.fn_rel_custo_centro_custo(date, date, uuid, uuid, boolean, text);

create function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null
)
returns table (centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select r.centro_custo_id, cc.nome, cc.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
  group by r.centro_custo_id, cc.nome, cc.codigo
$function$;

revoke all on function public.fn_rel_custo_centro_custo(date, date) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date) to authenticated;
