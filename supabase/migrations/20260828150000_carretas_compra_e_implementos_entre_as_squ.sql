-- =============================================================
-- Carretas EMT: a compra das 3 carretas e os implementos vão para as três SQU
-- =============================================================
-- PEDIDO DO TIAGO (28/08/2026), olhando os 13 rateios que tinham sobrado na raiz:
-- "LAN-2026-2184 240.000,01 04/2026 COMPRA DE 3 CARRETAS / LAN-2026-1047
-- 100.000,00 03/2026 IMPLEMENTOS DAS 03 CARRETAS divida esses entre SQU 9C94
-- SQU 9D04 SQU 9D14"
--
-- Os dois diziam "3 carretas" e "03 carretas" na descrição desde sempre, mas nada
-- no documento diz QUAIS três. Ele confirmou: são as SQU. Com isso a raiz cai de
-- R$ 497.884,47 para R$ 157.884,46, e sobram 11 rateios lá.
--
-- ============================================================
-- É AQUI QUE A DIVISÃO POR DIFERENÇA GANHA O SALÁRIO DELA
-- ============================================================
-- Nas divisões anteriores (os contratos Paccar, o rodotrem, o despachante) o valor
-- calhava de dividir redondo por três, e a regra do resto ficou parecendo
-- precaução teórica. Estes dois não dividem:
--
--   240.000,01 / 3 = 80.000,0033...  ->  80.000,00 + 80.000,00 + 80.000,01
--   100.000,00 / 3 = 33.333,3333...  ->  33.333,33 + 33.333,33 + 33.333,34
--
-- Três `round(valor/3, 2)` dariam 240.000,00 e 99.999,99: um centavo a menos em
-- cada documento, e a `trg_valida_soma_do_rateio` (constraint trigger deferida)
-- recusaria a transação inteira no commit. A ÚLTIMA parte sai por diferença
-- (`valor - 2 * parte`), então a soma fecha por construção.
--
-- O centavo extra fica com a SQU 9D14 nos dois casos. Não é critério nenhum além
-- da ordem do código — com partes iguais e um centavo indivisível, alguma carreta
-- tem de ficar com ele.
--
-- ============================================================
-- COMO FICA DEPOIS
-- ============================================================
--   ...SQU9C94 - 03 ...... + R$ 113.333,33
--   ...SQU9D04 - 04 ...... + R$ 113.333,33
--   ...SQU9D14 - 05 ...... + R$ 113.333,35   (com o centavo dos dois documentos)
--   001 - Carretas EMT ... R$ 157.884,46 em 11 rateios
-- A subárvore inteira não se move: o dinheiro só desce da raiz para as etapas.

do $compra$
declare
  v_carretas uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  e_9c94 uuid := 'f41ceac0-89a2-4330-ab8a-0111ed55aaee';
  e_9d04 uuid := '8301d9f6-911e-42b8-af64-072d86266c9d';
  e_9d14 uuid := '728cb732-113c-4f39-a5db-a287abae20fe';
  v_docs text[] := array['LAN-2026-2184','LAN-2026-1047'];
  v_sub_antes numeric; v_sub_dep numeric;
  v_raiz_antes numeric; v_raiz_dep numeric;
  v_geral_antes numeric; v_geral_dep numeric;
  v_raiz_n_antes int; v_raiz_n_dep int;
  v_esperado numeric; v_saiu numeric; v_n int; v_voltas int := 0;
  r record; v_parte numeric; v_resto numeric;
begin
  -- Fotografias de ANTES: as provas comparam relações, não números que eu medi.
  select coalesce(round(sum(r2.valor),2),0) into v_sub_antes
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select count(*), coalesce(round(sum(r2.valor),2),0) into v_raiz_n_antes, v_raiz_antes
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id = v_carretas and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r2.valor),2),0) into v_geral_antes
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  -- O que os dois pesam hoje DENTRO da raiz. Medido do rateio, não de
  -- `lancamentos.valor`: o valor é do documento e o rateio na raiz podia ser uma
  -- fatia dele.
  select coalesce(round(sum(r2.valor),2),0) into v_esperado
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id = v_carretas and l.numero = any(v_docs);
  if v_esperado <= 0 then
    raise exception 'Os dois documentos nao estao mais na raiz de Carretas EMT.';
  end if;

  -- ---------------------------------------------------------------
  -- A divisão em três, com a última parte por diferença
  -- ---------------------------------------------------------------
  for r in
    select r2.id as rateio_id, r2.lancamento_id, r2.categoria_id, r2.valor, l.numero
    from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
    where r2.centro_custo_id = v_carretas and l.numero = any(v_docs)
    order by l.numero
  loop
    v_voltas := v_voltas + 1;
    v_parte := round(r.valor / 3, 2);
    v_resto := r.valor - 2 * v_parte;

    update public.lancamento_rateios
    set centro_custo_id = e_9c94, valor = v_parte where id = r.rateio_id;

    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id)
    values (r.lancamento_id, e_9d04, v_parte, r.categoria_id),
           (r.lancamento_id, e_9d14, v_resto, r.categoria_id);

    raise notice '%: R$ % vira % + % + % (resto).',
      r.numero, to_char(r.valor,'FM999999999990.00'),
      to_char(v_parte,'FM999999999990.00'), to_char(v_parte,'FM999999999990.00'),
      to_char(v_resto,'FM999999999990.00');
  end loop;
  if v_voltas <> 2 then
    raise exception 'Reparti % documentos e esperava 2.', v_voltas;
  end if;

  -- ---------------------------------------------------------------
  -- PROVAS, que abortam o apply se falharem
  -- ---------------------------------------------------------------
  select coalesce(round(sum(r2.valor),2),0) into v_sub_dep
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select count(*), coalesce(round(sum(r2.valor),2),0) into v_raiz_n_dep, v_raiz_dep
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id = v_carretas and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r2.valor),2),0) into v_geral_dep
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  -- (a) LINHA DE CONTROLE do app: repartir rateio não cria nem destrói dinheiro.
  if v_geral_antes <> v_geral_dep then
    raise exception 'O total geral mudou: R$ % -> R$ %.',
      to_char(v_geral_antes,'FM999999999990.00'), to_char(v_geral_dep,'FM999999999990.00');
  end if;

  -- (b) LINHA DE CONTROLE da árvore: nada entrou nem saiu de Carretas EMT, o
  --     dinheiro só desceu da raiz para as etapas.
  if v_sub_antes <> v_sub_dep then
    raise exception 'A subarvore de Carretas mudou: R$ % -> R$ %.',
      to_char(v_sub_antes,'FM999999999990.00'), to_char(v_sub_dep,'FM999999999990.00');
  end if;

  -- (c) A raiz perde exatamente os dois documentos, e nada além deles.
  v_saiu := v_raiz_antes - v_raiz_dep;
  if v_saiu <> v_esperado then
    raise exception 'Da raiz sairam R$ % e os dois pesavam R$ %.',
      to_char(v_saiu,'FM999999999990.00'), to_char(v_esperado,'FM999999999990.00');
  end if;
  if v_raiz_n_dep <> v_raiz_n_antes - 2 then
    raise exception 'A raiz tinha % rateios e ficou com % (esperava %).',
      v_raiz_n_antes, v_raiz_n_dep, v_raiz_n_antes - 2;
  end if;

  -- (d) A que TEM de dar diferente de zero: sem ela, (a) e (b) passariam num apply
  --     que não moveu nada.
  if v_saiu <= 0 then
    raise exception 'Nao saiu dinheiro nenhum da raiz (R$ %).',
      to_char(v_saiu,'FM999999999990.00');
  end if;

  -- (e) O CENTAVO. É a prova que este par de documentos exige e os anteriores não
  --     exigiam: os dois viram 3 rateios que TÊM de somar o valor do documento,
  --     mesmo sem dividir redondo. Se a última parte saísse por `round`, aqui
  --     apareceriam dois documentos quebrados.
  select count(*) into v_n from (
    select l.id
    from public.lancamentos l join public.lancamento_rateios r2 on r2.lancamento_id = l.id
    where l.numero = any(v_docs)
    group by l.id, l.valor
    having round(sum(r2.valor),2) <> round(l.valor,2)
  ) t;
  if v_n <> 0 then
    raise exception '% dos dois documentos ficaram com rateio que nao fecha.', v_n;
  end if;

  -- (f) E cada um virou exatamente 3 rateios, um por SQU.
  select count(*) into v_n
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.numero = any(v_docs) and r2.centro_custo_id in (e_9c94, e_9d04, e_9d14);
  if v_n <> 6 then
    raise exception 'Os dois deviam virar 6 rateios nas SQU e viraram %.', v_n;
  end if;

  raise notice 'Compra e implementos repartidos. Raiz: % rateios, R$ %.',
    v_raiz_n_dep, to_char(v_raiz_dep,'FM999999999990.00');
end $compra$;
