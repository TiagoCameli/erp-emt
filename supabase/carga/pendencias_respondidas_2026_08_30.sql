-- As pendencias que o Tiago respondeu de uma vez.
--
-- Aplicado no banco em 30/08/2026, depois de `usina_para_a_obra`.
--
-- ## As respostas
--
--   "esse trator mesmo que voce esta pensando" (o BX6180, da Amazonia)
--   "o cavalo seria o CS-01"
--   "o rolo coloca para o 01"
--   "416e coloca para a 01"
--   "esse material ai vai para o rolo 01"
--   TI e comunicacao -> oficina
--   maquina fora da frota -> todos esses sao da amazonia
--
--   raiz da Manutencao: R$ 415.493,75 -> R$ 385.322,34  (256 -> 237 lanc.)
--
-- ## Quatro movimentos simples
--
--   LAN-2026-3501  R$    500,00  -> Retroescavadeira 416E - 01
--   LAN-2026-2549  R$    150,00  -> Rolo CP56 - 01
--   TI (2 lanc.)   R$ 12.705,92  -> Oficina  (comunicador 8.500 + notebook 4.205,92)
--   fora da frota  R$  7.950,99  -> Manutencao de Equipamentos da Amazonia
--                  (10 lanc.: oito da Honda BROS 160, a placa vibratoria e a
--                   colheitadeira Tratoron)
--
-- ## Cinco divisoes
--
--   LAN-2026-2492  R$ 4.000,00  Munck 2.000 + Amazonia 2.000
--   LAN-2026-4949  R$ 2.300,00  CS-001 1.150 + Amazonia 1.150
--   LAN-2026-4849  R$ 1.834,00  MZO-5897, MZO-8F87 e Rolo CP56-01
--                               611,33 + 611,33 + 611,34
--   LAN-2026-1997  R$   567,00  CS-001, MZO-5897, Meloza e Amazonia, 141,75 cada
--   LAN-2026-3215  R$   163,50  NAB-4619, MZO-5897, Rolo CP56-01 e CP56-02
--                               40,87 + 40,87 + 40,87 + 40,89
--
-- Cada divisao e UM statement: um CTE que atualiza a linha original e insere as
-- demais fatias no mesmo comando, porque `trg_valida_soma_do_rateio` dispara
-- AFTER ROW e abortaria entre um UPDATE e um INSERT separados. A ultima fatia
-- e sempre o RESTO, nunca outro round -- e assim que 1.834,00 em tres partes
-- fecha em 1.834,00 e nao em 1.833,99.
--
-- ## O que sobrou de proposito
--
--   LAN-2026-4929  R$ 120,00  "frete caminhao muck, rolo pe de carneiro, rolo
--                  chapa COLORADO". Sao tres maquinas e a regra do rolo 01 do
--                  Tiago resolveria duas, MAS este lancamento ja tem R$ 40,00
--                  numa segunda linha, na Colorado. O total e R$ 160,00, e nao
--                  da para saber se aqueles R$ 40 ja SAO a fatia do rolo chapa
--                  Colorado ou se a divisao correta e outra. Dividir por cima
--                  disso poria a Colorado com R$ 80 de um documento de R$ 160.
--
-- ## Linha de controle
--
-- A Oficina fica DENTRO da Manutencao e a Amazonia FORA, entao os dois numeros
-- sao diferentes de proposito:
--
--   raiz      cai R$ 30.171,41
--   subarvore cai R$ 11.242,74  (so o que foi para a Amazonia)
--
-- Mais: nasceram exatamente 10 linhas novas (1+1+2+3+3), nenhuma sem
-- `categoria_id`, e o rateio de todo lancamento continua fechando com o valor.

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  AMAZ uuid := 'df5637cd-0c9d-45de-b06f-26cd31a0d666';
  OFIC uuid := '17e1ae32-6aae-4902-98e7-8736a76d1a78';
  ROLO1 uuid := '516ed0a3-c5b5-4868-b421-179a64fc36bb';
  ROLO2 uuid := '1082490f-394b-4cfc-993e-41dd1d48e4a4';
  RETRO1 uuid := 'a5af7702-2a63-45de-86d4-7995d060fee9';
  MUNCK uuid := 'f814cb00-a3cd-4bae-a8b7-dc400cd52e20';
  CS1 uuid := 'e2a026bd-a760-49e6-a061-eb50a091a815';
  CB1 uuid := '10b2d20c-a31e-42cb-ae3d-7b68a7b41c44';
  CB3 uuid := '85186912-2b85-4f39-8fde-03653ce9b7eb';
  CB6 uuid := '5d318cd1-2ab6-476b-8855-4604afdb0648';
  MELOZA uuid := 'afd2f665-0090-4224-b89d-c61ed3c035bb';
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_amz_a numeric; v_amz_d numeric; v_ofi_a numeric; v_ofi_d numeric;
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
  select coalesce(sum(r.valor),0) into v_ofi_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=OFIC;

  update public.lancamento_rateios r set centro_custo_id=RETRO1 from public.lancamentos l
  where l.id=r.lancamento_id and l.numero='LAN-2026-3501' and r.centro_custo_id=MANUT;
  get diagnostics v_t = row_count; if v_t <> 1 then raise exception '3501 moveu %.', v_t; end if;

  update public.lancamento_rateios r set centro_custo_id=ROLO1 from public.lancamentos l
  where l.id=r.lancamento_id and l.numero='LAN-2026-2549' and r.centro_custo_id=MANUT;
  get diagnostics v_t = row_count; if v_t <> 1 then raise exception '2549 moveu %.', v_t; end if;

  update public.lancamento_rateios r set centro_custo_id=OFIC from public.lancamentos l
  where l.id=r.lancamento_id and l.numero in ('LAN-2026-4560','LAN-2026-1925') and r.centro_custo_id=MANUT;
  get diagnostics v_t = row_count; if v_t <> 2 then raise exception 'TI moveu %.', v_t; end if;

  update public.lancamento_rateios r set centro_custo_id=AMAZ from public.lancamentos l
  where l.id=r.lancamento_id and r.centro_custo_id=MANUT and l.numero in
    ('LAN-2026-3149','LAN-2026-2146','LAN-2026-5871','LAN-2026-5855','LAN-2026-4775',
     'LAN-2026-4114','LAN-2026-4603','LAN-2026-0203','LAN-2026-4347','LAN-2026-5862');
  get diagnostics v_t = row_count; if v_t <> 10 then raise exception 'Fora da frota moveu %.', v_t; end if;

  with m as (
    update public.lancamento_rateios r set centro_custo_id=MUNCK, valor=2000.00
    from public.lancamentos l where l.id=r.lancamento_id and l.numero='LAN-2026-2492' and r.centro_custo_id=MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select m.lancamento_id, AMAZ, 2000.00, m.categoria_id, m.created_by from m;

  with m as (
    update public.lancamento_rateios r set centro_custo_id=CS1, valor=1150.00
    from public.lancamentos l where l.id=r.lancamento_id and l.numero='LAN-2026-4949' and r.centro_custo_id=MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select m.lancamento_id, AMAZ, 1150.00, m.categoria_id, m.created_by from m;

  with m as (
    update public.lancamento_rateios r set centro_custo_id=CB1, valor=611.33
    from public.lancamentos l where l.id=r.lancamento_id and l.numero='LAN-2026-4849' and r.centro_custo_id=MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select m.lancamento_id, v.centro, v.val, m.categoria_id, m.created_by
  from m cross join (values (CB3,611.33::numeric),(ROLO1,611.34::numeric)) as v(centro,val);

  with m as (
    update public.lancamento_rateios r set centro_custo_id=CS1, valor=141.75
    from public.lancamentos l where l.id=r.lancamento_id and l.numero='LAN-2026-1997' and r.centro_custo_id=MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select m.lancamento_id, v.centro, v.val, m.categoria_id, m.created_by
  from m cross join (values (CB1,141.75::numeric),(MELOZA,141.75::numeric),(AMAZ,141.75::numeric)) as v(centro,val);

  with m as (
    update public.lancamento_rateios r set centro_custo_id=CB6, valor=40.87
    from public.lancamentos l where l.id=r.lancamento_id and l.numero='LAN-2026-3215' and r.centro_custo_id=MANUT
    returning r.lancamento_id, r.categoria_id, r.created_by)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select m.lancamento_id, v.centro, v.val, m.categoria_id, m.created_by
  from m cross join (values (CB1,40.87::numeric),(ROLO1,40.87::numeric),(ROLO2,40.89::numeric)) as v(centro,val);

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
  select coalesce(sum(r.valor),0) into v_ofi_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=OFIC;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;
  select count(*) into v_orfa from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id
  where l.numero in ('LAN-2026-2492','LAN-2026-4949','LAN-2026-4849','LAN-2026-1997','LAN-2026-3215')
    and r.categoria_id is null;

  if v_lin_d - v_lin_a <> 10 then raise exception 'Nasceram % linhas em vez de 10.', v_lin_d-v_lin_a; end if;
  if v_orfa > 0 then raise exception '% fatia(s) nasceram sem categoria.', v_orfa; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  if round(v_ofi_d - v_ofi_a, 2) <> 12705.92 then
    raise exception 'Oficina subiu R$ % em vez de 12705.92.', v_ofi_d-v_ofi_a; end if;
  if round(v_amz_d - v_amz_a, 2) <> 11242.74 then
    raise exception 'Amazonia subiu R$ % em vez de 11242.74.', v_amz_d-v_amz_a; end if;
  -- a Oficina fica dentro da Manutencao, a Amazonia fora: numeros diferentes
  if round(v_sub_a - v_sub_d, 2) <> 11242.74 then
    raise exception 'A subarvore caiu R$ % em vez de 11242.74.', v_sub_a-v_sub_d; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 30171.41 then
    raise exception 'A raiz caiu R$ % em vez de 30171.41.', v_raiz_a-v_raiz_d; end if;

  raise notice 'OK. Raiz R$ % -> R$ %. Amazonia +R$ %. Oficina +R$ %.',
    v_raiz_a, v_raiz_d, v_amz_d-v_amz_a, v_ofi_d-v_ofi_a;
end $aplica$;
