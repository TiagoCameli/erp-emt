-- Rollback de 20260814150000_rel_custo_cc_uniao_das_sobrecargas.sql
--
-- Volta para a função que o painel de Gestão precisa (4 parâmetros), e NÃO recria a
-- de 6: recriar as duas traria de volta a ambiguidade que a 150000 consertou.
--
-- Este rollback é o do relatório do Financeiro voltando atrás. Se ele rodar, a tela
-- de Custo por centro de custo tem que voltar junto (ela manda p_fornecedor,
-- p_excluir_previsto e p_tipo_centro, que a de 4 não conhece), enquanto o painel de
-- Gestão continua funcionando.

drop function if exists public.fn_rel_custo_centro_custo(date, date, uuid, uuid, uuid, boolean, text);

create function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null
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
    and (p_centro_custo is null or r.centro_custo_id = p_centro_custo)
    and (p_categoria is null or l.categoria_id = p_categoria)
  group by r.centro_custo_id, cc.nome, cc.codigo
$function$;

revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid) to authenticated;
