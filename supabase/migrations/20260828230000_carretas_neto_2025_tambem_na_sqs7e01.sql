-- =============================================================
-- Carretas EMT: o salário do Neto em 2025 também vai para a SQS 7E01
-- =============================================================
-- PEDIDO DO TIAGO (28/08/2026): "coloque esse periodo do neto tambem nas carretas"
--
-- ============================================================
-- ISTO REVERTE UMA RESSALVA MINHA, E A DECISÃO É DELE
-- ============================================================
-- Na migration anterior (20260828210000) eu movi o salário dos cinco motoristas
-- para as carretas, mas segurei o do Neto anterior a 12/2025 e escrevi lá o
-- porquê: ele trabalha na EMT desde janeiro de 2025 e as carretas não existiam,
-- então o salário dele estava lançado no Escritório Central, no 004 - Galpão Silo
-- (03/2025) e no 007 - AC 405 (09/2025) — obras onde ele estava alocado.
--
-- Levantei a ressalva, ele repetiu o pedido. A decisão é dele e está aplicada por
-- inteiro. O que fica registrado aqui é o efeito, para quem ler o custo da SQS
-- 7E01 daqui a seis meses saber o que está olhando:
--
--   **A SQS 7E01 passa a ter R$ 53.687,11 de custo em meses em que ela não
--   aparece em lançamento nenhum da base.** A primeira menção à placa é de
--   12/2025 (a multa, LAN-2026-2295). Os 18 rateios movidos aqui são de 01/2025 a
--   11/2025.
--
-- A leitura que sustenta isso: o custo é do MOTORISTA, e o motorista é da carreta.
-- Quem quiser o custo só do período em que a carreta rodou tem o mês de
-- competência para filtrar — o dado não se perdeu, mudou de centro.
--
-- ============================================================
-- O QUE MOVE
-- ============================================================
-- Tudo que tem FRANCISCO FREIRE MAGALHÃES NETO como fornecedor e competência
-- anterior a 12/2025, esteja onde estiver:
--
--   Escritório Central ....... 12 rateios
--   004 - Galpão Silo ........  2 rateios (03/2025)
--   007 - AC 405 - Lote 2 ....  1 rateio  (09/2025)
--   009 - BR-364 .............  3 rateios (11/2025)
--   ------------------------------------------------
--   18 rateios, R$ 53.687,11 -> SQS 7E01
--
-- Depois disto não sobra NADA do Neto fora das carretas, em nenhuma data. É a
-- prova (d).

do $neto$
declare
  v_carretas uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  e_7e01 uuid := 'af45def4-f5c9-4713-be2c-05ebd6b150d2';
  v_sub_antes numeric; v_sub_dep numeric;
  v_geral_antes numeric; v_geral_dep numeric;
  v_7e01_antes numeric; v_7e01_dep numeric;
  v_esperado numeric; v_n int;
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

  -- O que ficou de fora na migration anterior, medido antes de mover.
  select coalesce(round(sum(r.valor),2),0) into v_esperado
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id
  join public.fornecedores f on f.id = l.fornecedor_id
  join public.centros_custo c on c.id = r.centro_custo_id
  where f.razao_social = 'FRANCISCO FREIRE MAGALHÃES NETO'
    and l.status <> 'cancelado'
    and c.id <> v_carretas
    and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas;
  if v_esperado <= 0 then
    raise exception 'Nao ha mais nada do Neto fora das carretas: a migration anterior ja levou tudo?';
  end if;

  update public.lancamento_rateios r
  set centro_custo_id = e_7e01
  from public.lancamentos l, public.fornecedores f, public.centros_custo c
  where l.id = r.lancamento_id
    and f.id = l.fornecedor_id
    and c.id = r.centro_custo_id
    and f.razao_social = 'FRANCISCO FREIRE MAGALHÃES NETO'
    and l.status <> 'cancelado'
    and c.id <> v_carretas
    and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas;
  get diagnostics v_n = row_count;
  if v_n <> 18 then
    raise exception 'Movi % rateios do Neto e esperava 18.', v_n;
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

  -- (b) A SQS 7E01 cresce EXATAMENTE o que foi medido antes, e a subárvore
  --     inteira cresce o mesmo tanto (nada veio de dentro das carretas).
  if (v_7e01_dep - v_7e01_antes) <> v_esperado then
    raise exception 'A SQS 7E01 cresceu R$ % e eu media R$ %.',
      to_char(v_7e01_dep - v_7e01_antes,'FM999999999990.00'),
      to_char(v_esperado,'FM999999999990.00');
  end if;
  if (v_sub_dep - v_sub_antes) <> v_esperado then
    raise exception 'A subarvore cresceu R$ % e eu media R$ %.',
      to_char(v_sub_dep - v_sub_antes,'FM999999999990.00'),
      to_char(v_esperado,'FM999999999990.00');
  end if;

  -- (c) A que TEM de dar diferente de zero.
  if v_esperado <= 0 then
    raise exception 'Nao entrou nada na SQS 7E01.';
  end if;

  -- (d) O DESFECHO: não sobra NADA do Neto fora das carretas, em nenhuma data.
  --     É o que este pedido queria dizer.
  select count(*) into v_n
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id
  join public.fornecedores f on f.id = l.fornecedor_id
  join public.centros_custo c on c.id = r.centro_custo_id
  where f.razao_social = 'FRANCISCO FREIRE MAGALHÃES NETO'
    and l.status <> 'cancelado'
    and c.id <> v_carretas
    and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas;
  if v_n <> 0 then
    raise exception 'Sobraram % rateios do Neto fora das carretas.', v_n;
  end if;

  raise notice 'O Neto esta inteiro na SQS 7E01: entraram R$ % de 01/2025 a 11/2025.',
    to_char(v_esperado,'FM999999999990.00');
end $neto$;
