-- =============================================================
-- Carretas EMT: o custo espalhado pelos outros centros volta para as placas
-- =============================================================
-- PEDIDO DO TIAGO (28/08/2026), depois de ler a varredura que eu tinha entregue:
-- "pode Mover os 185 confirmados pela placa, para esse DUPLICATAS DA COMPRA DOS
-- RODOTREM divida entre SQU 9D14 SQU9D04 SQU9C94, esse aqui LAN-2026-1281 e da
-- SQS 7E01, DESPACHANTE: EMPLACAMENTOS E PLACAS DE 03 CAVALOS E 9 IMPLEMENTOS
-- divida entre SQU 9D14 SQU9D04 SQU9C94, RECAPAGEM DOS 4 PNEUS DA CARRETA DO NETO
-- (...) para o SQS 7E01, e todos esses (...) para o SQS 7E01 so a parte do rateio
-- dele."
--
-- ============================================================
-- ISTO TIRA CUSTO DE OUTROS CENTROS, DE PROPÓSITO
-- ============================================================
-- Não é uma arrumação dentro de Carretas EMT: R$ 310.339,23 saem de quatro
-- centros e entram nas quatro carretas. O maior efeito é na obra:
--
--   009 - BR-364 Lote 09 & 10 .......... perde R$  63.839,91
--   Aquisição de Equipamentos .......... perde R$ 211.344,01
--   Escritório Central ................. perde R$  25.425,31
--   Manutenção/Documentação ............ perde R$   9.730,00
--
-- O custo da BR-364 cai R$ 63.839,91 e o das carretas sobe o mesmo tanto. Ele
-- sabe: a varredura mostrou esse número antes de ele mandar mover.
--
-- ============================================================
-- O QUE VAI PARA ONDE
-- ============================================================
-- 1. PLACA ÚNICA na descrição (182 rateios): cada um para a etapa da placa dele.
--    É a regra da migration 20260827220000, agora aplicada fora de Carretas EMT.
--
-- 2. DUAS PLACAS (3 rateios, todos SQU 9C94 + SQS 7E01): metade para cada, porque
--    o rateio é um só e o documento cobre as duas. É a mesma regra que ele mandou
--    usar no rodotrem e no despachante — quando o documento é de N carretas,
--    divide entre elas.
--      LAN-2026-2089  R$ 9.367,23  ABASTECIMENTO DIESEL PLACAS: SQU 9C94 E SQS 7E01
--      LAN-2026-2836  R$   275,00  02 VULCANIZACAO E 01 TROCA CARRETA SQU 9C94 E SQS 7E01
--      LAN-2026-5391  R$   240,00  02 VULCANIZAÇÃO CARRETAS SQS 7E01 E SQU 9C94
--
-- 3. DIVIDIDOS ENTRE AS TRÊS SQU, por ordem dele:
--      LAN-2026-5754  R$ 210.945,55  DUPLICATAS DA COMPRA DOS RODOTREM
--      LAN-2026-3647  R$   4.050,00  DESPACHANTE: EMPLACAMENTOS E PLACAS DE 03
--                                    CAVALOS E 9 IMPLEMENTOS
--
-- 4. INTEIROS PARA A SQS 7E01, por ordem dele:
--      LAN-2026-1281  R$ 7.870,00  Manutenção Equipamentos EMT - Cavalo XF 530 FTT
--      LAN-2026-3189  R$ 3.050,00  RECAPAGEM DOS 4 PNEUS DA CARRETA DO NETO
--      LAN-2026-3838  R$   820,00  Manutenção Equipamentos EMT - Cavalo XF 530 FTT
--      LAN-2026-4523  R$   630,00  Manutenção Equipamentos EMT - Cavalo XF 530 FTT
--      LAN-2026-2929  R$   320,00  MANUTENCAO DO CAMINHAO CAVALO XF 530 FTT
--
-- ============================================================
-- O QUE FICOU DE FORA, E POR QUÊ
-- ============================================================
-- LAN-2026-0995 (R$ 846,78, "Manutenção Equipamentos EMT - Meloza 1517 / Caminhão
-- Cavalo XF 530 FTT"). Ele mandou mover "só a parte do rateio dele" — e não existe
-- parte: o lançamento tem UM rateio só, de R$ 846,78, cobrindo a Meloza e o cavalo
-- juntos. Repartir exige uma proporção que nenhum dado do sistema tem (é manual,
-- sem OC, e o fornecedor é uma distribuidora de combustível). Meio a meio seria
-- chute, e chute em dinheiro é o que esta base não perdoa. Fica onde está até ele
-- dizer a divisão.
--
-- Divisão em partes iguais, aqui e nos itens 2 e 3: duas partes por
-- `round(valor/N, 2)` e a ÚLTIMA por diferença, para a soma fechar com o documento
-- mesmo quando não divide redondo. É o que mantém a `trg_valida_soma_do_rateio`
-- satisfeita sem depender de sorte.

do $recolhe$
declare
  v_carretas uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  e_7e01 uuid := 'af45def4-f5c9-4713-be2c-05ebd6b150d2';
  e_9c94 uuid := 'f41ceac0-89a2-4330-ab8a-0111ed55aaee';
  e_9d04 uuid := '8301d9f6-911e-42b8-af64-072d86266c9d';
  e_9d14 uuid := '728cb732-113c-4f39-a5db-a287abae20fe';
  v_sub_antes numeric; v_sub_dep numeric;
  v_geral_antes numeric; v_geral_dep numeric;
  v_fora_antes numeric; v_fora_dep numeric;
  v_n int; v_entrou numeric; v_saiu numeric;
  r record; v_parte numeric; v_resto numeric; v_duas int := 0;
  -- Os cinco que vão inteiros para a SQS 7E01, e os dois repartidos entre as SQU.
  v_para_7e01 text[] := array['LAN-2026-1281','LAN-2026-3189','LAN-2026-3838',
                              'LAN-2026-4523','LAN-2026-2929'];
  v_entre_squ text[] := array['LAN-2026-5754','LAN-2026-3647'];
begin
  -- Fotografias de ANTES: as provas comparam relações, não números que eu medi.
  select coalesce(round(sum(r2.valor),2),0) into v_sub_antes
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r2.valor),2),0) into v_geral_antes
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  -- O que os quatro centros de origem somam hoje. É contra isto que a prova (b)
  -- confere: o que entra nas carretas tem de ser o que sai daqui.
  select coalesce(round(sum(r2.valor),2),0) into v_fora_antes
  from public.lancamento_rateios r2
  join public.lancamentos l on l.id=r2.lancamento_id
  join public.centros_custo c on c.id = r2.centro_custo_id
  where l.tipo='a_pagar' and l.status<>'cancelado'
    and c.nome in ('009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',
                   'Escritório Central', 'Aquisição de Equipamentos',
                   'Manutenção/Documentação de Equipamentos');

  -- ---------------------------------------------------------------
  -- 1. Placa única: cada rateio para a etapa da placa dele
  -- ---------------------------------------------------------------
  with base as (
    select r2.id, r2.centro_custo_id,
           upper(replace(replace(coalesce(l.descricao,'')||' '||coalesce(l.observacoes,'')
                 ||' '||coalesce(l.numero_documento,''),' ',''),'-','')) as d
    from public.lancamento_rateios r2
    join public.lancamentos l on l.id = r2.lancamento_id
    join public.centros_custo c on c.id = r2.centro_custo_id
    where l.status <> 'cancelado'
      and c.id <> v_carretas
      and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas
  ),
  alvo as (
    select id,
      case when d like '%SQS7E01%' then e_7e01
           when d like '%SQU9C94%' then e_9c94
           when d like '%SQU9D04%' then e_9d04
           else e_9d14 end as destino
    from base
    where (d like '%SQS7E01%')::int + (d like '%SQU9C94%')::int
        + (d like '%SQU9D04%')::int + (d like '%SQU9D14%')::int = 1
  )
  update public.lancamento_rateios r2 set centro_custo_id = a.destino
  from alvo a where a.id = r2.id;
  get diagnostics v_n = row_count;
  if v_n <> 182 then
    raise exception 'Movi % rateios de placa unica e esperava 182.', v_n;
  end if;

  -- ---------------------------------------------------------------
  -- 2. Duas placas (SQU 9C94 + SQS 7E01): metade para cada
  -- ---------------------------------------------------------------
  for r in
    select r2.id as rateio_id, r2.lancamento_id, r2.categoria_id, r2.valor, l.numero
    from public.lancamento_rateios r2
    join public.lancamentos l on l.id=r2.lancamento_id
    join public.centros_custo c on c.id = r2.centro_custo_id
    where l.status <> 'cancelado'
      and c.id <> v_carretas
      and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas
      and upper(replace(replace(coalesce(l.descricao,'')||' '||coalesce(l.observacoes,'')
            ||' '||coalesce(l.numero_documento,''),' ',''),'-','')) like '%SQU9C94%'
      and upper(replace(replace(coalesce(l.descricao,'')||' '||coalesce(l.observacoes,'')
            ||' '||coalesce(l.numero_documento,''),' ',''),'-','')) like '%SQS7E01%'
    order by l.numero
  loop
    v_duas := v_duas + 1;
    v_parte := round(r.valor / 2, 2);
    v_resto := r.valor - v_parte;
    update public.lancamento_rateios
    set centro_custo_id = e_9c94, valor = v_parte where id = r.rateio_id;
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id)
    values (r.lancamento_id, e_7e01, v_resto, r.categoria_id);
    raise notice 'Duas placas em %: R$ % vira % (9C94) + % (7E01).',
      r.numero, to_char(r.valor,'FM999999999990.00'),
      to_char(v_parte,'FM999999999990.00'), to_char(v_resto,'FM999999999990.00');
  end loop;
  if v_duas <> 3 then
    raise exception 'Achei % rateios de duas placas e esperava 3.', v_duas;
  end if;

  -- ---------------------------------------------------------------
  -- 3. Rodotrem e despachante: divididos entre as três SQU
  -- ---------------------------------------------------------------
  for r in
    select r2.id as rateio_id, r2.lancamento_id, r2.categoria_id, r2.valor, l.numero
    from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
    where l.numero = any(v_entre_squ)
    order by l.numero
  loop
    v_parte := round(r.valor / 3, 2);
    v_resto := r.valor - 2 * v_parte;
    update public.lancamento_rateios
    set centro_custo_id = e_9c94, valor = v_parte where id = r.rateio_id;
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id)
    values (r.lancamento_id, e_9d04, v_parte, r.categoria_id),
           (r.lancamento_id, e_9d14, v_resto, r.categoria_id);
    raise notice 'Entre as tres SQU em %: R$ % vira %, % e %.',
      r.numero, to_char(r.valor,'FM999999999990.00'),
      to_char(v_parte,'FM999999999990.00'), to_char(v_parte,'FM999999999990.00'),
      to_char(v_resto,'FM999999999990.00');
  end loop;

  select count(*) into v_n
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.numero = any(v_entre_squ) and r2.centro_custo_id in (e_9c94, e_9d04, e_9d14);
  if v_n <> 6 then
    raise exception 'O rodotrem e o despachante deviam virar 6 rateios nas SQU e viraram %.', v_n;
  end if;

  -- ---------------------------------------------------------------
  -- 4. Os cinco inteiros para a SQS 7E01
  -- ---------------------------------------------------------------
  update public.lancamento_rateios r2 set centro_custo_id = e_7e01
  from public.lancamentos l
  where l.id = r2.lancamento_id and l.numero = any(v_para_7e01);
  get diagnostics v_n = row_count;
  if v_n <> 5 then
    raise exception 'Movi % rateios para a SQS7E01 e esperava 5.', v_n;
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

  select coalesce(round(sum(r2.valor),2),0) into v_fora_dep
  from public.lancamento_rateios r2
  join public.lancamentos l on l.id=r2.lancamento_id
  join public.centros_custo c on c.id = r2.centro_custo_id
  where l.tipo='a_pagar' and l.status<>'cancelado'
    and c.nome in ('009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',
                   'Escritório Central', 'Aquisição de Equipamentos',
                   'Manutenção/Documentação de Equipamentos');

  -- (a) LINHA DE CONTROLE do app inteiro: mover e repartir rateio não cria nem
  --     destrói dinheiro. Um insert com valor errado apareceria aqui.
  if v_geral_antes <> v_geral_dep then
    raise exception 'O total geral mudou: R$ % -> R$ %.',
      to_char(v_geral_antes,'FM999999999990.00'), to_char(v_geral_dep,'FM999999999990.00');
  end if;

  -- (b) O que entrou nas carretas é EXATAMENTE o que saiu dos quatro centros.
  v_entrou := v_sub_dep - v_sub_antes;
  v_saiu   := v_fora_antes - v_fora_dep;
  if v_entrou <> v_saiu then
    raise exception 'Carretas ganhou R$ % e os quatro centros perderam R$ %.',
      to_char(v_entrou,'FM999999999990.00'), to_char(v_saiu,'FM999999999990.00');
  end if;

  -- (c) A que TEM de dar diferente de zero: sem ela, (a) e (b) passariam intactas
  --     num apply que não moveu nada.
  if v_entrou <= 0 then
    raise exception 'Nao entrou dinheiro nenhum nas carretas (R$ %).',
      to_char(v_entrou,'FM999999999990.00');
  end if;

  -- (d) Não pode sobrar rateio com placa fora da subárvore de Carretas EMT.
  --     É a prova de que a varredura recolheu tudo o que dizia recolher.
  select count(*) into v_n
  from public.lancamento_rateios r2
  join public.lancamentos l on l.id=r2.lancamento_id
  join public.centros_custo c on c.id = r2.centro_custo_id
  where l.status <> 'cancelado'
    and c.id <> v_carretas
    and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas
    and upper(replace(replace(coalesce(l.descricao,'')||' '||coalesce(l.observacoes,'')||' '||coalesce(l.numero_documento,''),' ',''),'-','')) ~ 'SQS7E01|SQU9C94|SQU9D04|SQU9D14';
  if v_n <> 0 then
    raise exception 'Sobraram % rateios com placa fora de Carretas EMT.', v_n;
  end if;

  -- (e) Todo documento tocado continua com a soma dos rateios batendo com o valor
  --     dele. A constraint trigger garantiria isso no commit, mas em erro de
  --     sistema; aqui a mensagem diz quantos documentos quebraram.
  select count(*) into v_n from (
    select l.id
    from public.lancamentos l
    join public.lancamento_rateios r2 on r2.lancamento_id = l.id
    where l.numero = any(v_para_7e01) or l.numero = any(v_entre_squ)
       or l.numero in ('LAN-2026-2089','LAN-2026-2836','LAN-2026-5391')
    group by l.id, l.valor
    having round(sum(r2.valor),2) <> round(l.valor,2)
  ) t;
  if v_n <> 0 then
    raise exception '% documentos ficaram com rateio que nao fecha com o valor.', v_n;
  end if;

  raise notice 'Custo recolhido: R$ % entraram nas carretas, saidos dos quatro centros.',
    to_char(v_entrou,'FM999999999990.00');
end $recolhe$;
