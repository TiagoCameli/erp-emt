-- As respostas da planilha de duvidas, aplicadas.
--
-- Cole isto INTEIRO no SQL Editor do Supabase e rode uma vez.
-- O bloco e ATOMICO: se qualquer checagem falhar, nada e gravado e a mensagem
-- diz o que foi. Rodar duas vezes nao duplica -- a segunda vez nao acha nada na
-- raiz e falha na checagem de contagem, sem gravar.
--
-- Sao 40 dos 59 lancamentos. Faltam os 6 de "aplicar o rateio do MC" (esses
-- reescrevem o rateio inteiro do lancamento e eu quero ensaiar antes) e os 13
-- que ele mandou ficar na raiz.
--
--   raiz da Manutencao: R$ 101.994,63 -> R$ 14489.11
--   sai da subarvore:   R$ 35414.92  (Aquisicao de Equipamentos, obras,
--                       Amazonia, Carretas e Escritorio Central)
--   linhas novas:       12

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  v_txt text; v_n int; v_t int;
  v_lin_a int; v_lin_d int; v_div int; v_orfa int;
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_tipo_a jsonb; v_tipo_d jsonb;
begin
  create temp table plano(num text, ordem int, pai text, nome text, valor numeric) on commit drop;
  insert into plano(num, ordem, pai, nome, valor) values
  ('2629',1,'Manutenção/Documentação de Equipamentos','Lubrificante',18248.77),
  ('4432',1,'Manutenção/Documentação de Equipamentos','Hilux CHLSTM4FD QWQ-3H97 - 01',5450.00),
  ('1905',1,'Manutenção/Documentação de Equipamentos','Hilux CHLSTM4FD QWQ-3H97 - 01',3194.38),
  ('3500',1,'Manutenção/Documentação de Equipamentos','Oficina',3000.00),
  ('2669',1,'Amazônia Agroindústria','Manutenção de Equipamentos da Amazônia',2819.48),
  ('4570',1,NULL,'007 - AC 405 - Lote 2',2503.35),
  ('0426',1,'Manutenção/Documentação de Equipamentos','Oficina',1996.65),
  ('0949',1,'Manutenção/Documentação de Equipamentos','Hilux CHLSTM4FD QWQ-3H97 - 01',1520.00),
  ('1468',1,'Manutenção/Documentação de Equipamentos','Oficina',1294.95),
  ('0490',1,NULL,'003 - Recuperação do Ramal do Gama',1158.67),
  ('3169',1,'Manutenção/Documentação de Equipamentos','Oficina',879.54),
  ('1147',1,'Manutenção/Documentação de Equipamentos','Oficina',607.20),
  ('5943',1,'Manutenção/Documentação de Equipamentos','Oficina',500.00),
  ('0055',1,'Manutenção/Documentação de Equipamentos','Oficina',409.82),
  ('1248',1,NULL,'Escritório Central',405.02),
  ('4623',1,NULL,'Escritório Central',401.20),
  ('1450',1,NULL,'003 - Recuperação do Ramal do Gama',309.90),
  ('3614',1,NULL,'Escritório Central',285.00),
  ('2467',1,'001 - Carretas EMT','Caminhão Cavalo XF 530 FTT SQS7E01 - 02',279.15),
  ('3369',1,'Manutenção/Documentação de Equipamentos','Oficina',230.81),
  ('0702',1,'Manutenção/Documentação de Equipamentos','Rolo CP56 - 01',205.57),
  ('3176',1,'Manutenção/Documentação de Equipamentos','Oficina',135.00),
  ('2686',1,'Manutenção/Documentação de Equipamentos','Caminhão Cavalo 2644 S/33 MZO-2987 - 01',120.00),
  ('0295',1,'Manutenção/Documentação de Equipamentos','Trator de Esteira D6NXL - 01',90.00),
  ('3137',1,NULL,'007 - AC 405 - Lote 2',89.15),
  ('5951',1,NULL,'009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',50.00),
  ('2377',1,NULL,'009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',50.00),
  ('5952',1,NULL,'009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',40.00),
  ('5847',1,'Manutenção/Documentação de Equipamentos','Pá Carregadeira 924K - 01',30.00),
  ('5937',1,NULL,'009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',14.00),
  ('5938',1,NULL,'009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',10.00),
  ('5080',1,'Aquisição de Equipamentos','Vibro Acabadora AF4500 - 01',9000.00),
  ('5080',2,'Aquisição de Equipamentos','Rolo Chapa CB10 - 01',9000.00),
  ('5080',3,'Aquisição de Equipamentos','Rolo de Pneu CW34 - 01',9000.00),
  ('2027',1,'Manutenção/Documentação de Equipamentos','Caminhão Cavalo 2644 S/33 MZO-2987 - 01',3000.00),
  ('2027',2,'Manutenção/Documentação de Equipamentos','Caminhão Pipa 2626 NCP-4846 - 01',3000.00),
  ('1536',1,'Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-5897 - 01',1833.33),
  ('1536',2,'Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-8547 - 02',1833.33),
  ('1536',3,'Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-8F87 - 03',1833.34),
  ('1519',1,'Manutenção/Documentação de Equipamentos','Retroescavadeira 416E - 01',294.81),
  ('1519',2,'Manutenção/Documentação de Equipamentos','CAMINHÃO BOIADEIRO/MIILHO - L1620',294.81),
  ('0632',1,'Manutenção/Documentação de Equipamentos','Hilux CDLOWA4SD SQQ-8F87 - 06',193.33),
  ('0632',2,'Manutenção/Documentação de Equipamentos','Hilux CDSRVA4FD QWQ-1D76 - 05',193.33),
  ('0632',3,'Manutenção/Documentação de Equipamentos','Hilux SQR1C93 - 07',193.34),
  ('1891',1,'Manutenção/Documentação de Equipamentos','Motoniveladora 12H - 01',275.00),
  ('1891',2,'Manutenção/Documentação de Equipamentos','Retroescavadeira 416E - 01',275.00),
  ('2053',1,'Manutenção/Documentação de Equipamentos','Rolo CP56 - 01',204.15),
  ('2053',2,'Manutenção/Documentação de Equipamentos','Rolo Pé de Carneiro CP56 - 02',204.14),
  ('3288',1,'Manutenção/Documentação de Equipamentos','Rolo CP56 - 01',150.00),
  ('3288',2,'Manutenção/Documentação de Equipamentos','Rolo Pé de Carneiro CP56 - 02',150.00),
  ('2048',1,'Manutenção/Documentação de Equipamentos','Rolo Chapa CB10 - 01',125.00),
  ('2048',2,'Manutenção/Documentação de Equipamentos','Rolo de Pneu CW34 - 01',125.00);

  -- resolve destino por NOME. Nome errado nao grava nulo: falha alto.
  create temp table dest on commit drop as
  select p.num, p.ordem, p.pai, p.nome, p.valor, c.id as centro
  from plano p
  left join public.centros_custo c
    on c.nome = p.nome
   and ( (p.pai is null and c.pai_id is null)
      or (p.pai is not null and c.pai_id = (select id from public.centros_custo
                                             where nome = p.pai and pai_id is null)) );

  select string_agg(distinct coalesce(pai,'(raiz)') || ' > ' || nome, ' ; ') into v_txt
  from dest where centro is null;
  if v_txt is not null then raise exception 'destino que nao existe no cadastro: %', v_txt; end if;

  select count(*) into v_n from (
    select num, ordem from dest group by num, ordem having count(*) > 1) t;
  if v_n > 0 then raise exception '% destino(s) casaram com mais de um centro. Nome ambiguo.', v_n; end if;

  -- todo lancamento do plano tem que ter UMA linha na raiz para eu mexer
  select count(*) into v_n from (select distinct num from dest) t;
  select count(*) into v_t from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id = MANUT and l.numero in (select 'LAN-2026-' || num from dest);
  if v_t <> v_n then
    raise exception 'esperava % linhas na raiz e achei %. Ja foi aplicado?', v_n, v_t; end if;

  -- a soma de cada divisao tem que fechar com a fatia que esta na raiz
  select string_agg(d.num, ', ') into v_txt from (
    select d.num, sum(d.valor) as s from dest d group by d.num) d
  join public.lancamentos l on l.numero = 'LAN-2026-' || d.num
  join public.lancamento_rateios r on r.lancamento_id = l.id and r.centro_custo_id = MANUT
  where round(d.s,2) <> round(r.valor,2);
  if v_txt is not null then raise exception 'a divisao nao fecha com a fatia da raiz em: %', v_txt; end if;

  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;

  -- UM statement: o CTE atualiza a linha da raiz e insere as outras fatias
  -- junto, porque trg_valida_soma_do_rateio dispara AFTER ROW.
  with upd as (
    update public.lancamento_rateios r
       set centro_custo_id = d.centro, valor = d.valor
      from public.lancamentos l, dest d
     where l.id = r.lancamento_id and l.numero = 'LAN-2026-' || d.num
       and r.centro_custo_id = MANUT and d.ordem = 1
    returning r.lancamento_id, r.categoria_id, r.created_by, d.num
  )
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select u.lancamento_id, d.centro, d.valor, u.categoria_id, u.created_by
  from upd u join dest d on d.num = u.num and d.ordem > 1;

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
  where r.categoria_id is null and r.created_at > now() - interval '2 minutes';

  if v_lin_d - v_lin_a <> 12 then
    raise exception 'nasceram % linhas em vez de 12.', v_lin_d-v_lin_a; end if;
  if v_orfa > 0 then raise exception '% fatia(s) nasceram sem categoria.', v_orfa; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 87505.52 then
    raise exception 'a raiz caiu R$ % em vez de 87505.52.', v_raiz_a-v_raiz_d; end if;
  if round(v_sub_a - v_sub_d, 2) <> 35414.92 then
    raise exception 'a subarvore caiu R$ % em vez de 35414.92.', v_sub_a-v_sub_d; end if;

  raise notice 'OK. Raiz R$ % -> R$ %. 12 linhas novas.', v_raiz_a, v_raiz_d;
end $aplica$;
