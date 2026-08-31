-- O rateio real do Mais Controle, e as tres divisoes minhas que ele desmentiu.
--
-- Aplicado no banco em 30/08/2026, depois de `pendencias_respondidas`.
--
--   raiz da Manutencao: R$ 385.322,34 -> R$ 379.670,20  (237 -> 233 lanc.)
--
-- ## Por que este arquivo existe
--
-- Nas cargas anteriores eu dividi lancamento multi-maquina em partes iguais,
-- porque era o que o texto da nota permitia. Antes de fechar, conferi cada um
-- deles contra o rateio do MC. **O MC nao divide meio a meio.** Tres dos meus
-- palpites estavam com a proporcao errada, e um deles nem tinha o numero certo
-- de fatias.
--
-- A divisao igual acerta o destino e erra o quanto. Como cada fatia carrega
-- `categoria_id` e alimenta o custo por equipamento, errar o quanto e errar o
-- relatorio de custo da maquina -- que e exatamente para o que essa revisao
-- toda existe.
--
-- ## Bloco 1: os tres que ja estavam parados esperando a proporcao
--
--   LAN-2026-5774  R$ 3.902,46  NAB-4669 2.119,08 | NAB-4679 1.689,52 | Munck 93,86
--   LAN-2026-5567  R$ 1.154,40  Meloza 384,80 | NAB-4619 384,80 | MZO-8F87 192,40
--                               | NAB-4669 192,40
--   LAN-2026-1933  R$   475,28  NAB-4679 419,85 | Munck 55,43
--
-- Os valores do MC ja fecham exatos, sem sobra de centavo. Nao precisei de
-- "ultima fatia e o resto" em nenhum dos tres.
--
-- ### A ponte de codigo para etapa se confirmou pelo MODELO, nao so pela ordem
--
-- O Tiago disse "o 106 virou o cb-01, o 107 o cb-02 assim por diante", o que da
-- sufixo = codigo - 105. O MC traz o modelo junto do codigo, e ele bate:
--
--   0108 "Caçamba 2423 K/36"  ->  MZO-8F87 - 03   (a -03 e 2423 K/36)
--   0109 "Caçamba 2425/48"    ->  NAB-4679 - 04   (a -04 e 2425/48)
--   0110 "Caçamba 2425/48"    ->  NAB-4669 - 05   (a -05 e 2425/48)
--   0111 "Caçamba 2425/48"    ->  NAB-4619 - 06   (a -06 e 2425/48)
--
-- Duas pistas independentes concordando. A ordem sozinha nao teria provado nada.
--
-- ## Bloco 2: a correcao dos meus palpites
--
--   LAN-2026-1997  eu: 141,75 x 4     MC: 188,00 / 184,00 / 130,00 / 65,00
--   LAN-2026-3215  eu: ~40,87 x 4     MC: 53,51 / 44,59 / 40,63 / 24,77
--   LAN-2026-4849  eu: 611,33 x 3     MC: 1.300,00 / 398,00 / 68,00 / 68,00 / 68,00
--                  (o MC tem CINCO fatias; faltava o Rolo CP56 - 02)
--   LAN-2026-4929  nao tinha aplicado, e ainda bem
--
-- O 4929 e a licao mais barata do dia. Sao R$ 160,00 com tres maquinas no texto
-- e R$ 40,00 ja sentados na Colorado. Dividir os R$ 120,00 restantes em tres
-- teria posto a Colorado com R$ 80,00 de um documento de R$ 160,00. O MC mostra
-- que sao QUATRO fatias de R$ 40,00 e que o R$ 40 da Colorado ja E a do rolo
-- chapa. Segurar por ambiguidade valeu mais do que dividir por simetria.
--
-- ## Onde eu NAO segui o MC, de proposito
--
-- No 1997 e no 4949 o MC poe a fatia do trator BX6180 numa etapa "Trator de
-- Pneu (Girico) BX6180 - 02" dentro de "0.2 - Equipamentos EMT". O Tiago disse
-- que o BX6180 e da Amazonia Agroindustria. Vale a palavra dele: o valor vem do
-- MC, o destino vem do dono. Por isso a Amazonia devolve R$ 11,75 aqui
-- (141,75 -> 130,00) em vez de zerar.
--
-- ## Linha de controle
--
-- Bloco 1: tudo cai dentro da Manutencao, entao a **subarvore nao pode mexer**
-- enquanto a raiz cai R$ 5.532,14. Se as duas mexessem junto, alguma fatia teria
-- ido para fora sem eu pedir.
--
-- Bloco 2: so o 4929 tira dinheiro da raiz (R$ 120,00); o resto e proporcao
-- dentro dela. A Colorado tem que ficar parada nos dois blocos.

-- ============================ BLOCO 1 ============================
do $bloco1$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  CB03 uuid := '85186912-2b85-4f39-8fde-03653ce9b7eb';
  CB04 uuid := '3969995c-17d4-464e-919e-e7d6f04ac9bf';
  CB05 uuid := 'aed7508e-980a-45c1-8e81-b9f8069f04de';
  CB06 uuid := '5d318cd1-2ab6-476b-8855-4604afdb0648';
  MUNCK uuid := 'f814cb00-a3cd-4bae-a8b7-dc400cd52e20';
  MELOZA uuid := 'afd2f665-0090-4224-b89d-c61ed3c035bb';
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_tipo_a jsonb; v_tipo_d jsonb; v_div int; v_lin_a int; v_lin_d int; v_orfa int; v_sobra int;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;

  -- LAN-2026-5774 R$ 3.902,46: 2119,08 / 1689,52 / 93,86 (soma exata, o MC ja da assim)
  with m as (
    update public.lancamento_rateios r set centro_custo_id=CB05, valor=2119.08
    from public.lancamentos l where l.id=r.lancamento_id and l.numero='LAN-2026-5774' and r.centro_custo_id=MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select m.lancamento_id, v.centro, v.val, m.categoria_id, m.created_by
  from m cross join (values (CB04,1689.52::numeric),(MUNCK,93.86::numeric)) as v(centro,val);

  -- LAN-2026-5567 R$ 1.154,40: 384,80 / 384,80 / 192,40 / 192,40
  with m as (
    update public.lancamento_rateios r set centro_custo_id=MELOZA, valor=384.80
    from public.lancamentos l where l.id=r.lancamento_id and l.numero='LAN-2026-5567' and r.centro_custo_id=MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select m.lancamento_id, v.centro, v.val, m.categoria_id, m.created_by
  from m cross join (values (CB06,384.80::numeric),(CB03,192.40::numeric),(CB05,192.40::numeric)) as v(centro,val);

  -- LAN-2026-1933 R$ 475,28: 419,85 / 55,43
  with m as (
    update public.lancamento_rateios r set centro_custo_id=CB04, valor=419.85
    from public.lancamentos l where l.id=r.lancamento_id and l.numero='LAN-2026-1933' and r.centro_custo_id=MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select m.lancamento_id, MUNCK, 55.43, m.categoria_id, m.created_by from m;

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;
  select count(*) into v_orfa from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id
  where l.numero in ('LAN-2026-5774','LAN-2026-5567','LAN-2026-1933') and r.categoria_id is null;
  select count(*) into v_sobra from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id
  where l.numero in ('LAN-2026-5774','LAN-2026-5567','LAN-2026-1933') and r.centro_custo_id=MANUT;

  if v_lin_d - v_lin_a <> 6 then raise exception 'Nasceram % linhas em vez de 6.', v_lin_d-v_lin_a; end if;
  if v_sobra > 0 then raise exception '% fatia(s) ficaram na raiz.', v_sobra; end if;
  if v_orfa > 0 then raise exception '% fatia(s) sem categoria.', v_orfa; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  -- tudo continua dentro da Manutencao: a subarvore NAO pode mexer
  if round(v_sub_d - v_sub_a, 2) <> 0 then
    raise exception 'A subarvore mexeu R$ %, e nao devia.', v_sub_d-v_sub_a; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 5532.14 then
    raise exception 'A raiz caiu R$ % em vez de 5532.14.', v_raiz_a-v_raiz_d; end if;

  raise notice 'Bloco 1 OK. Raiz R$ % -> R$ %.', v_raiz_a, v_raiz_d;
end $bloco1$;

-- ============================ BLOCO 2 ============================
do $bloco2$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  AMAZ uuid := 'df5637cd-0c9d-45de-b06f-26cd31a0d666';
  COLORADO uuid := '891f3c63-f7e5-49fb-a97c-9c99deeadc2b';
  CB1 uuid := '10b2d20c-a31e-42cb-ae3d-7b68a7b41c44';
  CB3 uuid := '85186912-2b85-4f39-8fde-03653ce9b7eb';
  CB6 uuid := '5d318cd1-2ab6-476b-8855-4604afdb0648';
  CS1 uuid := 'e2a026bd-a760-49e6-a061-eb50a091a815';
  MUNCK uuid := 'f814cb00-a3cd-4bae-a8b7-dc400cd52e20';
  MELOZA uuid := 'afd2f665-0090-4224-b89d-c61ed3c035bb';
  ROLO1 uuid := '516ed0a3-c5b5-4868-b421-179a64fc36bb';
  ROLO2 uuid := '1082490f-394b-4cfc-993e-41dd1d48e4a4';
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_amz_a numeric; v_amz_d numeric; v_col_a numeric; v_col_d numeric;
  v_tipo_a jsonb; v_tipo_d jsonb; v_div int; v_lin_a int; v_lin_d int; v_orfa int; v_t int;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select coalesce(sum(r.valor),0) into v_amz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=AMAZ;
  select coalesce(sum(r.valor),0) into v_col_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;

  -- 1997: mesmos 4 centros, proporcao do MC (188/184/130/65) em vez de 141,75 cada
  update public.lancamento_rateios r set valor = v.val
  from (values (CB1,188.00::numeric),(MELOZA,184.00::numeric),
               (AMAZ,130.00::numeric),(CS1,65.00::numeric)) as v(centro,val),
       public.lancamentos l
  where l.id=r.lancamento_id and l.numero='LAN-2026-1997' and r.centro_custo_id=v.centro;
  get diagnostics v_t = row_count; if v_t <> 4 then raise exception '1997 corrigiu % linhas.', v_t; end if;

  -- 3215: mesmos 4 centros, proporcao do MC (53,51/44,59/40,63/24,77)
  update public.lancamento_rateios r set valor = v.val
  from (values (CB6,53.51::numeric),(ROLO1,44.59::numeric),
               (ROLO2,40.63::numeric),(CB1,24.77::numeric)) as v(centro,val),
       public.lancamentos l
  where l.id=r.lancamento_id and l.numero='LAN-2026-3215' and r.centro_custo_id=v.centro;
  get diagnostics v_t = row_count; if v_t <> 4 then raise exception '3215 corrigiu % linhas.', v_t; end if;

  -- 4849: o MC tem CINCO fatias, e eu tinha feito tres iguais. Faltava o CP56-02.
  with m as (
    update public.lancamento_rateios r set valor = v.val
    from (values (CB3,1300.00::numeric),(CB1,398.00::numeric),(ROLO1,68.00::numeric)) as v(centro,val),
         public.lancamentos l
    where l.id=r.lancamento_id and l.numero='LAN-2026-4849' and r.centro_custo_id=v.centro
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select distinct m.lancamento_id, ROLO2, 68.00, m.categoria_id, m.created_by from m;

  -- 4929: o R$ 40 que ja estava na Colorado E a fatia do rolo chapa. Os R$ 120 da
  -- raiz viram tres de R$ 40, como o MC ja tinha.
  with m as (
    update public.lancamento_rateios r set centro_custo_id=MUNCK, valor=40.00
    from public.lancamentos l where l.id=r.lancamento_id and l.numero='LAN-2026-4929' and r.centro_custo_id=MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select m.lancamento_id, v.centro, 40.00, m.categoria_id, m.created_by
  from m cross join (values (ROLO1),(ROLO2)) as v(centro);

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select coalesce(sum(r.valor),0) into v_amz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=AMAZ;
  select coalesce(sum(r.valor),0) into v_col_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;
  select count(*) into v_orfa from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id
  where l.numero in ('LAN-2026-4849','LAN-2026-4929') and r.categoria_id is null;

  if v_lin_d - v_lin_a <> 3 then raise exception 'Nasceram % linhas em vez de 3.', v_lin_d-v_lin_a; end if;
  if v_orfa > 0 then raise exception '% fatia(s) sem categoria.', v_orfa; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  if round(v_col_d - v_col_a, 2) <> 0 then
    raise exception 'A Colorado mexeu R$ %, e nao devia.', v_col_d-v_col_a; end if;
  -- so o 4929 tira dinheiro da raiz; o resto e correcao de proporcao dentro dela
  if round(v_raiz_a - v_raiz_d, 2) <> 120.00 then
    raise exception 'A raiz caiu R$ % em vez de 120,00.', v_raiz_a-v_raiz_d; end if;
  -- a Amazonia devolve R$ 11,75 (141,75 -> 130,00 no 1997), e a subarvore ganha isso
  if round(v_amz_a - v_amz_d, 2) <> 11.75 then
    raise exception 'A Amazonia devolveu R$ % em vez de 11,75.', v_amz_a-v_amz_d; end if;
  if round(v_sub_d - v_sub_a, 2) <> 11.75 then
    raise exception 'A subarvore ganhou R$ % em vez de 11,75.', v_sub_d-v_sub_a; end if;

  raise notice 'Bloco 2 OK. Raiz R$ % -> R$ %.', v_raiz_a, v_raiz_d;
end $bloco2$;
