-- Sócios e ligadas, mês a mês e com o que ainda não saiu do caixa (15/10/2026).
--
-- `fn_rel_socios_ligadas` dá o total por centro, mas não separa o pago do que
-- está em aberto: em 15/10/2026 o "enviado" do James tinha R$ 81.584,46 que
-- ainda não tinham sido pagos, e o da Amazônia R$ 16.369,50. Esta função dá o
-- mesmo recorte (mesma árvore, mesma natureza, mesmo regime de competência),
-- quebrado por mês, com a parte em aberto ao lado.
--
-- Em aberto se mede pela PARCELA, nunca pelo status do lançamento: a fatia do
-- rateio é o valor dele vezes (parcelas abertas / parcelas não canceladas) do
-- lançamento. Aberta é a parcela que não é `pago` nem `cancelado`. A fatia é
-- arredondada POR RATEIO antes de somar, para o mês e o total fecharem entre si.
--
-- A soma de `enviado` e `devolvido` de todos os meses fecha com
-- `fn_rel_socios_ligadas` no mesmo período, ao centavo (é a mesma base).

create or replace function public.fn_rel_socios_ligadas_mensal(p_inicio date, p_fim date)
returns table(
  centro_id uuid,
  mes date,
  enviado numeric,
  enviado_aberto numeric,
  devolvido numeric,
  devolvido_aberto numeric
)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.relatorios', 'ver') then
    raise exception 'Sem permissao para ver relatorios';
  end if;
  if p_inicio is null or p_fim is null then
    raise exception 'Informe o periodo';
  end if;

  return query
    with recursive arvore as (
      select c.id, c.id as raiz_id from public.centros_custo c where c.nivel = 1
      union all
      select f.id, a.raiz_id from public.centros_custo f join arvore a on f.pai_id = a.id
    ),
    parcelas as (
      select p.lancamento_id,
             sum(p.valor) filter (where p.status <> 'cancelado') as total,
             sum(p.valor) filter (where p.status not in ('pago', 'cancelado')) as aberto
        from public.lancamento_parcelas p
       group by p.lancamento_id
    ),
    rat as (
      select a.raiz_id,
             l.mes_competencia,
             l.tipo,
             r.valor,
             round(r.valor * coalesce(pc.aberto, 0) / nullif(pc.total, 0), 2) as aberto
        from public.lancamento_rateios r
        join public.lancamentos l on l.id = r.lancamento_id
        join arvore a on a.id = r.centro_custo_id
        join public.categorias_financeiras cat on cat.id = coalesce(r.categoria_id, l.categoria_id)
        left join parcelas pc on pc.lancamento_id = l.id
       where l.status <> 'cancelado'
         and cat.natureza in ('distribuicao', 'mutuo')
         and l.mes_competencia >= date_trunc('month', p_inicio)::date
         and l.mes_competencia < p_fim
    )
    select rat.raiz_id,
           date_trunc('month', rat.mes_competencia)::date,
           coalesce(sum(rat.valor) filter (where rat.tipo = 'a_pagar'), 0),
           coalesce(sum(coalesce(rat.aberto, 0)) filter (where rat.tipo = 'a_pagar'), 0),
           coalesce(sum(rat.valor) filter (where rat.tipo = 'a_receber'), 0),
           coalesce(sum(coalesce(rat.aberto, 0)) filter (where rat.tipo = 'a_receber'), 0)
      from rat
     group by 1, 2
     order by 1, 2;
end;
$function$;

revoke execute on function public.fn_rel_socios_ligadas_mensal(date, date) from public, anon;
grant execute on function public.fn_rel_socios_ligadas_mensal(date, date) to authenticated;
