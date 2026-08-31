-- O rateio do MC aplicado a fundo: a raiz cai de R$ 379.670,20 para R$ 179.179,27.
--
-- Aplicado no banco em 31/08/2026, com o export novo do Mais Controle.
--
-- ## O que eu tinha errado antes
--
-- Eu vinha dizendo que 158 lancamentos (R$ 285.738,02) "o MC nao alcancou". Era
-- artefato do meu proprio filtro: eu so procurava documento nos TRES centros de
-- manutencao do MC ('000', '0.2', '009.1'). O MC arquiva muita coisa em
-- 'Empresa', '009 - BR-364', '003 - Ramal do Gama' e '007 - AC 405', e eu jogava
-- fora justamente esses.
--
-- Refeito contra os CINCO exports juntos (os quatro de 30/08 mais o de 31/08,
-- que e o primeiro a trazer CNPJ e numero do documento):
--
--   233 lancamentos na raiz  ->  217 casaram  ->  211 depois que rejeitei 6
--
-- ## A cascata de chaves, da mais forte para a mais fraca
--
--   data + valor, unico                184
--   data + valor, desempate por texto   26
--   cnpj + valor                         4
--   valor unico + data a <= 45 dias      2
--   cnpj + texto (valor difere)          1
--
-- ## As tres provas antes de confiar
--
--   1. Sobreposicao de texto entre a nota do ERP e a do MC. A metrica que eu
--      escrevi primeiro acusou 18 "suspeitos" que eram falso alarme: as duas
--      descricoes eram IDENTICAS, mas cada palavra delas ("PECAS PARA
--      MANUTENCAO") estava na minha lista de paradas. Sobraram 4 suspeitos de
--      verdade, com texto que fala de outra coisa.
--   2. Nenhum documento do MC pode servir a dois lancamentos do ERP: 0 casos.
--   3. O total do documento do MC fecha com o valor do lancamento: 2 nao
--      fechavam, os dois pela chave mais fraca.
--
--   Rejeitei os 6: 1519 e 3137 (valor nao fecha), 1536 (ERP fala de placas de
--   central, o MC de pa carregadeira, 45 dias de distancia), 1891 (camara de ar
--   contra servico eletrico), 2048 (mesma data e valor, mas o MC fala de
--   passagem CZS x Marechal), 5951 ("caixa do dia" contra gasolina da BROS 160).
--
-- ## O que esta carga aplica, e o que NAO aplica
--
-- APLICA: 169 lancamentos, R$ 200.490,93, onde a fatia da raiz no ERP e igual
-- ao que o MC poe em manutencao (|R - M| <= R$ 0,02). Nesses o CENTRO ja estava
-- certo e faltava so a ETAPA -- a maquina. Sai da raiz e vai para 37 destinos.
-- 236 linhas de rateio novas.
--
-- NAO APLICA: 22 lancamentos, R$ 68.004,10, em que o MC poe o dinheiro FORA da
-- manutencao (R$ 66.770,85 em 'Empresa', o resto nas obras). Sao lubrificante
-- em granel da Comercial Mariano e da Vibra, multa e licenciamento de placa que
-- nao existe na frota, e a primeira parcela do 13o. Mudar centro de custo e
-- decisao de contabilidade, nao de casamento de planilha. Fica esperando o
-- Tiago.
--
-- ## O mapa etapa-do-MC -> etapa-do-ERP
--
-- Tabela declarada, nao casamento difuso, para que ele possa discordar de UMA
-- linha sem derrubar as outras. Vive em supabase/carga/mc/5_mapa_etapas.py.
-- Tres fontes, nenhuma inventada:
--
--   a) o que ele ditou em 30/08: escavadeira 01-03 na mesma ordem, retro 06->01
--      e 07->02, rolo 012->01 e 013->02, motoniveladora 010->01 e 011->02,
--      cacamba com sufixo = codigo - 105, cavalo XF530 -> SQS7E01;
--   b) as donas que ele declarou: BX6180/Agrale/Amarok e a maquina fora da
--      frota -> Amazonia; Dynapac, rolo chapa, meloza Colorado, espargidor
--      Colorado, usina 59, Leeboy, AF5500 e Valtra -> Colorado; usina Ciber ->
--      obra BR-364;
--   c) nome identico, porque o MC de 2026 ja usa o nome do ERP com placa.
--
-- A ponte de codigo se confirmou por DUAS pistas: a ordem que ele deu e o
-- MODELO que o MC traz junto (0108 e "2423 K/36" e a -03 tambem; 109/110/111
-- sao todos "2425/48" e as -04/-05/-06 tambem).
--
-- Um `assert` no topo do mapa recusa ALIAS que aponte para etapa que nao existe
-- no ERP. Sem isso um erro de digitacao viraria uuid nulo e a carga inteira.
--
-- ## Fatia de R$ 0,00 nao gera linha
--
-- O MC tem "0007 Caterpillar 416E R$ 0,00" no LAN-2026-2291. Rateio zerado e
-- lixo no relatorio de custo por equipamento, entao filtrei. E por isso que sao
-- 236 linhas novas e nao 237.
--
-- ## O que fica travado de proposito: R$ 12.028,58
--
--   as quatro Hilux do MC  R$ 10.864,38  "Hilux Apoio - 203", "Hilux de Apoio
--                          Cinza - 209", "0205 Hilux James", "0207 Hilux Tiago".
--                          O ERP tem CINCO Hilux e nenhuma se chama assim.
--   duas Yamaha            R$    684,20  ele citou a Honda BROS, nao a Yamaha
--   Motor Compactador      R$    420,00  501 e 502, nao existem no cadastro
--   Skidy                  R$     40,00  nao existe e ele nao citou
--   Prancha 104            R$     20,00  o ERP tem tres carretas, nenhuma prancha
--
-- Quando UMA fatia do rateio nao resolve, o lancamento INTEIRO fica na raiz. Meia
-- aplicacao deixaria a soma fora do valor e a trigger abortaria de qualquer jeito.
--
-- ## O extrato da Areacre responde a pergunta do frete
--
-- Ele mandou junto o extrato de conta-corrente da Areacre. Sao 61 fretes de
-- julho/2026, R$ 928.024,53, e **todos os 61 sao da obra 009** (BGS, rachao,
-- brita, po de pedra). Nenhum e manutencao de equipamento.
--
-- Isso poderia condenar os R$ 27.000 do LAN-2026-5080 que estao na raiz, mas a
-- descricao inteira do lancamento salva: "FRETE DAS PEDRAS DO MES DE FEVEREIRO
-- **E TRANSPORTE DE EQUIPAMENTOS DE PVH X CZS**". Os R$ 27.000 sao o transporte
-- das maquinas de Porto Velho a Cruzeiro do Sul, e ficam onde estao. O extrato e
-- de julho e o lancamento de abril, entao ele nao cobre esse documento -- ler o
-- campo inteiro resolveu o que a planilha nao alcancava.
--
-- Ja o LAN-2026-2361 ("10 mil litros S10 obra BR Gregorio + 15 mil obra
-- Gregorio + 5 mil obra Ramal Gama") nao tem nada de manutencao: os R$ 732,40
-- na raiz estao errados e o MC diz 12.500 para a 009 e 2.500 para a 003. Esse
-- esta no bloco dos 22 que espera decisao.
--
-- ## Linha de controle
--
-- A raiz cai R$ 200.490,93 mas a subarvore cai so R$ 17.467,21, porque quase
-- tudo vai para etapa DENTRO da Manutencao. Os R$ 17.467,21 sao exatamente as
-- donas que ele declarou fora dela:
--
--   Manutencao de Equipamentos da Amazonia   R$ 11.987,43
--   002 - Equipamentos Colorado 2026         R$  4.728,78
--   009 - Manutencao da Rodovia BR-364       R$    751,00
--
-- Mais: 236 linhas novas exatas, nenhuma sem categoria, rateio de todo
-- lancamento fechando com o valor, e DRE por tipo inalterado.
--
-- Rodei este mesmo bloco como ENSAIO antes (com um `raise exception` no fim, que
-- desfaz mas roda tudo). Passou as nove checagens e devolveu
-- "raiz R$ 379.670,20 -> R$ 179.179,27, 236 linhas novas".

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  AMAZ uuid := 'df5637cd-0c9d-45de-b06f-26cd31a0d666';
  COL uuid := '891f3c63-f7e5-49fb-a97c-9c99deeadc2b';
  BR uuid := 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0';
  v_lin_a int; v_lin_d int; v_div int; v_orfa int;
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_amz_a numeric; v_amz_d numeric; v_col_a numeric; v_col_d numeric;
  v_br_a numeric; v_br_d numeric; v_tipo_a jsonb; v_tipo_d jsonb;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_amz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=AMAZ;
  select coalesce(sum(r.valor),0) into v_col_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COL;
  select coalesce(sum(r.valor),0) into v_br_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=BR;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;

  -- UM statement: o CTE atualiza a linha da raiz e insere as outras fatias
  -- junto, porque trg_valida_soma_do_rateio dispara AFTER ROW.
  execute $sql$
with lk(cod, centro) as (values
  ('d00','89c0e402-44b5-4c6e-9fab-e0599ff8faff'),
  ('d01','9887b0ad-6976-4a53-a9ea-8b8e075036fd'),
  ('d02','ca178d7a-9a96-4ea8-89ef-0afc529861f4'),
  ('d03','8ca85387-84cb-43c1-8efc-9ed2fcc5cd38'),
  ('d04','65e52b5f-f73b-4a91-a7b1-f8bcb468f625'),
  ('d05','aed7508e-980a-45c1-8e81-b9f8069f04de'),
  ('d06','3969995c-17d4-464e-919e-e7d6f04ac9bf'),
  ('d07','85186912-2b85-4f39-8fde-03653ce9b7eb'),
  ('d08','dd85e0ef-6025-4822-99b1-cb76209e0655'),
  ('d09','a1b86608-7314-4126-b6c5-3dd3118a278e'),
  ('d10','df5637cd-0c9d-45de-b06f-26cd31a0d666'),
  ('d11','3363f638-7733-4ea8-9e91-31e010b793f5'),
  ('d12','17e1ae32-6aae-4902-98e7-8736a76d1a78'),
  ('d13','057cfab1-5866-416d-8bd8-f4a474b4e4a1'),
  ('d14','891f3c63-f7e5-49fb-a97c-9c99deeadc2b'),
  ('d15','5d318cd1-2ab6-476b-8855-4604afdb0648'),
  ('d16','2c218b6b-19a5-43e0-b9c7-2ee818d6cc92'),
  ('d17','e2a026bd-a760-49e6-a061-eb50a091a815'),
  ('d18','f814cb00-a3cd-4bae-a8b7-dc400cd52e20'),
  ('d19','516ed0a3-c5b5-4868-b421-179a64fc36bb'),
  ('d20','1082490f-394b-4cfc-993e-41dd1d48e4a4'),
  ('d21','5a96c3dd-098f-4200-920f-eeb14e172431'),
  ('d22','5d88db63-5cfb-4fea-b086-0b50941e64b4'),
  ('d23','a4caefbd-3337-4ad2-9ff7-1aa79c00f8f3'),
  ('d24','90fa1568-7075-4e9d-a830-89ea4aaad554'),
  ('d25','a5af7702-2a63-45de-86d4-7995d060fee9'),
  ('d26','10b2d20c-a31e-42cb-ae3d-7b68a7b41c44'),
  ('d27','fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0'),
  ('d28','afd2f665-0090-4224-b89d-c61ed3c035bb'),
  ('d29','384bf96d-3ce6-4ae3-acdf-cb478e049148'),
  ('d30','9043d5e9-7690-4e95-9783-5a8e6c4ccf2b'),
  ('d31','56067493-d147-4e9a-9cd5-8c77c7f3e9c2'),
  ('d32','bb6d309d-6921-4170-9890-abf1c583f635'),
  ('d33','6d348bb6-9e19-4b25-8203-dfe1351c73d5'),
  ('d34','a28f35d9-552c-4c39-a20e-1ae840621ed8'),
  ('d35','169c784b-b0ed-4a04-b13e-4a414b3514be'),
  ('d36','78f2c7a0-07f3-4867-a33e-9514e889c789')
), pl(num, ordem, cod, valor) as (values
  ('0007',1,'d00',384.70),
  ('0007',2,'d01',76.00),
  ('0007',3,'d02',76.00),
  ('0013',1,'d02',2466.66),
  ('0013',2,'d03',1933.33),
  ('0013',3,'d04',1666.66),
  ('0013',4,'d05',600.00),
  ('0067',1,'d06',200.25),
  ('0095',1,'d07',648.50),
  ('0095',2,'d08',247.74),
  ('0130',1,'d09',140.00),
  ('0130',2,'d10',130.00),
  ('0143',1,'d05',1940.31),
  ('0143',2,'d11',629.69),
  ('0159',1,'d12',20.00),
  ('0176',1,'d12',121.00),
  ('0189',1,'d05',1206.49),
  ('0189',2,'d10',488.34),
  ('0189',3,'d02',143.63),
  ('0189',4,'d13',129.27),
  ('0189',5,'d11',129.27),
  ('0189',6,'d12',107.43),
  ('0189',7,'d14',104.85),
  ('0189',8,'d08',104.85),
  ('0189',9,'d15',104.85),
  ('0189',10,'d16',57.45),
  ('0189',11,'d17',43.09),
  ('0189',12,'d07',43.09),
  ('0207',1,'d18',771.52),
  ('0207',2,'d07',438.14),
  ('0207',3,'d02',390.52),
  ('0207',4,'d05',390.52),
  ('0207',5,'d12',390.52),
  ('0279',1,'d01',3268.00),
  ('0279',2,'d02',3268.00),
  ('0290',1,'d12',95.00),
  ('0328',1,'d19',994.00),
  ('0328',2,'d20',994.00),
  ('0333',1,'d12',10.00),
  ('0354',1,'d21',88.82),
  ('0442',1,'d22',62.64),
  ('0442',2,'d14',29.58),
  ('0460',1,'d18',150.00),
  ('0460',2,'d23',120.00),
  ('0469',1,'d12',200.00),
  ('0473',1,'d11',110.00),
  ('0473',2,'d07',110.00),
  ('0513',1,'d12',97.20),
  ('0596',1,'d10',2417.46),
  ('0619',1,'d12',30.00),
  ('0685',1,'d12',450.00),
  ('0730',1,'d17',822.70),
  ('0730',2,'d24',106.65),
  ('0732',1,'d04',40.00),
  ('0732',2,'d11',20.00),
  ('0732',3,'d14',20.00),
  ('0734',1,'d12',1000.00),
  ('0747',1,'d06',55.00),
  ('0747',2,'d12',19.80),
  ('0747',3,'d15',10.85),
  ('0780',1,'d12',1600.00),
  ('0788',1,'d11',216.00),
  ('0788',2,'d07',216.00),
  ('0788',3,'d05',216.00),
  ('0788',4,'d15',216.00),
  ('0817',1,'d05',111.18),
  ('0817',2,'d06',23.82),
  ('0844',1,'d19',116.13),
  ('0874',1,'d12',500.00),
  ('0878',1,'d11',379.90),
  ('0878',2,'d07',379.90),
  ('0891',1,'d12',3000.00),
  ('0947',1,'d12',246.21),
  ('1023',1,'d12',40.00),
  ('1073',1,'d25',1923.02),
  ('1073',2,'d00',776.98),
  ('1141',1,'d12',300.00),
  ('1183',1,'d13',237.05),
  ('1205',1,'d15',1436.30),
  ('1239',1,'d01',875.00),
  ('1239',2,'d02',845.00),
  ('1285',1,'d08',120.00),
  ('1285',2,'d26',50.00),
  ('1323',1,'d27',171.00),
  ('1323',2,'d14',43.20),
  ('1442',1,'d12',135.00),
  ('1456',1,'d21',1667.87),
  ('1456',2,'d01',456.13),
  ('1575',1,'d14',170.00),
  ('1580',1,'d09',30.15),
  ('1611',1,'d07',135.00),
  ('1611',2,'d26',105.00),
  ('1611',3,'d11',30.00),
  ('1611',4,'d28',20.00),
  ('1680',1,'d02',1784.20),
  ('1680',2,'d21',936.75),
  ('1699',1,'d07',105.00),
  ('1699',2,'d01',70.00),
  ('1699',3,'d00',40.00),
  ('1705',1,'d13',469.53),
  ('1705',2,'d03',179.53),
  ('1735',1,'d21',386.67),
  ('1743',1,'d10',927.48),
  ('1743',2,'d25',590.00),
  ('1743',3,'d09',354.00),
  ('1743',4,'d24',191.45),
  ('1743',5,'d13',130.39),
  ('1743',6,'d01',118.00),
  ('1743',7,'d29',118.00),
  ('1743',8,'d21',118.00),
  ('1743',9,'d00',118.00),
  ('1743',10,'d03',88.50),
  ('1743',11,'d06',88.50),
  ('1743',12,'d20',59.00),
  ('1743',13,'d15',32.45),
  ('1743',14,'d02',16.23),
  ('1748',1,'d12',417.33),
  ('1748',2,'d01',15.30),
  ('1748',3,'d02',15.30),
  ('1748',4,'d13',15.30),
  ('1748',5,'d19',15.30),
  ('1748',6,'d20',15.30),
  ('1748',7,'d07',6.48),
  ('1775',1,'d12',170.00),
  ('1812',1,'d12',745.98),
  ('1835',1,'d10',125.00),
  ('1835',2,'d28',30.00),
  ('1835',3,'d17',25.00),
  ('1835',4,'d08',25.00),
  ('1835',5,'d20',25.00),
  ('1835',6,'d13',20.00),
  ('1835',7,'d00',20.00),
  ('1874',1,'d18',162.00),
  ('1874',2,'d07',92.00),
  ('1874',3,'d02',82.00),
  ('1874',4,'d05',82.00),
  ('1874',5,'d12',82.00),
  ('1959',1,'d19',2989.75),
  ('1981',1,'d12',1000.00),
  ('2062',1,'d12',632.70),
  ('2101',1,'d13',144.00),
  ('2101',2,'d02',20.00),
  ('2112',1,'d12',2372.60),
  ('2116',1,'d26',100.00),
  ('2116',2,'d07',100.00),
  ('2199',1,'d05',50.00),
  ('2199',2,'d06',50.00),
  ('2219',1,'d12',200.00),
  ('2291',1,'d25',8315.60),
  ('2313',1,'d10',198.15),
  ('2326',1,'d06',1277.29),
  ('2343',1,'d05',490.28),
  ('2343',2,'d15',74.80),
  ('2379',1,'d14',60.00),
  ('2418',1,'d11',300.00),
  ('2418',2,'d05',300.00),
  ('2525',1,'d27',580.00),
  ('2527',1,'d19',62.50),
  ('2527',2,'d20',62.50),
  ('2620',1,'d02',1760.00),
  ('2620',2,'d21',1760.00),
  ('2653',1,'d03',1540.00),
  ('2653',2,'d01',1480.00),
  ('2653',3,'d02',1480.00),
  ('2653',4,'d00',60.00),
  ('2679',1,'d11',285.00),
  ('2679',2,'d12',190.00),
  ('2682',1,'d29',7240.00),
  ('2682',2,'d01',2330.00),
  ('2682',3,'d02',2330.00),
  ('2720',1,'d04',500.00),
  ('2720',2,'d13',500.00),
  ('2867',1,'d01',698.00),
  ('2867',2,'d02',698.00),
  ('2923',1,'d02',142.68),
  ('2928',1,'d03',2780.00),
  ('2928',2,'d00',1185.00),
  ('2976',1,'d12',700.00),
  ('3011',1,'d07',200.00),
  ('3011',2,'d02',85.00),
  ('3011',3,'d05',50.00),
  ('3031',1,'d18',771.52),
  ('3031',2,'d07',438.14),
  ('3031',3,'d12',400.33),
  ('3031',4,'d02',390.52),
  ('3031',5,'d05',390.52),
  ('3071',1,'d18',756.64),
  ('3071',2,'d30',542.82),
  ('3071',3,'d11',537.27),
  ('3071',4,'d07',537.27),
  ('3072',1,'d03',380.00),
  ('3072',2,'d08',80.00),
  ('3072',3,'d01',50.00),
  ('3072',4,'d13',45.00),
  ('3072',5,'d00',40.00),
  ('3072',6,'d18',40.00),
  ('3072',7,'d11',40.00),
  ('3072',8,'d16',30.00),
  ('3072',9,'d05',30.00),
  ('3072',10,'d25',25.00),
  ('3072',11,'d07',25.00),
  ('3072',12,'d21',20.00),
  ('3072',13,'d14',20.00),
  ('3095',1,'d06',60.00),
  ('3111',1,'d07',607.39),
  ('3111',2,'d06',512.47),
  ('3111',3,'d08',417.58),
  ('3111',4,'d31',417.58),
  ('3111',5,'d26',417.58),
  ('3133',1,'d02',710.00),
  ('3133',2,'d01',360.00),
  ('3155',1,'d10',80.00),
  ('3163',1,'d12',200.00),
  ('3172',1,'d32',200.00),
  ('3181',1,'d12',515.00),
  ('3266',1,'d06',275.00),
  ('3266',2,'d25',230.00),
  ('3266',3,'d14',205.00),
  ('3266',4,'d03',95.00),
  ('3266',5,'d04',50.00),
  ('3280',1,'d10',480.00),
  ('3280',2,'d18',50.00),
  ('3314',1,'d10',119.68),
  ('3314',2,'d17',112.20),
  ('3317',1,'d01',320.00),
  ('3317',2,'d02',320.00),
  ('3317',3,'d29',320.00),
  ('3318',1,'d10',1180.00),
  ('3512',1,'d11',260.78),
  ('3532',1,'d14',330.00),
  ('3540',1,'d26',1861.76),
  ('3540',2,'d11',1861.76),
  ('3540',3,'d07',930.88),
  ('3544',1,'d21',193.20),
  ('3550',1,'d26',1861.76),
  ('3550',2,'d11',1861.76),
  ('3550',3,'d07',930.88),
  ('3556',1,'d21',2350.00),
  ('3556',2,'d25',684.00),
  ('3591',1,'d00',600.00),
  ('3620',1,'d10',1999.99),
  ('3627',1,'d02',15.00),
  ('3627',2,'d21',15.00),
  ('3633',1,'d26',250.00),
  ('3633',2,'d07',250.00),
  ('3660',1,'d19',1940.00),
  ('3660',2,'d20',1540.00),
  ('3660',3,'d33',1069.99),
  ('3688',1,'d00',121.25),
  ('3688',2,'d03',121.24),
  ('3814',1,'d11',160.82),
  ('3814',2,'d26',122.28),
  ('3814',3,'d07',122.28),
  ('3815',1,'d25',100.00),
  ('3815',2,'d00',20.00),
  ('3826',1,'d12',300.00),
  ('3829',1,'d26',473.21),
  ('3829',2,'d08',464.29),
  ('3829',3,'d11',62.50),
  ('3959',1,'d32',50.00),
  ('3977',1,'d34',3082.00),
  ('3977',2,'d35',588.38),
  ('4003',1,'d34',125.00),
  ('4003',2,'d35',125.00),
  ('4106',1,'d01',268.00),
  ('4106',2,'d02',268.00),
  ('4106',3,'d29',268.00),
  ('4143',1,'d12',150.00),
  ('4146',1,'d15',353.17),
  ('4146',2,'d01',344.89),
  ('4146',3,'d11',341.44),
  ('4146',4,'d08',302.44),
  ('4146',5,'d20',265.30),
  ('4146',6,'d03',238.77),
  ('4146',7,'d10',238.77),
  ('4146',8,'d07',223.38),
  ('4146',9,'d05',197.12),
  ('4146',10,'d25',185.71),
  ('4146',11,'d17',65.79),
  ('4146',12,'d29',53.06),
  ('4146',13,'d06',53.06),
  ('4146',14,'d13',26.53),
  ('4147',1,'d20',30.00),
  ('4334',1,'d10',30.00),
  ('4334',2,'d15',24.00),
  ('4354',1,'d01',102.74),
  ('4354',2,'d02',102.73),
  ('4354',3,'d19',102.73),
  ('4354',4,'d20',102.73),
  ('4363',1,'d18',159.35),
  ('4363',2,'d30',114.35),
  ('4363',3,'d11',113.15),
  ('4363',4,'d07',113.15),
  ('4370',1,'d03',854.00),
  ('4370',2,'d13',766.00),
  ('4370',3,'d01',170.00),
  ('4370',4,'d02',170.00),
  ('4370',5,'d29',85.00),
  ('4399',1,'d17',55.00),
  ('4399',2,'d00',40.00),
  ('4399',3,'d25',20.00),
  ('4399',4,'d08',20.00),
  ('4399',5,'d26',20.00),
  ('4399',6,'d07',20.00),
  ('4497',1,'d11',975.49),
  ('4497',2,'d05',760.92),
  ('4497',3,'d07',698.90),
  ('4497',4,'d19',186.04),
  ('4497',5,'d10',155.04),
  ('4497',6,'d14',116.59),
  ('4497',7,'d25',62.01),
  ('4497',8,'d18',62.01),
  ('4497',9,'d13',55.81),
  ('4497',10,'d28',27.91),
  ('4589',1,'d07',50.00),
  ('4696',1,'d13',500.00),
  ('4696',2,'d03',500.00),
  ('4698',1,'d05',160.00),
  ('4698',2,'d11',90.00),
  ('4698',3,'d07',70.00),
  ('4703',1,'d07',180.00),
  ('4703',2,'d13',150.00),
  ('4703',3,'d08',120.00),
  ('4703',4,'d36',90.00),
  ('4703',5,'d01',50.00),
  ('4703',6,'d14',50.00),
  ('4703',7,'d00',45.00),
  ('4703',8,'d02',40.00),
  ('4703',9,'d25',30.00),
  ('4703',10,'d12',25.00),
  ('4703',11,'d20',20.00),
  ('4703',12,'d10',20.00),
  ('4718',1,'d09',100.00),
  ('4718',2,'d10',100.00),
  ('4742',1,'d18',162.00),
  ('4742',2,'d07',92.00),
  ('4742',3,'d02',82.00),
  ('4742',4,'d05',82.00),
  ('4742',5,'d12',82.00),
  ('4751',1,'d05',1902.95),
  ('4751',2,'d15',339.35),
  ('4772',1,'d19',1360.00),
  ('4881',1,'d12',200.00),
  ('4902',1,'d02',120.00),
  ('4931',1,'d14',480.00),
  ('4931',2,'d24',120.00),
  ('4935',1,'d10',1180.00),
  ('4961',1,'d14',40.00),
  ('5023',1,'d12',500.00),
  ('5053',1,'d13',1750.00),
  ('5053',2,'d03',1750.00),
  ('5067',1,'d05',380.00),
  ('5067',2,'d03',140.00),
  ('5067',3,'d02',110.00),
  ('5067',4,'d01',20.00),
  ('5067',5,'d29',20.00),
  ('5067',6,'d00',20.00),
  ('5067',7,'d11',20.00),
  ('5067',8,'d28',20.00),
  ('5082',1,'d03',240.00),
  ('5082',2,'d14',100.00),
  ('5082',3,'d15',25.00),
  ('5082',4,'d02',25.00),
  ('5082',5,'d09',25.00),
  ('5082',6,'d25',20.00),
  ('5105',1,'d19',3483.71),
  ('5105',2,'d20',2719.77),
  ('5109',1,'d12',178.20),
  ('5109',2,'d08',9.31),
  ('5139',1,'d08',182.75),
  ('5285',1,'d12',2100.00),
  ('5313',1,'d12',333.00),
  ('5330',1,'d12',100.00),
  ('5373',1,'d21',6686.27),
  ('5373',2,'d29',1313.73),
  ('5380',1,'d25',89.63),
  ('5380',2,'d07',45.37),
  ('5449',1,'d12',6.60),
  ('5451',1,'d14',776.90),
  ('5463',1,'d11',25.00),
  ('5463',2,'d07',25.00),
  ('5477',1,'d09',100.00),
  ('5526',1,'d26',940.00),
  ('5526',2,'d03',82.00),
  ('5526',3,'d14',20.00),
  ('5528',1,'d18',3470.88),
  ('5528',2,'d10',2082.52),
  ('5528',3,'d08',946.60),
  ('5579',1,'d09',250.00),
  ('5591',1,'d12',600.00),
  ('5607',1,'d08',140.00),
  ('5620',1,'d11',189.95),
  ('5620',2,'d07',189.95),
  ('5633',1,'d03',300.00),
  ('5681',1,'d26',986.00),
  ('5681',2,'d17',210.00),
  ('5681',3,'d07',180.00),
  ('5711',1,'d26',98.00),
  ('5711',2,'d11',62.00),
  ('5711',3,'d07',62.00),
  ('5711',4,'d06',62.00),
  ('5711',5,'d05',62.00),
  ('5764',1,'d10',35.00),
  ('5780',1,'d14',2162.66),
  ('5920',1,'d12',354.20)
), m as (
  select pl.num, pl.ordem, lk.centro::uuid as centro, pl.valor::numeric as valor
  from pl join lk on lk.cod = pl.cod
), upd as (
  update public.lancamento_rateios r
     set centro_custo_id = m.centro, valor = m.valor
    from public.lancamentos l, m
   where l.id = r.lancamento_id and l.numero = 'LAN-2026-' || m.num
     and r.centro_custo_id = 'fbd2556a-3e96-474b-818f-ff536a288dff'
     and m.ordem = 1
  returning r.lancamento_id, r.categoria_id, r.created_by, m.num
)
insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
select u.lancamento_id, m.centro, m.valor, u.categoria_id, u.created_by
from upd u join m on m.num = u.num and m.ordem > 1;
  $sql$;

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_amz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=AMAZ;
  select coalesce(sum(r.valor),0) into v_col_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COL;
  select coalesce(sum(r.valor),0) into v_br_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=BR;
  select coalesce(sum(r.valor),0) into v_sub_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;
  select count(*) into v_orfa from public.lancamento_rateios r
  where r.categoria_id is null and r.created_at > now() - interval '5 minutes';

  if v_lin_d - v_lin_a <> 236 then raise exception 'Nasceram % linhas em vez de 236.', v_lin_d-v_lin_a; end if;
  if v_orfa > 0 then raise exception '% fatia(s) nasceram sem categoria.', v_orfa; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  if round(v_amz_d - v_amz_a, 2) <> 11987.43 then
    raise exception 'Amazonia subiu R$ % em vez de 11987.43.', v_amz_d-v_amz_a; end if;
  if round(v_col_d - v_col_a, 2) <> 4728.78 then
    raise exception 'Colorado subiu R$ % em vez de 4728.78.', v_col_d-v_col_a; end if;
  if round(v_br_d - v_br_a, 2) <> 751.00 then
    raise exception 'BR-364 subiu R$ % em vez de 751.00.', v_br_d-v_br_a; end if;
  -- a raiz cai TUDO; a subarvore cai so o que tem dona declarada fora dela
  if round(v_raiz_a - v_raiz_d, 2) <> 200490.93 then
    raise exception 'A raiz caiu R$ % em vez de 200490.93.', v_raiz_a-v_raiz_d; end if;
  if round(v_sub_a - v_sub_d, 2) <> 17467.21 then
    raise exception 'A subarvore caiu R$ % em vez de 17467.21.', v_sub_a-v_sub_d; end if;

  raise notice 'OK. Raiz R$ % -> R$ %. 236 linhas novas.', v_raiz_a, v_raiz_d;
end $aplica$;