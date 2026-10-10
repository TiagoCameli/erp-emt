select r.id rateio_id, l.numero, l.tipo, to_char(l.mes_competencia,'YYYY-MM') comp, r.valor, l.descricao, coalesce(f.nome_fantasia, f.razao_social) fornecedor, cf.nome categoria, cf.natureza, cc.nome centro,
       case when upper(coalesce(f.razao_social,'')||' '||coalesce(f.nome_fantasia,'')) ~ 'TIAGO DE MELO' or upper(l.descricao) ~ 'TIAGO DE MELO CAMELI'
            then 'direto' else 'terceiro' end grupo
from lancamentos l join lancamento_rateios r on r.lancamento_id=l.id
join centros_custo cc on cc.id=r.centro_custo_id
left join categorias_financeiras cf on cf.id=coalesce(r.categoria_id,l.categoria_id)
left join fornecedores f on f.id=l.fornecedor_id
where l.status<>'cancelado' and l.tipo='a_pagar'
  and upper(coalesce(l.descricao,'')||' '||coalesce(l.observacoes,'')||' '||coalesce(f.nome_fantasia,'')||' '||coalesce(f.razao_social,'')) ~ '(^|[^N])TIAGO'
  and upper(coalesce(l.descricao,'')||' '||coalesce(f.razao_social,'')) !~ '(SANTIAGO|TIAGO DA SILVA GON)'
order by grupo, l.mes_competencia;
