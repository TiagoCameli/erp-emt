-- Relatorio "Socios e ligadas" (PR 2 do controle total, 10/10/2026; D3, D4).
--
-- Mede pela NATUREZA da categoria (do rateio, caindo na do lancamento; D4), do
-- mesmo jeito que o DRE: enviado = rateios a pagar de natureza distribuicao ou
-- mutuo; devolvido = a receber dessas naturezas; saldo = enviado - devolvido.
-- Agrupa pelo centro raiz. Assim o total do relatorio e o dos blocos de
-- distribuicao e mutuo do DRE sao o mesmo numero; medir pelo centro faria a
-- folha do caseiro (operacional, centro Casa James) contar aqui e nao la.
-- Todo centro de socio e de empresa ligada aparece, mesmo sem movimento e
-- inativo; centro de outro tipo aparece so se tiver rateio dessas naturezas.

create or replace function public.fn_rel_socios_ligadas(p_inicio date, p_fim date)
 returns table(centro_id uuid, centro text, tipo text, ativo boolean, enviado numeric, devolvido numeric, saldo numeric)
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
    mov as (
      select a.raiz_id,
             sum(r.valor) filter (where l.tipo = 'a_pagar') as env,
             sum(r.valor) filter (where l.tipo = 'a_receber') as dev
        from public.lancamento_rateios r
        join public.lancamentos l on l.id = r.lancamento_id
        join arvore a on a.id = r.centro_custo_id
        join public.categorias_financeiras cat on cat.id = coalesce(r.categoria_id, l.categoria_id)
       where l.status <> 'cancelado'
         and cat.natureza in ('distribuicao', 'mutuo')
         and l.mes_competencia >= date_trunc('month', p_inicio)::date
         and l.mes_competencia < p_fim
       group by a.raiz_id
    )
    select c.id, c.nome, c.tipo, c.ativo,
           round(coalesce(m.env, 0), 2), round(coalesce(m.dev, 0), 2),
           round(coalesce(m.env, 0) - coalesce(m.dev, 0), 2)
      from public.centros_custo c
      left join mov m on m.raiz_id = c.id
     where c.nivel = 1 and (c.tipo in ('socio', 'empresa_ligada') or m.raiz_id is not null)
     order by (c.tipo in ('socio', 'empresa_ligada')) desc, c.tipo desc, c.nome;
end;
$function$;

revoke execute on function public.fn_rel_socios_ligadas(date, date) from public, anon;
grant execute on function public.fn_rel_socios_ligadas(date, date) to authenticated;
