-- =============================================================
-- Carretas EMT: o salário e a alimentação dos motoristas vão para as carretas
-- =============================================================
-- PEDIDO DO TIAGO (28/08/2026): "coloque tudo para as suas respectivas carretas e
-- tambem a alimentacao, o que tiver certeza aplique diretamente para a carreta e o
-- que nao tiver certeza divida entre as quatro, antes a carreta dirigida pelo
-- micharle tinha um outro motorista chamado ederson, procure para ver se tem
-- despesas no nome dele."
--
-- ============================================================
-- QUEM PAGA O SALÁRIO É O FORNECEDOR, NÃO A DESCRIÇÃO
-- ============================================================
-- A descrição do salário é sempre a mesma frase ("REFERENTE PAGAMENTO DE SALÁRIO
-- DO MÊS 07/2026"), sem nome de ninguém. Quem identifica a pessoa é o
-- `fornecedor_id`: a EMT lança o salário com o próprio colaborador no lugar do
-- fornecedor. Sem isso não haveria como separar o salário de um motorista do de
-- outro — e foi assim que os cinco nomes abaixo foram encontrados.
--
-- ============================================================
-- O PAREAMENTO SAIU DOS PRÓPRIOS DADOS
-- ============================================================
-- Cada motorista já concentrava despesa numa carreta, e são quatro motoristas para
-- quatro carretas, um em cada:
--
--   FRANCISCO FREIRE MAGALHÃES NETO ...... SQS 7E01
--   JACSON LIMA FAGUNDES ................. SQU 9C94
--   MICHARLE ROCHA DA SILVA .............. SQU 9D04
--   ROSILDO DE SOUZA MENEZES ............. SQU 9D14
--   EDERSON GUIMARÃES DE OLIVEIRA ........ SQU 9D04  (dirigia antes do Micharle)
--
-- O Ederson ele lembrou de cabeça, e a base confirmou: existe como fornecedor (não
-- como colaborador, porque saiu), com salário e vale-alimentação em 04/2026 e
-- RESCISÃO em 05/2026 — exatamente a janela em que o Micharle começa. Um entrou
-- quando o outro saiu, na mesma carreta.
--
-- ============================================================
-- O CORTE DE DATA, QUE ELE NÃO PEDIU MAS OS DADOS EXIGEM
-- ============================================================
-- Ele disse "coloque tudo". Só que o Neto trabalha na EMT desde JANEIRO DE 2025, e
-- as carretas não existiam: entre 01/2025 e 11/2025 o salário dele foi lançado no
-- Escritório Central, no 004 - Galpão Silo (03/2025) e no 007 - AC 405 (09/2025).
-- Jogar isso na SQS 7E01 poria R$ 53.687,11 de custo num caminhão que a empresa
-- ainda não tinha.
--
-- Então o corte é a data em que cada carreta aparece na base:
--   SQS 7E01 ..... 12/2025 (a multa dela, LAN-2026-2295)
--   as três SQU .. 03/2026 (os contratos PACCAR, comprados em 19/03/2026)
--
-- Na prática isso só afeta o Neto: os outros quatro começam depois de 03/2026.
-- Os R$ 53.687,11 dele de 2025 FICAM onde estão, e ele decide depois — é a mesma
-- regra que ele mesmo deu ("o que não tiver certeza"), aplicada a um caso em que a
-- evidência aponta para o contrário de mover.
--
-- ============================================================
-- O QUE VAI PARA ONDE
-- ============================================================
--   POR FORNECEDOR, direto na carreta (70 rateios, R$ 102.587,37)
--     Neto, de 12/2025 em diante ....... R$ 43.355,83 -> SQS 7E01
--     Rosildo .......................... R$ 19.143,43 -> SQU 9D14
--     Jacson ........................... R$ 18.256,95 -> SQU 9C94
--     Micharle ......................... R$ 13.000,83 -> SQU 9D04
--     Ederson .......................... R$  8.830,33 -> SQU 9D04
--
--   POR NOME NA DESCRIÇÃO, direto na carreta
--     LAN-2026-5590  R$ 99,00  "ALIMENTACAO MOTORISTA NETO FREIRE" -> SQS 7E01
--     (o fornecedor aqui é o restaurante, então só a descrição identifica)
--
--   SEM CERTEZA, divididos entre as QUATRO (R$ 1.120,00)
--     LAN-2026-1299  R$ 600,00  cartões pré-pagos da Caixa, "MOTORISTAS"
--     LAN-2026-1232  R$ 420,00  "ALIMENTACAO MOTORISTAS DAS CARRETAS"
--     LAN-2026-2570  R$ 100,00  "ALIMENTACAO DOS MOTORISTAS CARRETAS"
--   Os três falam de motorista no plural sem dizer quais, e o de R$ 600,00 pode
--   nem ser só dos de carreta. Dividir entre as quatro é o que ele pediu para
--   este caso.

do $motoristas$
declare
  v_carretas uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  e_7e01 uuid := 'af45def4-f5c9-4713-be2c-05ebd6b150d2';
  e_9c94 uuid := 'f41ceac0-89a2-4330-ab8a-0111ed55aaee';
  e_9d04 uuid := '8301d9f6-911e-42b8-af64-072d86266c9d';
  e_9d14 uuid := '728cb732-113c-4f39-a5db-a287abae20fe';
  v_quatro text[] := array['LAN-2026-1299','LAN-2026-1232','LAN-2026-2570'];
  v_sub_antes numeric; v_sub_dep numeric;
  v_geral_antes numeric; v_geral_dep numeric;
  v_fora_antes numeric; v_fora_dep numeric;
  v_entrou numeric; v_saiu numeric; v_n int; v_voltas int := 0;
  v_neto_2025 numeric;
  r record; v_parte numeric; v_acumulado numeric; v_valor_i numeric; i int;
  v_destinos uuid[];
begin
  select coalesce(round(sum(r2.valor),2),0) into v_sub_antes
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r2.valor),2),0) into v_geral_antes
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r2.valor),2),0) into v_fora_antes
  from public.lancamento_rateios r2
  join public.lancamentos l on l.id=r2.lancamento_id
  join public.centros_custo c on c.id = r2.centro_custo_id
  where l.tipo='a_pagar' and l.status<>'cancelado'
    and c.id <> v_carretas
    and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas;

  -- ---------------------------------------------------------------
  -- 1. Por fornecedor: cada motorista na carreta dele, respeitado o corte
  -- ---------------------------------------------------------------
  with pessoas as (
    select f.id,
      case f.razao_social
        when 'FRANCISCO FREIRE MAGALHÃES NETO' then e_7e01
        when 'JACSON LIMA FAGUNDES'            then e_9c94
        when 'MICHARLE ROCHA DA SILVA'         then e_9d04
        when 'EDERSON GUIMARÃES DE OLIVEIRA'   then e_9d04
        when 'ROSILDO DE SOUZA MENEZES'        then e_9d14
      end as destino,
      -- A carreta do Neto é de 12/2025; as três SQU, de 03/2026.
      case f.razao_social when 'FRANCISCO FREIRE MAGALHÃES NETO' then date '2025-12-01'
                          else date '2026-03-01' end as desde
    from public.fornecedores f
    where f.razao_social in ('FRANCISCO FREIRE MAGALHÃES NETO','JACSON LIMA FAGUNDES',
                             'MICHARLE ROCHA DA SILVA','ROSILDO DE SOUZA MENEZES',
                             'EDERSON GUIMARÃES DE OLIVEIRA')
  ),
  alvo as (
    select r2.id, p.destino
    from public.lancamento_rateios r2
    join public.lancamentos l on l.id = r2.lancamento_id
    join public.centros_custo c on c.id = r2.centro_custo_id
    join pessoas p on p.id = l.fornecedor_id
    where l.status <> 'cancelado'
      and l.mes_competencia >= p.desde
      and c.id <> v_carretas
      and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas
  )
  update public.lancamento_rateios r2 set centro_custo_id = a.destino
  from alvo a where a.id = r2.id;
  get diagnostics v_n = row_count;
  if v_n <> 70 then
    raise exception 'Movi % rateios por fornecedor e esperava 70.', v_n;
  end if;

  -- ---------------------------------------------------------------
  -- 2. O que só a descrição identifica: a alimentação do Neto Freire
  -- ---------------------------------------------------------------
  update public.lancamento_rateios r2 set centro_custo_id = e_7e01
  from public.lancamentos l
  where l.id = r2.lancamento_id and l.numero = 'LAN-2026-5590';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'O LAN-2026-5590 devia ter 1 rateio e tinha %.', v_n;
  end if;

  -- ---------------------------------------------------------------
  -- 3. Os três sem certeza: divididos entre as quatro carretas
  -- ---------------------------------------------------------------
  for r in
    select r2.id as rateio_id, r2.lancamento_id, r2.categoria_id, r2.valor, l.numero
    from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
    where l.numero = any(v_quatro)
    order by l.numero
  loop
    v_voltas := v_voltas + 1;
    v_destinos := array[e_7e01, e_9c94, e_9d04, e_9d14];
    v_parte := round(r.valor / 4, 2);
    v_acumulado := 0;
    for i in 1 .. 4 loop
      if i < 4 then v_valor_i := v_parte;
      else v_valor_i := r.valor - v_acumulado; end if;
      v_acumulado := v_acumulado + v_valor_i;
      if i = 1 then
        update public.lancamento_rateios
        set centro_custo_id = v_destinos[i], valor = v_valor_i where id = r.rateio_id;
      else
        insert into public.lancamento_rateios
          (lancamento_id, centro_custo_id, valor, categoria_id)
        values (r.lancamento_id, v_destinos[i], v_valor_i, r.categoria_id);
      end if;
    end loop;
    raise notice '%: R$ % dividido entre as quatro.',
      r.numero, to_char(r.valor,'FM999999999990.00');
  end loop;
  if v_voltas <> 3 then
    raise exception 'Dividi % documentos entre as quatro e esperava 3.', v_voltas;
  end if;

  -- ---------------------------------------------------------------
  -- PROVAS
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
    and c.id <> v_carretas
    and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas;

  -- (a) LINHA DE CONTROLE do app: mover e repartir não cria nem destrói dinheiro.
  if v_geral_antes <> v_geral_dep then
    raise exception 'O total geral mudou: R$ % -> R$ %.',
      to_char(v_geral_antes,'FM999999999990.00'), to_char(v_geral_dep,'FM999999999990.00');
  end if;

  -- (b) O que entra nas carretas é EXATAMENTE o que sai do resto do app.
  v_entrou := v_sub_dep - v_sub_antes;
  v_saiu   := v_fora_antes - v_fora_dep;
  if v_entrou <> v_saiu then
    raise exception 'Carretas ganhou R$ % e o resto perdeu R$ %.',
      to_char(v_entrou,'FM999999999990.00'), to_char(v_saiu,'FM999999999990.00');
  end if;

  -- (c) A que TEM de dar diferente de zero.
  if v_entrou <= 0 then
    raise exception 'Nada entrou nas carretas (R$ %).',
      to_char(v_entrou,'FM999999999990.00');
  end if;

  -- (d) O CORTE DO NETO TEM DE SEGURAR. O salário dele de 2025 continua fora das
  --     carretas: se o corte falhasse, este número seria zero e R$ 53 mil de
  --     custo apareceriam num caminhão que a empresa ainda não tinha.
  select coalesce(round(sum(r2.valor),2),0) into v_neto_2025
  from public.lancamento_rateios r2
  join public.lancamentos l on l.id=r2.lancamento_id
  join public.fornecedores f on f.id = l.fornecedor_id
  join public.centros_custo c on c.id = r2.centro_custo_id
  where f.razao_social = 'FRANCISCO FREIRE MAGALHÃES NETO'
    and l.mes_competencia < date '2025-12-01'
    and l.status <> 'cancelado'
    and c.id <> v_carretas
    and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas;
  if v_neto_2025 <= 0 then
    raise exception 'O salario do Neto anterior a 12/2025 sumiu de fora das carretas.';
  end if;

  -- (e) E nenhum dos cinco pode ter sobrado fora, do corte para frente.
  select count(*) into v_n
  from public.lancamento_rateios r2
  join public.lancamentos l on l.id=r2.lancamento_id
  join public.fornecedores f on f.id = l.fornecedor_id
  join public.centros_custo c on c.id = r2.centro_custo_id
  where l.status <> 'cancelado'
    and c.id <> v_carretas
    and coalesce(c.pai_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_carretas
    and ((f.razao_social = 'FRANCISCO FREIRE MAGALHÃES NETO' and l.mes_competencia >= date '2025-12-01')
      or (f.razao_social in ('JACSON LIMA FAGUNDES','MICHARLE ROCHA DA SILVA',
                             'ROSILDO DE SOUZA MENEZES','EDERSON GUIMARÃES DE OLIVEIRA')
          and l.mes_competencia >= date '2026-03-01'));
  if v_n <> 0 then
    raise exception 'Sobraram % rateios de motorista fora das carretas.', v_n;
  end if;

  -- (f) Todo documento tocado continua fechando com o valor dele.
  select count(*) into v_n from (
    select l.id
    from public.lancamentos l join public.lancamento_rateios r2 on r2.lancamento_id = l.id
    where l.numero = any(v_quatro) or l.numero = 'LAN-2026-5590'
    group by l.id, l.valor
    having round(sum(r2.valor),2) <> round(l.valor,2)
  ) t;
  if v_n <> 0 then
    raise exception '% documentos ficaram com rateio que nao fecha.', v_n;
  end if;

  raise notice 'Motoristas nas carretas: entraram R$ %. O Neto de 2025 (R$ %) ficou fora, como manda a data.',
    to_char(v_entrou,'FM999999999990.00'), to_char(v_neto_2025,'FM999999999990.00');
end $motoristas$;
