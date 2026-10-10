-- Prova do relatorio Socios e ligadas (PR 2 do controle total). Mede pela
-- NATUREZA (distribuicao, mutuo), como o DRE, agrupado pelo centro raiz. Rodar
-- em begin/rollback depois das migrations; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_n int; v_env numeric; v_r uuid; v_valor numeric; v_raiz uuid; v_lanc uuid;
  v_distrib uuid := (select id from public.categorias_financeiras where nome = 'Distribuição a sócio' and tipo = 'despesa');
begin
  -- 1. Os 5 centros de socio e de empresa ligada aparecem, mesmo sem movimento.
  select count(*) into v_n from public.fn_rel_socios_ligadas(date '1990-01-01', date '1990-02-01');
  if v_n <> 5 then raise exception 'FALHOU 1: % centros no periodo vazio (esperado 5)', v_n; end if;

  -- 2. Rateio operacional em centro de socio NAO conta (o DRE tambem nao conta
  --    como distribuicao): sem reclassificar, o enviado e zero.
  select coalesce(sum(enviado), 0) into v_env from public.fn_rel_socios_ligadas(date '2025-01-01', date '2027-01-01');
  if v_env <> (select coalesce(sum(r.valor), 0) from public.lancamento_rateios r join public.lancamentos l on l.id = r.lancamento_id
                 join public.categorias_financeiras c on c.id = coalesce(r.categoria_id, l.categoria_id)
                where l.status <> 'cancelado' and l.tipo = 'a_pagar' and c.natureza in ('distribuicao', 'mutuo')
                  and l.mes_competencia >= date '2025-01-01' and l.mes_competencia < date '2027-01-01') then
    raise exception 'FALHOU 2: enviado % nao bate com a soma por natureza', v_env;
  end if;

  -- 3. Um rateio de OBRA virando distribuicao aparece, na linha da obra.
  select r.id, r.valor, l.id into v_r, v_valor, v_lanc
    from public.lancamento_rateios r join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where l.tipo = 'a_pagar' and l.status <> 'cancelado' and cc.nivel = 1 and cc.tipo = 'obra'
     and l.mes_competencia = date '2026-08-01' order by r.valor desc limit 1;
  select centro_custo_id into v_raiz from public.lancamento_rateios where id = v_r;
  update public.lancamento_rateios set categoria_id = v_distrib where id = v_r;
  select enviado into v_env from public.fn_rel_socios_ligadas(date '2026-08-01', date '2026-09-01') where centro_id = v_raiz;
  if v_env is distinct from v_valor then raise exception 'FALHOU 3: obra com distribuicao mostra % (esperado %)', v_env, v_valor; end if;

  raise exception 'PROVA OK';
end
$prova$;
