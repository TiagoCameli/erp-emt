-- Socios e ligadas: Casa James deixa de existir (Tiago, 12/10/2026).
-- Os rateios dela ja tinham ido para o Socio James Castro Cameli na
-- reclassificacao; aqui vao junto os colaboradores da casa (a folha futura
-- nasce como distribuicao ao socio) e o centro do cabecalho dos lancamentos,
-- que fica igual ao do rateio. O centro e desativado e o relatorio nao
-- mostra centro de socio/ligada inativo sem movimento.

CREATE OR REPLACE FUNCTION public.fn_rel_socios_ligadas(p_inicio date, p_fim date)
 RETURNS TABLE(centro_id uuid, centro text, tipo text, ativo boolean, enviado numeric, devolvido numeric, saldo numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     -- Centro de socio/ligada inativo sem movimento no periodo nao aparece
     -- (Casa James, desativada em 12/10/2026).
     where c.nivel = 1 and ((c.tipo in ('socio', 'empresa_ligada') and c.ativo) or m.raiz_id is not null)
     order by (c.tipo in ('socio', 'empresa_ligada')) desc, c.tipo desc, c.nome;
end;
$function$;

update public.colaboradores
   set centro_custo_id = (select id from public.centros_custo where nome = 'Sócio James Castro Cameli' and nivel = 1)
 where centro_custo_id = 'dd508720-2c7a-4e22-bebe-4b80947499cf';

update public.lancamentos l
   set centro_custo_id = (select r.centro_custo_id from public.lancamento_rateios r where r.lancamento_id = l.id
                           order by r.valor desc limit 1)
 where l.centro_custo_id = 'dd508720-2c7a-4e22-bebe-4b80947499cf';

update public.centros_custo set ativo = false where id = 'dd508720-2c7a-4e22-bebe-4b80947499cf';

do $confere$
begin
  if exists (select 1 from public.colaboradores where centro_custo_id = 'dd508720-2c7a-4e22-bebe-4b80947499cf')
     or exists (select 1 from public.lancamentos where centro_custo_id = 'dd508720-2c7a-4e22-bebe-4b80947499cf')
     or exists (select 1 from public.lancamento_rateios where centro_custo_id = 'dd508720-2c7a-4e22-bebe-4b80947499cf') then
    raise exception 'Casa James ainda tem referencia';
  end if;
end $confere$;
