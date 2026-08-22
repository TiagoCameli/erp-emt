-- Prova de aceite do relatório de Custo x receita por centro de custo.
--
-- Só leitura: não cria massa e não apaga nada. Pode rodar quantas vezes quiser.
--
-- Nada de valor fixo no meio da prova: cada caso recalcula o esperado por uma
-- consulta INDEPENDENTE da função ou pela relação entre dois casos. Valor fixo
-- aqui envelheceria em uma semana, porque este banco recebe lançamento todo dia.
--
-- As LINHAS DE CONTROLE são o que dá valor ao resto. Os casos 3, 6 e 7 exigem que
-- o número MUDE quando o filtro entra; sem eles, uma função que ignorasse os
-- parâmetros passaria em todos os outros casos.
--
-- Cobre:
--   1. custo da RPC bate com a soma direta dos rateios (mesmas regras)
--   2. receita idem
--   3. CONTROLE: o filtro de natureza tira exatamente a natureza `financeira`
--   4. a retenção rateada pela fatia soma de volta a retenção dos documentos
--   5. os dois lados de centro são independentes (custo de um, receita de outro)
--   6. CONTROLE: centro sem receita dá receita ZERO quando é o lado da receita
--   7. CONTROLE: um mês só dá menos custo que todos os meses

create temp table if not exists prova_cr (
  ordem int generated always as identity,
  caso text, esperado text, obtido text, passou boolean
);
truncate prova_cr;

do $prova$
declare
  v_meses date[];
  v_obra uuid; v_equip uuid;
  v_custo numeric; v_receita numeric; v_retencao numeric;
  v_custo_direto numeric; v_receita_direta numeric; v_retencao_direta numeric;
  v_sem_natureza numeric; v_financeira numeric;
  v_um_mes numeric; v_todos numeric;
  v_a numeric; v_b numeric;
begin
  select array_agg(mes) into v_meses from public.fn_rel_meses_competencia();
  -- A obra com receita e o centro que só tem custo: é o par que mostra por que os
  -- dois lados precisam ser escolhidos separadamente.
  select id into v_obra from public.centros_custo where pai_id is null and nome ilike '009%' limit 1;
  select id into v_equip from public.centros_custo where pai_id is null and nome ilike '001%' limit 1;

  select coalesce(sum(total),0) into v_custo
  from public.fn_rel_custo_receita(v_meses) where tipo='a_pagar';
  select coalesce(sum(total),0) into v_receita
  from public.fn_rel_custo_receita(v_meses) where tipo='a_receber';

  select coalesce(sum(r.valor) filter (where l.tipo='a_pagar'),0),
         coalesce(sum(r.valor) filter (where l.tipo='a_receber'),0)
    into v_custo_direto, v_receita_direta
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.categorias_financeiras cat on cat.id = l.categoria_id
  where l.status <> 'cancelado'
    and coalesce(cat.natureza,'operacional') = 'operacional';

  insert into prova_cr(caso, esperado, obtido, passou) values
   ('1. custo da RPC bate com a soma direta dos rateios', v_custo_direto::text, v_custo::text, v_custo = v_custo_direto),
   ('2. receita da RPC bate com a soma direta dos rateios', v_receita_direta::text, v_receita::text, v_receita = v_receita_direta);

  select coalesce(sum(r.valor),0) into v_sem_natureza
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where l.status <> 'cancelado' and l.tipo='a_pagar';

  select coalesce(sum(l.valor),0) into v_financeira
  from public.lancamentos l
  join public.categorias_financeiras cat on cat.id = l.categoria_id
  where l.status <> 'cancelado' and l.tipo='a_pagar' and cat.natureza='financeira';

  insert into prova_cr(caso, esperado, obtido, passou) values
   ('3. CONTROLE: o filtro de natureza TIRA alguma coisa do custo',
    format('diferenca de %s (a natureza financeira)', v_financeira),
    (v_sem_natureza - v_custo)::text,
    v_sem_natureza - v_custo = v_financeira and v_financeira > 0);

  select coalesce(sum(retencao),0) into v_retencao
  from public.fn_rel_custo_receita(v_meses) where tipo='a_receber';

  select coalesce(sum(l.retencao_iss + l.retencao_pis + l.retencao_cofins + l.retencao_csll
                    + l.retencao_ir + l.retencao_inss + l.retencao_outras),0)
    into v_retencao_direta
  from public.lancamentos l
  left join public.categorias_financeiras cat on cat.id = l.categoria_id
  where l.status <> 'cancelado' and l.tipo='a_receber'
    and coalesce(cat.natureza,'operacional')='operacional';

  insert into prova_cr(caso, esperado, obtido, passou) values
   ('4. a retencao rateada soma de volta a retencao dos documentos', v_retencao_direta::text, v_retencao::text, v_retencao = v_retencao_direta);

  select coalesce(sum(total),0) into v_a
  from public.fn_rel_custo_receita(v_meses, array[v_equip], array[v_obra]) where tipo='a_pagar';
  select coalesce(sum(total),0) into v_b
  from public.fn_rel_custo_receita(v_meses, array[v_equip], array[v_obra]) where tipo='a_receber';

  insert into prova_cr(caso, esperado, obtido, passou) values
   ('5. custo do centro 001 com receita do centro 009: os dois vem preenchidos',
    'os dois maiores que zero', format('custo=%s receita=%s', v_a, v_b), v_a > 0 and v_b > 0);

  insert into prova_cr(caso, esperado, obtido, passou) values
   ('6. CONTROLE: o centro 001 (carretas) NAO tem receita quando ele e o lado da receita',
    'receita zero',
    (select coalesce(sum(total),0)::text from public.fn_rel_custo_receita(v_meses, array[v_equip], array[v_equip]) where tipo='a_receber'),
    (select coalesce(sum(total),0) from public.fn_rel_custo_receita(v_meses, array[v_equip], array[v_equip]) where tipo='a_receber') = 0);

  select coalesce(sum(total),0) into v_um_mes
  from public.fn_rel_custo_receita(array[v_meses[1]]) where tipo='a_pagar';
  v_todos := v_custo;

  insert into prova_cr(caso, esperado, obtido, passou) values
   ('7. CONTROLE: um mes so da MENOS custo que todos os meses',
    format('menor que %s', v_todos), v_um_mes::text, v_um_mes < v_todos and v_um_mes >= 0);
end $prova$;

select ordem, caso, esperado, obtido, passou from prova_cr order by ordem;

-- Resultado em 22/08/2026, os sete com passou = true:
--   custo R$ 53.089.291,07 e receita R$ 39.164.731,18 batendo com a soma direta
--   CONTROLE da natureza: diferença de R$ 24.199,97 (a tarifa bancária)
--   retenção rateada somando de volta R$ 2.985.761,68
--   custo do 001 R$ 6.371.748,50 contra receita do 009 R$ 31.513.205,05
--   CONTROLE: 001 como lado da receita dá 0
--   CONTROLE: um mês dá R$ 6.576,00 contra R$ 53,09 mi de todos
