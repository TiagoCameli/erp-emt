-- =============================================================
-- Carretas EMT: o último rateio sai da raiz
-- =============================================================
-- PEDIDO DO TIAGO (28/08/2026): "LAN-2026-5037 428,00 04/2026 SERVIÇO TROCA DE
-- BALANÇA GUERRA, PORCA E PARAFUSOS CARRETA para SQS 7E01"
--
-- É o único que tinha sobrado. Com ele, a raiz de 001 - Carretas EMT fica com
-- ZERO rateio, e todo o custo das carretas passa a estar numa das quatro placas.
--
-- ============================================================
-- A RAIZ FICAR VAZIA É O DESFECHO, NÃO UM PROBLEMA
-- ============================================================
-- O centro continua existindo, com as quatro etapas penduradas nele. O que muda é
-- que a `fn_rel_custo_centro_custo` deixa de devolver uma linha para "001 -
-- Carretas EMT" quando ninguém escolhe nada — ela só devolve grupo que tem
-- rateio. Quem abrir o relatório vai ver as quatro carretas e não a raiz, que é
-- exatamente a leitura que ele quis desde o primeiro pedido: custo por carreta.
--
-- Em 27/08 essa raiz valia R$ 6.261.403,56 em 17 rateios sem placa. Foram seis
-- migrations até aqui, e cada uma dependeu de uma informação que só ele tinha.
--
-- Um rateio, um destino: não há divisão, então não há centavo em jogo. O `update`
-- não toca no valor.

do $ultimo$
declare
  v_carretas uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  e_7e01 uuid := 'af45def4-f5c9-4713-be2c-05ebd6b150d2';
  v_sub_antes numeric; v_sub_dep numeric;
  v_geral_antes numeric; v_geral_dep numeric;
  v_7e01_antes numeric; v_7e01_dep numeric;
  v_raiz_n int; v_esperado numeric; v_n int;
begin
  select coalesce(round(sum(r.valor),2),0) into v_sub_antes
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r.valor),2),0) into v_geral_antes
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r.valor),2),0) into v_7e01_antes
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id = e_7e01 and l.tipo='a_pagar' and l.status<>'cancelado';

  -- Guarda: o documento tem de estar exatamente onde eu li, com um rateio só.
  select count(*), coalesce(round(sum(r.valor),2),0) into v_n, v_esperado
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where l.numero = 'LAN-2026-5037' and r.centro_custo_id = v_carretas;
  if v_n <> 1 then
    raise exception 'Esperava 1 rateio do LAN-2026-5037 na raiz e achei %.', v_n;
  end if;

  update public.lancamento_rateios r
  set centro_custo_id = e_7e01
  from public.lancamentos l
  where l.id = r.lancamento_id
    and l.numero = 'LAN-2026-5037'
    and r.centro_custo_id = v_carretas;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Movi % rateios e esperava 1.', v_n;
  end if;

  -- ---------------------------------------------------------------
  -- PROVAS
  -- ---------------------------------------------------------------
  select coalesce(round(sum(r.valor),2),0) into v_sub_dep
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r.valor),2),0) into v_geral_dep
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r.valor),2),0) into v_7e01_dep
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id = e_7e01 and l.tipo='a_pagar' and l.status<>'cancelado';

  -- (a) LINHA DE CONTROLE do app: mover rateio não cria nem destrói dinheiro.
  if v_geral_antes <> v_geral_dep then
    raise exception 'O total geral mudou: R$ % -> R$ %.',
      to_char(v_geral_antes,'FM999999999990.00'), to_char(v_geral_dep,'FM999999999990.00');
  end if;

  -- (b) LINHA DE CONTROLE da árvore: o dinheiro andou DENTRO de Carretas EMT, da
  --     raiz para uma etapa, então a subárvore não se move.
  if v_sub_antes <> v_sub_dep then
    raise exception 'A subarvore de Carretas mudou: R$ % -> R$ %.',
      to_char(v_sub_antes,'FM999999999990.00'), to_char(v_sub_dep,'FM999999999990.00');
  end if;

  -- (c) A que TEM de dar diferente: a SQS 7E01 cresce EXATAMENTE os R$ 428,00.
  --     Sem ela, (a) e (b) passariam num apply que não moveu nada.
  if (v_7e01_dep - v_7e01_antes) <> v_esperado then
    raise exception 'A SQS 7E01 cresceu R$ % e o rateio valia R$ %.',
      to_char(v_7e01_dep - v_7e01_antes,'FM999999999990.00'),
      to_char(v_esperado,'FM999999999990.00');
  end if;

  -- (d) O DESFECHO: a raiz fica sem nenhum rateio. É o que este pedido queria
  --     dizer, e é a única prova que não se repete das migrations anteriores.
  select count(*) into v_raiz_n
  from public.lancamento_rateios r
  where r.centro_custo_id = v_carretas;
  if v_raiz_n <> 0 then
    raise exception 'A raiz ficou com % rateio(s) e eu esperava nenhum.', v_raiz_n;
  end if;

  -- (e) E o documento continua fechando com o valor dele.
  select count(*) into v_n from (
    select l.id
    from public.lancamentos l join public.lancamento_rateios r on r.lancamento_id = l.id
    where l.numero = 'LAN-2026-5037'
    group by l.id, l.valor
    having round(sum(r.valor),2) <> round(l.valor,2)
  ) t;
  if v_n <> 0 then
    raise exception 'O LAN-2026-5037 ficou com rateio que nao fecha com o valor.';
  end if;

  raise notice 'A raiz de Carretas EMT esta vazia. Subarvore: R$ %, toda nas quatro placas.',
    to_char(v_sub_dep,'FM999999999990.00');
end $ultimo$;
