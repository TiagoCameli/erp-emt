-- A usina de asfalto sai da Manutencao: quase tudo e da obra da BR-364.
--
-- Aplicado no banco em 30/08/2026.
--
-- ## O corte, dito pelo Tiago
--
-- Listei os 14 lancamentos de usina que estavam na raiz e ele cortou pela data:
-- de 06/11/2025 em diante sao "despesas da obra de manutencao da BR 364 lote 09
-- e 10", e os tres anteriores sao equipamentos Colorado.
--
--   11 lancamentos, R$ 5.112,69 -> 009 - Manutencao da Rodovia BR-364/AC - Lote 09 & 10
--    3 lancamentos, R$   727,50 -> 002 - Equipamentos Colorado 2026
--
--   raiz da Manutencao: R$ 421.333,94 -> R$ 415.493,75  (270 -> 256 lanc.)
--
-- ## A data separava sozinha, e o texto confirma
--
-- Os tres da Colorado sao de mai e jul/2025 e dizem "Usina de Asfalto 59"; os
-- onze da obra sao de nov/2025 em diante e dizem "Usina Ciber", sete deles com
-- "OBRA BR364" escrito na propria descricao. Duas maquinas diferentes, duas
-- donas diferentes, e a data separa as duas -- o mesmo padrao da vibro e da
-- meloza hoje mais cedo.
--
-- ## Dois com ressalva que foram junto
--
--   LAN-2026-1768  R$ 25,00   cita a usina E o caminhao cacamba 109.
--   LAN-2026-0908  R$ 55,68   cita a usina E a motosserra.
--
-- Os dois entraram no corte do Tiago. Vinte e cinco reais e cinquenta e cinco
-- nao pagam o custo de dividir a linha, e ele viu os dois na lista.
--
-- ## Linha de controle
--
-- Alem do DRE por tipo e do rateio fechando, esta carga tem uma checagem que as
-- outras nao tinham: **nenhum lancamento de usina pode sobrar na raiz**. E a
-- unica forma de provar que o corte cobriu os 14, e nao 12 ou 13.

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  COLORADO uuid := '891f3c63-f7e5-49fb-a97c-9c99deeadc2b';
  BR364 uuid := 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0';
  PARA_BR text[] := array['LAN-2026-1768','LAN-2026-2762','LAN-2026-4943','LAN-2026-5343',
                          'LAN-2026-5488','LAN-2026-4180','LAN-2026-3431','LAN-2026-5529',
                          'LAN-2026-4455','LAN-2026-0523','LAN-2026-0908'];
  PARA_COL text[] := array['LAN-2026-1716','LAN-2026-2073','LAN-2026-5301'];
  v_a int; v_b int; v_sobra int;
  v_raiz_a numeric; v_raiz_d numeric; v_col_a numeric; v_col_d numeric;
  v_br_a numeric; v_br_d numeric; v_tipo_a jsonb; v_tipo_d jsonb; v_div int; v_lin_a int; v_lin_d int;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_col_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;
  select coalesce(sum(r.valor),0) into v_br_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=BR364;

  update public.lancamento_rateios r set centro_custo_id = BR364
  from public.lancamentos l
  where l.id=r.lancamento_id and l.status<>'cancelado' and r.centro_custo_id=MANUT
    and l.numero = any(PARA_BR);
  get diagnostics v_a = row_count;

  update public.lancamento_rateios r set centro_custo_id = COLORADO
  from public.lancamentos l
  where l.id=r.lancamento_id and l.status<>'cancelado' and r.centro_custo_id=MANUT
    and l.numero = any(PARA_COL);
  get diagnostics v_b = row_count;

  select count(*) into v_sobra from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  where r.centro_custo_id=MANUT
    and upper(translate(l.descricao,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC')) ~ 'USINA|CIBER';

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_col_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;
  select coalesce(sum(r.valor),0) into v_br_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=BR364;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;

  if v_a <> 11 then raise exception 'BR-364 recebeu % em vez de 11.', v_a; end if;
  if v_b <> 3 then raise exception 'Colorado recebeu % em vez de 3.', v_b; end if;
  if v_lin_d <> v_lin_a then raise exception 'O numero de rateios mudou.'; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  if round(v_br_d - v_br_a, 2) <> 5112.69 then
    raise exception 'BR-364 subiu R$ % em vez de 5112.69.', v_br_d-v_br_a; end if;
  if round(v_col_d - v_col_a, 2) <> 727.50 then
    raise exception 'Colorado subiu R$ % em vez de 727.50.', v_col_d-v_col_a; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 5840.19 then
    raise exception 'A raiz caiu R$ % em vez de 5840.19.', v_raiz_a-v_raiz_d; end if;
  -- a prova de cobertura: o corte tem que ter pegado os 14
  if v_sobra > 0 then
    raise exception 'Sobraram % lancamento(s) de usina na raiz.', v_sobra; end if;

  raise notice 'OK. BR-364 % (R$ %), Colorado % (R$ %). Raiz R$ % -> R$ %.',
    v_a, v_br_d-v_br_a, v_b, v_col_d-v_col_a, v_raiz_a, v_raiz_d;
end $aplica$;
