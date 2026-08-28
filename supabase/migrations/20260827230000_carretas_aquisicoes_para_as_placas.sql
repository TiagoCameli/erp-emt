-- =============================================================
-- Carretas EMT: as quatro aquisições saem da raiz e vão para as placas
-- =============================================================
-- O TIAGO IDENTIFICOU O QUE EU NÃO TINHA COMO SABER (27/08/2026)
--
-- Na primeira passada (migration 20260827220000) eu separei o custo das carretas
-- pela placa citada na descrição e deixei 17 lançamentos na raiz, R$ 6.261.403,56,
-- porque a descrição deles não dizia de qual carreta era. Ele voltou com a
-- resposta para os quatro maiores:
--
--   LAN-2026-2870  R$ 3.249.275,31  contrato 85901000-7, BANCO PACCAR  -> as TRÊS SQU
--   LAN-2026-1152  R$ 1.149.729,90  contrato 85907000-0, BANCO PACCAR  -> as TRÊS SQU
--   LAN-2026-2013  R$   953.848,26  DAF BRASIL, chassi 98PTTH430SB157038 -> SQS 7E01
--   LAN-2026-2862  R$   410.665,62  GUERRA IMPLEMENTOS, semirreboques   -> SQS 7E01
--
-- É informação que só o dono tinha: nenhuma das quatro descrições cita placa, e o
-- chassi do DAF não está em lugar nenhum do cadastro para eu cruzar. Era por isso
-- que estavam na raiz — e não porque a regra de leitura falhou.
--
-- ============================================================
-- OS DOIS CONTRATOS PACCAR VIRAM TRÊS RATEIOS CADA
-- ============================================================
-- Ele disse "são das placas SQU9D04 SQU9C94 SQU9D14" sem dar proporção, e o
-- contrato é de um financiamento único que cobre as três. Em partes IGUAIS, então,
-- que é a única divisão defensável sem uma nota que reparta o valor por veículo.
--
-- A divisão não confia na sorte de dividir redondo: duas partes saem por
-- `round(valor/3, 2)` e a TERCEIRA é o resto (`valor - 2*parte`). Assim a soma
-- fecha com o lançamento mesmo que o valor no banco não seja divisível por três —
-- e a `trg_valida_soma_do_rateio` (constraint trigger deferida) não tem como
-- reprovar. Nos dois casos de hoje o resto calha de ser igual às outras partes
-- (R$ 1.083.091,77 e R$ 383.243,30), mas a regra sobrevive ao dia em que não for.
--
-- O rateio que já existe é REAPROVEITADO para a primeira placa (update de valor e
-- centro) e os outros dois nascem por insert, copiando `categoria_id` do original:
-- a categoria financeira é o que decide o grupo no DRE, e um rateio novo sem ela
-- sairia do custo por categoria sem avisar ninguém.
--
-- ============================================================
-- COMO FICA CARRETAS EMT DEPOIS DISTO
-- ============================================================
--   ...SQU9D04 - 04 ...... R$ 1.484.721,50
--   ...SQU9C94 - 03 ...... R$ 1.482.275,20
--   ...SQU9D14 - 05 ...... R$ 1.478.997,62
--   ...SQS7E01 - 02 ...... R$ 1.434.563,61
--   001 - Carretas EMT ... R$   497.884,47  (13 rateios que seguem sem placa)
-- A subárvore inteira continua valendo os mesmos R$ 6.378.442,40: o dinheiro só
-- desce da raiz para as etapas. É a prova (b).

do $aquisicoes$
declare
  v_carretas uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c'; -- 001 - Carretas EMT
  e_7e01 uuid := 'af45def4-f5c9-4713-be2c-05ebd6b150d2';
  e_9c94 uuid := 'f41ceac0-89a2-4330-ab8a-0111ed55aaee';
  e_9d04 uuid := '8301d9f6-911e-42b8-af64-072d86266c9d';
  e_9d14 uuid := '728cb732-113c-4f39-a5db-a287abae20fe';
  v_sub_antes numeric; v_sub_dep numeric;
  v_geral_antes numeric; v_geral_dep numeric;
  v_raiz_antes numeric; v_raiz_dep numeric;
  v_raiz_n_antes int; v_raiz_n_dep int;
  v_n int; v_saiu numeric; v_esperado numeric;
  r record;
  v_parte numeric; v_resto numeric;
begin
  -- Fotografias de ANTES. As provas comparam RELAÇÕES, não números que eu tenha
  -- medido antes de escrever: esta base recebe lançamento o dia inteiro.
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

  -- O que os QUATRO pesam hoje dentro da raiz. Medido do rateio, e não de
  -- `lancamentos.valor`: o valor é do documento inteiro, e o rateio na raiz podia
  -- ser só uma fatia dele — comparar com o valor cheio faria a prova (c) reprovar
  -- um apply correto no dia em que um desses documentos for dividido.
  select coalesce(round(sum(r2.valor),2),0) into v_esperado
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where r2.centro_custo_id = v_carretas
    and l.numero in ('LAN-2026-2870','LAN-2026-1152','LAN-2026-2013','LAN-2026-2862');
  if v_esperado <= 0 then
    raise exception 'Os quatro lancamentos nao estao mais na raiz de Carretas EMT.';
  end if;

  -- ---------------------------------------------------------------
  -- 1. Os dois que são de UMA carreta só: o DAF e os semirreboques Guerra
  -- ---------------------------------------------------------------
  update public.lancamento_rateios r2
  set centro_custo_id = e_7e01
  from public.lancamentos l
  where l.id = r2.lancamento_id
    and r2.centro_custo_id = v_carretas
    and l.numero in ('LAN-2026-2013','LAN-2026-2862');
  get diagnostics v_n = row_count;
  if v_n <> 2 then
    raise exception 'Movi % rateios para a SQS7E01 e esperava 2 (o DAF e o Guerra).', v_n;
  end if;

  -- ---------------------------------------------------------------
  -- 2. Os dois contratos PACCAR, repartidos entre as três SQU
  -- ---------------------------------------------------------------
  for r in
    select r2.id as rateio_id, r2.lancamento_id, r2.categoria_id, r2.valor, l.numero
    from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
    where r2.centro_custo_id = v_carretas
      and l.numero in ('LAN-2026-2870','LAN-2026-1152')
    order by l.numero
  loop
    v_parte := round(r.valor / 3, 2);
    -- A terceira parte é o RESTO, não outro round: é ela que faz a soma dos três
    -- fechar com o lançamento quando o valor não divide redondo.
    v_resto := r.valor - 2 * v_parte;

    update public.lancamento_rateios
    set centro_custo_id = e_9c94, valor = v_parte
    where id = r.rateio_id;

    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id)
    values (r.lancamento_id, e_9d04, v_parte, r.categoria_id),
           (r.lancamento_id, e_9d14, v_resto, r.categoria_id);

    raise notice 'Contrato %: R$ % repartido em %, % e % (resto).',
      r.numero, to_char(r.valor,'FM999999999990.00'),
      to_char(v_parte,'FM999999999990.00'), to_char(v_parte,'FM999999999990.00'),
      to_char(v_resto,'FM999999999990.00');
  end loop;

  -- Os dois contratos tinham de ser encontrados: se um deles já tivesse saído da
  -- raiz, o laço acima rodaria menos vezes e ninguém notaria.
  select count(*) into v_n
  from public.lancamento_rateios r2 join public.lancamentos l on l.id=r2.lancamento_id
  where l.numero in ('LAN-2026-2870','LAN-2026-1152')
    and r2.centro_custo_id in (e_9c94, e_9d04, e_9d14);
  if v_n <> 6 then
    raise exception 'Os dois contratos deviam virar 6 rateios nas SQU e viraram %.', v_n;
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

  -- (a) LINHA DE CONTROLE do app inteiro: repartir rateio não cria nem destrói
  --     dinheiro. Se um insert tivesse errado o valor, é aqui que apareceria.
  if v_geral_antes <> v_geral_dep then
    raise exception 'O total geral mudou: R$ % -> R$ %.',
      to_char(v_geral_antes,'FM999999999990.00'), to_char(v_geral_dep,'FM999999999990.00');
  end if;

  -- (b) LINHA DE CONTROLE da árvore: o dinheiro só desceu da raiz para as etapas,
  --     então a subárvore de Carretas EMT vale exatamente o mesmo de antes.
  if v_sub_antes <> v_sub_dep then
    raise exception 'A subarvore de Carretas mudou: R$ % -> R$ %.',
      to_char(v_sub_antes,'FM999999999990.00'), to_char(v_sub_dep,'FM999999999990.00');
  end if;

  -- (c) A raiz perde exatamente os quatro lançamentos, e nada além deles.
  v_saiu := v_raiz_antes - v_raiz_dep;
  if v_saiu <> v_esperado then
    raise exception 'Da raiz sairam R$ % e os quatro rateios pesavam R$ %.',
      to_char(v_saiu,'FM999999999990.00'), to_char(v_esperado,'FM999999999990.00');
  end if;

  -- (d) A que TEM de dar diferente de zero: sem ela, (a) e (b) passariam num apply
  --     que não moveu nada.
  if v_saiu <= 0 then
    raise exception 'Nao saiu dinheiro nenhum da raiz (R$ %).',
      to_char(v_saiu,'FM999999999990.00');
  end if;
  if v_raiz_n_dep <> v_raiz_n_antes - 4 then
    raise exception 'A raiz tinha % rateios e ficou com % (esperava %).',
      v_raiz_n_antes, v_raiz_n_dep, v_raiz_n_antes - 4;
  end if;

  -- (e) Cada um dos quatro lançamentos continua com a soma dos rateios batendo
  --     com o valor dele. A constraint trigger já garante isso no commit, mas ela
  --     falaria em erro de sistema; aqui a mensagem diz QUAL documento quebrou.
  select count(*) into v_n from (
    select l.id
    from public.lancamentos l join public.lancamento_rateios r2 on r2.lancamento_id = l.id
    where l.numero in ('LAN-2026-2870','LAN-2026-1152','LAN-2026-2013','LAN-2026-2862')
    group by l.id, l.valor
    having round(sum(r2.valor),2) <> round(l.valor,2)
  ) t;
  if v_n <> 0 then
    raise exception '% dos quatro lancamentos ficaram com rateio que nao fecha com o valor.', v_n;
  end if;

  raise notice 'Aquisicoes distribuidas. Raiz: % rateios, R$ %. Subarvore intacta: R$ %.',
    v_raiz_n_dep, to_char(v_raiz_dep,'FM999999999990.00'),
    to_char(v_sub_dep,'FM999999999990.00');
end $aquisicoes$;
