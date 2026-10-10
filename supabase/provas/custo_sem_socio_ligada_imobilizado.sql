-- Prova: centro de socio, empresa ligada e imobilizado e natureza distribuicao/
-- mutuo ficam fora dos relatorios de custo (PR 2 do controle total). Rodar em
-- begin/rollback depois das migrations de estrutura e de custo; termina com
-- raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_n int; v_rateio uuid; v_valor numeric; v_mes date;
  v_antes_mes numeric; v_depois_mes numeric; v_antes_comp numeric; v_depois_comp numeric;
  v_distrib uuid := (select id from public.categorias_financeiras where nome = 'Distribuição a sócio' and tipo = 'despesa');
begin
  -- 1. Nenhum centro de socio/ligada/imobilizado no Custo por centro de 2026.
  select count(*) into v_n
    from public.fn_rel_custo_centro_custo(date '2026-01-01', date '2026-10-01') r
    join public.centros_custo c on c.id = r.centro_custo_id
   where c.tipo in ('socio', 'empresa_ligada', 'imobilizado') and r.total <> 0;
  if v_n <> 0 then raise exception 'FALHOU 1: % centro(s) fora do custo ainda aparecem', v_n; end if;

  -- 2. Um rateio de obra virando "Distribuicao a socio" sai do custo do mes.
  select r.id, r.valor, l.mes_competencia into v_rateio, v_valor, v_mes
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
    join public.categorias_financeiras cf on cf.id = coalesce(r.categoria_id, l.categoria_id)
   where l.tipo = 'a_pagar' and l.status <> 'cancelado' and cc.nivel = 1 and cc.tipo = 'obra'
     and cf.natureza = 'operacional' and l.mes_competencia = date '2026-08-01'
   order by r.valor desc limit 1;

  select coalesce(sum(total), 0) into v_antes_mes from public.fn_rel_custo_por_mes(1, v_mes, (v_mes + interval '1 month')::date);
  select custo into v_antes_comp from public.fn_competencias_painel(13) where mes = v_mes;

  update public.lancamento_rateios set categoria_id = v_distrib where id = v_rateio;

  select coalesce(sum(total), 0) into v_depois_mes from public.fn_rel_custo_por_mes(1, v_mes, (v_mes + interval '1 month')::date);
  select custo into v_depois_comp from public.fn_competencias_painel(13) where mes = v_mes;

  if v_antes_mes - v_depois_mes <> v_valor then
    raise exception 'FALHOU 2: custo por mes caiu % em vez de %', v_antes_mes - v_depois_mes, v_valor;
  end if;
  if v_antes_comp - v_depois_comp <> v_valor then
    raise exception 'FALHOU 3: painel de competencias caiu % em vez de %', v_antes_comp - v_depois_comp, v_valor;
  end if;

  raise exception 'PROVA OK';
end
$prova$;
