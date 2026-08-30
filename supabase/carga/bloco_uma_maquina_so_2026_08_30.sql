-- Esvazia o bloco "a palavra so pode ser uma maquina" da raiz da Manutencao.
--
-- Aplicado no banco em 30/08/2026, depois de
-- `duas_maquinas_meio_a_meio_2026_08_30.sql`.
--
-- ## A regra, dita pelo Tiago
--
-- "tudo que tem MELOZA 1517 e meloza 113 sao da meloza da emt, o resto e meloza
-- da colorado entao manutencao de equipamento colorado. o munck e tudo da emt,
-- telescopio tambem, tracker betoneira, laboratorio e palio tambem."
--
-- ## A meloza tem duas donas, e so o MODELO separa
--
-- Das 16 da raiz, oito dizem 1517 ou 113 (da EMT) e seis nao dizem modelo
-- nenhum (da Colorado). Uma delas escreve a resposta sozinha: "LIMPEZA NA MELOZA
-- COLORADO OBRA BR364". As outras duas citam quatro maquinas cada e ficaram.
--
-- E a segunda vez que uma "palavra unica" se revela de duas donas: a vibro foi a
-- primeira, ontem. A licao e que "so existe uma maquina desse tipo NA FROTA" nao
-- e o mesmo que "so existe uma maquina desse tipo NA OBRA" -- a Colorado tem
-- equipamento que nunca entrou no cadastro da EMT.
--
-- ## Cinco dos 35 citavam outra coisa, e a leitura pegou
--
--   LAN-2026-0392  R$   325,00  "FRETE DAS PECAS DA RETROESCAVADEIRA 02 E
--                  LABORATORIO GREGORIO"
--                  Duas maquinas, as duas da EMT, e a retro vem com NUMERO.
--                  Meio a meio pela regra de ontem: R$ 162,50 para cada.
--                  E o primeiro dinheiro que uma retroescavadeira recebe.
--
-- Os outros quatro ficam na raiz, porque citam TRES ou mais, ou citam maquina
-- que nao existe:
--
--   LAN-2026-1933  R$   475,28  Munck + "Cacamba 2425/48" -- e a cacamba 2425/48
--                  sao TRES maquinas, entao meio a meio nao diz qual.
--   LAN-2026-2492  R$ 4.000,00  Munck + "TRATOR DE PNEU" -- o trator de pneu e o
--                  BX6180, que nao esta na frota.
--   LAN-2026-5774  R$ 3.902,46  Munck + duas cacambas (109 e 110).
--   LAN-2026-4929  R$   120,00  Munck + rolo pe de carneiro + "ROLO CHAPA
--                  COLORADO".
--
-- ## Um detalhe do cadastro que vale registrar
--
-- Dez lancamentos escrevem "CAMINHAO MUCK L1318/50" e um escreve "MUCK L 1620".
-- A frota tem UM munck, o L 1620. O L1318/50 e o modelo da Caminhao Pipa CP-002
-- -- e foi exatamente por isso que o token `L131850` deu falso positivo em
-- 28/08. Aqui nao houve duvida: o Tiago disse que munck e tudo da EMT.
--
-- ## Uma checagem errada que salvou a operacao
--
-- A primeira versao conferia "as metades do 0392 somam R$ 325,00" e falhou. Nao
-- era o dado: o lancamento inteiro e R$ 514,49, porque ja tinha um SEGUNDO
-- rateio de R$ 189,49 na obra 009. A checagem estava errada, e foi ela que me
-- fez olhar antes de aplicar. Linha de controle que so confirma o que voce ja
-- acha nao serve para nada.
--
-- ## Resultado
--
--   raiz da Manutencao:  R$ 1.112.943,42 -> R$ 1.062.032,49  (793 -> 748 lanc.)
--   Colorado:            R$   253.361,32 -> R$   259.103,32
--   subarvore da Manutencao: caiu EXATAMENTE os R$ 5.742,00 da meloza da
--                            Colorado. Todo o resto ficou dentro.

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  COLORADO uuid := '891f3c63-f7e5-49fb-a97c-9c99deeadc2b';
  LAB uuid := '81081000-4c66-441d-933c-0d98f7598c79';
  RT02 uuid := 'a1b86608-7314-4126-b6c5-3dd3118a278e';
  MUNCK uuid := 'f814cb00-a3cd-4bae-a8b7-dc400cd52e20';
  TELES uuid := '65e52b5f-f73b-4a91-a7b1-f8bcb468f625';
  TRACK uuid := 'e842df8f-66d2-423c-8d5f-131263a5c638';
  BETON uuid := '56067493-d147-4e9a-9cd5-8c77c7f3e9c2';
  PALIO uuid := '69b1a57e-e65e-490d-b170-11033b324501';
  MELOZA uuid := 'afd2f665-0090-4224-b89d-c61ed3c035bb';
  v_t int; v_mov int := 0; v_ins int;
  v_raiz_a numeric; v_raiz_d numeric; v_col_a numeric; v_col_d numeric;
  v_sub_a numeric; v_sub_d numeric; v_tipo_a jsonb; v_tipo_d jsonb;
  v_div int; v_lin_a int; v_lin_d int; v_cat_a uuid; v_cat_ruim int; v_soma numeric;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_col_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select r.categoria_id into v_cat_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id where l.numero='LAN-2026-0392' and r.centro_custo_id=MANUT;

  -- Um UPDATE por destino. Cada um e um statement que NAO muda a soma do
  -- rateio, entao trg_valida_soma_do_rateio passa sem reclamar.
  update public.lancamento_rateios r set centro_custo_id = MUNCK from public.lancamentos l
  where l.id=r.lancamento_id and r.centro_custo_id=MANUT and l.numero = any(array[
    'LAN-2026-0459','LAN-2026-3702','LAN-2026-5409','LAN-2026-3787','LAN-2026-1223','LAN-2026-4636',
    'LAN-2026-0028','LAN-2026-4509','LAN-2026-1668','LAN-2026-4261','LAN-2026-2251','LAN-2026-5365',
    'LAN-2026-0453','LAN-2026-3883','LAN-2026-5091','LAN-2026-1957','LAN-2026-4358','LAN-2026-2033']);
  get diagnostics v_t = row_count; v_mov := v_mov + v_t;
  if v_t <> 18 then raise exception 'Munck moveu % em vez de 18.', v_t; end if;

  update public.lancamento_rateios r set centro_custo_id = TELES from public.lancamentos l
  where l.id=r.lancamento_id and r.centro_custo_id=MANUT
    and l.numero = any(array['LAN-2026-0980','LAN-2026-1875','LAN-2026-0074']);
  get diagnostics v_t = row_count; v_mov := v_mov + v_t;
  if v_t <> 3 then raise exception 'Telescopio moveu % em vez de 3.', v_t; end if;

  update public.lancamento_rateios r set centro_custo_id = TRACK from public.lancamentos l
  where l.id=r.lancamento_id and r.centro_custo_id=MANUT
    and l.numero = any(array['LAN-2026-2079','LAN-2026-4701','LAN-2026-3098']);
  get diagnostics v_t = row_count; v_mov := v_mov + v_t;
  if v_t <> 3 then raise exception 'Tracker moveu % em vez de 3.', v_t; end if;

  update public.lancamento_rateios r set centro_custo_id = BETON from public.lancamentos l
  where l.id=r.lancamento_id and r.centro_custo_id=MANUT
    and l.numero = any(array['LAN-2026-1315','LAN-2026-1444']);
  get diagnostics v_t = row_count; v_mov := v_mov + v_t;
  if v_t <> 2 then raise exception 'Betoneira moveu % em vez de 2.', v_t; end if;

  update public.lancamento_rateios r set centro_custo_id = LAB from public.lancamentos l
  where l.id=r.lancamento_id and r.centro_custo_id=MANUT
    and l.numero = any(array['LAN-2026-0587','LAN-2026-1731']);
  get diagnostics v_t = row_count; v_mov := v_mov + v_t;
  if v_t <> 2 then raise exception 'Laboratorio moveu % em vez de 2.', v_t; end if;

  update public.lancamento_rateios r set centro_custo_id = PALIO from public.lancamentos l
  where l.id=r.lancamento_id and r.centro_custo_id=MANUT
    and l.numero = any(array['LAN-2026-4909','LAN-2026-0308']);
  get diagnostics v_t = row_count; v_mov := v_mov + v_t;
  if v_t <> 2 then raise exception 'Palio moveu % em vez de 2.', v_t; end if;

  -- Meloza 1517 e 113: da EMT.
  update public.lancamento_rateios r set centro_custo_id = MELOZA from public.lancamentos l
  where l.id=r.lancamento_id and r.centro_custo_id=MANUT and l.numero = any(array[
    'LAN-2026-3839','LAN-2026-5192','LAN-2026-2180','LAN-2026-0751',
    'LAN-2026-5717','LAN-2026-5115','LAN-2026-4993','LAN-2026-0421']);
  get diagnostics v_t = row_count; v_mov := v_mov + v_t;
  if v_t <> 8 then raise exception 'Meloza EMT moveu % em vez de 8.', v_t; end if;

  -- Meloza sem modelo: da Colorado.
  update public.lancamento_rateios r set centro_custo_id = COLORADO from public.lancamentos l
  where l.id=r.lancamento_id and r.centro_custo_id=MANUT and l.numero = any(array[
    'LAN-2026-1626','LAN-2026-5784','LAN-2026-1822','LAN-2026-4017','LAN-2026-2801','LAN-2026-4070']);
  get diagnostics v_t = row_count; v_mov := v_mov + v_t;
  if v_t <> 6 then raise exception 'Meloza Colorado moveu % em vez de 6.', v_t; end if;

  -- O frete da retro 02 mais o laboratorio: meio a meio, num statement so.
  with metade as (
    update public.lancamento_rateios r set centro_custo_id = LAB, valor = 162.50
    from public.lancamentos l
    where l.id = r.lancamento_id and l.numero = 'LAN-2026-0392' and r.centro_custo_id = MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by
  )
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select lancamento_id, RT02, 162.50, categoria_id, created_by from metade;
  get diagnostics v_ins = row_count;

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_col_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;
  select coalesce(sum(r.valor),0) into v_sub_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;
  -- R$ 514,49, e nao 325: o 0392 ja tinha rateio na obra 009. Ver o cabecalho.
  select count(*) filter (where r.categoria_id is distinct from v_cat_a), sum(r.valor)
    into v_cat_ruim, v_soma
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where l.numero='LAN-2026-0392';

  if v_mov <> 44 then raise exception 'Moveu % em vez de 44.', v_mov; end if;
  if v_ins <> 1 then raise exception 'Inseriu % em vez de 1.', v_ins; end if;
  if v_lin_d - v_lin_a <> 1 then raise exception 'Nasceram % linhas em vez de 1.', v_lin_d-v_lin_a; end if;
  if v_cat_ruim > 0 then raise exception '% linha(s) do 0392 com categoria diferente.', v_cat_ruim; end if;
  if round(v_soma,2) <> 514.49 then raise exception 'O 0392 soma R$ %.', v_soma; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  if round(v_col_d - v_col_a, 2) <> 5742.00 then raise exception 'Colorado subiu R$ %.', v_col_d-v_col_a; end if;
  -- So a meloza da Colorado atravessa a fronteira. O resto fica na Manutencao.
  if round(v_sub_a - v_sub_d, 2) <> 5742.00 then raise exception 'A subarvore caiu R$ %.', v_sub_a-v_sub_d; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 50910.93 then raise exception 'A raiz caiu R$ %.', v_raiz_a-v_raiz_d; end if;

  raise notice 'OK. % movidos + 1 dividido. Raiz R$ % -> R$ %.', v_mov, v_raiz_a, v_raiz_d;
end $aplica$;
