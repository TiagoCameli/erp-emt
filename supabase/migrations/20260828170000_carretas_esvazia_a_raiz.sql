-- =============================================================
-- Carretas EMT: os últimos da raiz vão para as placas
-- =============================================================
-- PEDIDO DO TIAGO (28/08/2026), varrendo o que tinha sobrado na raiz:
--
--   LAN-2026-2888  R$    185,00  RODIZIO CAVALO E CALIBRAGEM -> "carreta do rosildo"
--   LAN-2026-4709  R$    355,00  PASSAGEM + DESPESAS VIAGEM PEGAR CARRETAS ---.
--   LAN-2026-2386  R$    300,00  PASSAGEM RIO GREGORIO X RBR                   |
--   LAN-2026-1160  R$    193,86  REEMBOLSO DE PASSAGEM                         |
--   LAN-2026-3057  R$ 13.834,43  ABASTECIMENTO COMBUSTIVEL CARRETAS            +- as três
--   LAN-2026-3580  R$  1.993,00  COXIM DA QUINTA RODA E KIT CONVERSOR          |  mais novas
--   LAN-2026-2404  R$    625,00  HONORARIOS ART E AET FEDERAL                  |  (as SQU)
--   LAN-2026-2400  R$    500,00  ALIMENTAÇÃO VIAGEM CARRETA -------------------'
--   LAN-2026-5645  R$ 20.980,00  Manutenção EMT - Cavalo XF 530 FTT -> SQS 7E01
--   LAN-2026-0995  R$    846,78  Manutenção EMT - Meloza 1517 / Cavalo -> SQS 7E01, TODO
--   LAN-2026-2195  R$118.490,17  SEGURO DOS CAMINHÕES/CARRETAS -> entre as QUATRO
--
-- ============================================================
-- A CARRETA DO ROSILDO É A SQU 9D14, E ISSO FOI LIDO, NÃO ASSUMIDO
-- ============================================================
-- Ele disse "carreta do rosildo" sem dar placa. Fui ver o que a base diz do
-- Rosildo de Souza Menezes (um dos 4 CLT com função MOTORISTA DE CARRETA):
--
--   LAN-2026-6607  "01 VULCANIZACAO E 01 TROCA DA CARRETA SQU 9D14 - MOTORISTA ROSILDO"
--   LAN-2026-6479  "01 VULCANIZACAO CARRETA SQU 9D14 - MOTORISTA ROSILDO"
--   LAN-2026-6500  "1 CALIBRAGEM CARRETA SQS 7E01 - MOTORISTA DO DIA ROSILDO"
--
-- Duas vezes na SQU 9D14 como "motorista", e uma na SQS 7E01 como **motorista DO
-- DIA** — quem escreveu fez questão de marcar que ali ele era substituto. É a
-- terceira linha que fecha a leitura, não as duas primeiras.
--
-- ============================================================
-- "AS TRÊS MAIS NOVAS" SÃO AS SQU
-- ============================================================
-- SQU 9C94, SQU 9D04 e SQU 9D14 foram compradas em 19/03/2026 (contratos PACCAR).
-- A SQS 7E01 é anterior: a multa dela é de 12/2025 e ela não tem IPVA de primeiro
-- emplacamento em março, ao contrário das outras três. Por isso ela fica fora dos
-- sete documentos de "as três mais novas" e recebe, inteiros, os dois de
-- manutenção de 2025 — que é a mesma conclusão que ele tirou ao mandar o
-- LAN-2026-5645 (setembro de 2025) para ela.
--
-- ============================================================
-- O LAN-2026-0995 FOI DESTRAVADO POR ELE
-- ============================================================
-- Este eu tinha deixado parado na migration 20260828000000: a descrição cita dois
-- equipamentos ("Meloza 1517 / Caminhão Cavalo XF 530 FTT"), o lançamento tem um
-- rateio só, e repartir exigia uma proporção que o sistema não tem. Ele resolveu
-- por decisão, não por dado: **vai todo para a SQS 7E01**. É o único desta leva
-- que sai de Manutenção/Documentação em vez da raiz de Carretas EMT.
--
-- ============================================================
-- A PARTILHA VIROU UMA REGRA SÓ
-- ============================================================
-- Nas migrations anteriores cada grupo tinha o seu laço, porque todos dividiam
-- entre três. Aqui há grupos de 1, 3 e 4 destinos, então o laço passou a receber
-- o ARRAY de centros e repartir em N: as N-1 primeiras partes por
-- `round(valor/N, 2)` e a ÚLTIMA por diferença (`valor - acumulado`).
--
-- Isso importa nesta leva mais do que nas outras: sete dos onze documentos não
-- dividem redondo. R$ 500,00 em três daria 166,67 x 3 = 500,01 (um centavo A MAIS,
-- e não a menos), e R$ 118.490,17 em quatro daria 29.622,54 x 4 = 118.490,16. Nos
-- dois casos a `trg_valida_soma_do_rateio` recusaria a transação inteira. Com a
-- última parte por diferença, a soma fecha por construção nos dois sentidos.
--
-- ============================================================
-- SOBRA UM, E É DE PROPÓSITO
-- ============================================================
-- LAN-2026-5037 (R$ 428,00, "SERVIÇO TROCA DE BALANÇA GUERRA, PORCA E PARAFUSOS
-- CARRETA") não estava na lista dele. Fica na raiz. Depois desta migration é o
-- ÚNICO rateio lá, e a raiz vale R$ 428,00.

do $esvazia$
declare
  v_carretas uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  e_7e01 uuid := 'af45def4-f5c9-4713-be2c-05ebd6b150d2';
  e_9c94 uuid := 'f41ceac0-89a2-4330-ab8a-0111ed55aaee';
  e_9d04 uuid := '8301d9f6-911e-42b8-af64-072d86266c9d';
  e_9d14 uuid := '728cb732-113c-4f39-a5db-a287abae20fe';
  -- Os sete que ele mandou dividir entre "as três mais novas".
  v_tres text[] := array['LAN-2026-4709','LAN-2026-2386','LAN-2026-1160',
                         'LAN-2026-3057','LAN-2026-3580','LAN-2026-2404',
                         'LAN-2026-2400'];
  v_todos text[] := array['LAN-2026-2888','LAN-2026-4709','LAN-2026-2386',
                          'LAN-2026-1160','LAN-2026-3057','LAN-2026-3580',
                          'LAN-2026-2404','LAN-2026-2400','LAN-2026-5645',
                          'LAN-2026-0995','LAN-2026-2195'];
  v_sub_antes numeric; v_sub_dep numeric;
  v_geral_antes numeric; v_geral_dep numeric;
  v_raiz_n_dep int; v_raiz_dep numeric;
  v_de_fora numeric; v_entrou numeric;
  v_n int; v_voltas int := 0; v_destinos uuid[];
  r record; v_parte numeric; v_acumulado numeric; v_valor_i numeric; i int;
begin
  select coalesce(round(sum(r2.valor),2),0) into v_sub_antes
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r2.valor),2),0) into v_geral_antes
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  -- O único que vem de FORA da subárvore de Carretas EMT. A subárvore vai crescer
  -- exatamente isto, e a prova (b) confere contra este número.
  select coalesce(round(sum(r2.valor),2),0) into v_de_fora
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.numero = 'LAN-2026-0995';
  if v_de_fora <= 0 then
    raise exception 'O LAN-2026-0995 nao foi encontrado.';
  end if;

  -- ---------------------------------------------------------------
  -- A partilha: cada documento tem o seu array de destinos
  -- ---------------------------------------------------------------
  for r in
    select r2.id as rateio_id, r2.lancamento_id, r2.categoria_id, r2.valor, l.numero,
      case
        when l.numero = any(v_tres)          then array[e_9c94, e_9d04, e_9d14]
        when l.numero = 'LAN-2026-2195'      then array[e_7e01, e_9c94, e_9d04, e_9d14]
        when l.numero = 'LAN-2026-2888'      then array[e_9d14]
        else array[e_7e01]
      end as destinos
    from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
    where l.numero = any(v_todos)
    order by l.numero
  loop
    v_voltas := v_voltas + 1;
    v_destinos := r.destinos;
    v_n := array_length(v_destinos, 1);
    v_parte := round(r.valor / v_n, 2);
    v_acumulado := 0;

    for i in 1 .. v_n loop
      -- A ÚLTIMA parte é o que falta, não outro `round`: é o que faz a soma fechar
      -- quando o valor não divide redondo, para cima ou para baixo.
      if i < v_n then
        v_valor_i := v_parte;
      else
        v_valor_i := r.valor - v_acumulado;
      end if;
      v_acumulado := v_acumulado + v_valor_i;

      if i = 1 then
        -- O rateio que já existe é reaproveitado, para não perder o histórico dele.
        update public.lancamento_rateios
        set centro_custo_id = v_destinos[i], valor = v_valor_i
        where id = r.rateio_id;
      else
        insert into public.lancamento_rateios
          (lancamento_id, centro_custo_id, valor, categoria_id)
        values (r.lancamento_id, v_destinos[i], v_valor_i, r.categoria_id);
      end if;
    end loop;

    raise notice '%: R$ % repartido em % parte(s).',
      r.numero, to_char(r.valor,'FM999999999990.00'), v_n;
  end loop;

  if v_voltas <> 11 then
    raise exception 'Reparti % documentos e esperava 11.', v_voltas;
  end if;

  -- ---------------------------------------------------------------
  -- PROVAS, que abortam o apply se falharem
  -- ---------------------------------------------------------------
  select coalesce(round(sum(r2.valor),2),0) into v_sub_dep
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r2.valor),2),0) into v_geral_dep
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  select count(*), coalesce(round(sum(r2.valor),2),0) into v_raiz_n_dep, v_raiz_dep
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id = v_carretas and l.tipo='a_pagar' and l.status<>'cancelado';

  -- (a) LINHA DE CONTROLE do app: repartir rateio não cria nem destrói dinheiro.
  if v_geral_antes <> v_geral_dep then
    raise exception 'O total geral mudou: R$ % -> R$ %.',
      to_char(v_geral_antes,'FM999999999990.00'), to_char(v_geral_dep,'FM999999999990.00');
  end if;

  -- (b) A subárvore cresce EXATAMENTE o que veio de fora (o LAN-2026-0995). Todo
  --     o resto só desceu da raiz para as etapas, e não muda o total da árvore.
  v_entrou := v_sub_dep - v_sub_antes;
  if v_entrou <> v_de_fora then
    raise exception 'A subarvore cresceu R$ % e de fora veio R$ %.',
      to_char(v_entrou,'FM999999999990.00'), to_char(v_de_fora,'FM999999999990.00');
  end if;

  -- (c) A raiz fica com UM rateio só: o LAN-2026-5037, que ele não citou.
  if v_raiz_n_dep <> 1 then
    raise exception 'A raiz ficou com % rateios e eu esperava 1 (o LAN-2026-5037).',
      v_raiz_n_dep;
  end if;
  select count(*) into v_n
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id = v_carretas and l.numero <> 'LAN-2026-5037';
  if v_n <> 0 then
    raise exception 'Sobrou na raiz % rateio(s) que nao e o LAN-2026-5037.', v_n;
  end if;

  -- (d) A que TEM de dar diferente de zero: sem ela, (a) passaria num apply que
  --     não moveu nada.
  if v_entrou <= 0 then
    raise exception 'Nada entrou na subarvore (R$ %).',
      to_char(v_entrou,'FM999999999990.00');
  end if;

  -- (e) O CENTAVO, nos dois sentidos. Sete dos onze não dividem redondo: R$ 500,00
  --     em três arredondaria para MAIS (500,01) e R$ 118.490,17 em quatro para
  --     MENOS (118.490,16). Todo documento tocado tem de continuar fechando.
  select count(*) into v_n from (
    select l.id
    from public.lancamentos l join public.lancamento_rateios r2 on r2.lancamento_id = l.id
    where l.numero = any(v_todos)
    group by l.id, l.valor
    having round(sum(r2.valor),2) <> round(l.valor,2)
  ) t;
  if v_n <> 0 then
    raise exception '% dos onze documentos ficaram com rateio que nao fecha.', v_n;
  end if;

  -- (f) E o seguro virou quatro rateios, um por carreta.
  select count(*) into v_n
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.numero = 'LAN-2026-2195'
    and r2.centro_custo_id in (e_7e01, e_9c94, e_9d04, e_9d14);
  if v_n <> 4 then
    raise exception 'O seguro devia virar 4 rateios, um por carreta, e virou %.', v_n;
  end if;

  raise notice 'Raiz esvaziada: % rateio, R$ %. Subarvore: R$ %.',
    v_raiz_n_dep, to_char(v_raiz_dep,'FM999999999990.00'),
    to_char(v_sub_dep,'FM999999999990.00');
end $esvazia$;
