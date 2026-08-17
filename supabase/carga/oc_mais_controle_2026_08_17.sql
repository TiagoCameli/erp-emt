-- Carga das 17 ordens de compra do Mais Controle que ainda não estão aprovadas e
-- não têm lançamento. Lidas do próprio Mais Controle em 17/08/2026 (não de
-- planilha nem de print): número, fornecedor, condição, itens com insumo do
-- catálogo, quantidade, preço unitário, obra de cada item e os ajustes do rodapé.
--
-- Total: R$ 235.738,60 em 17 ordens e 31 itens.
--
-- ## O que este arquivo NÃO faz
--
-- Não aprova e não cria lançamento. As ordens entram em `rascunho`, que é o
-- equivalente do "Em aberto" do Mais Controle: é o estado em que elas estão lá.
--
-- ## Mapeamentos, todos medidos e não inventados
--
-- Centro de custo (o mapa 1:1 confirmado na carga anterior de lançamentos):
--   MC `009 ... Lote 09` e `010 ... Lote 10`  -> erp `009 ... Lote 09 & 10`
--   MC `0.2 - Equipamentos EMT 2026`          -> erp `Manutenção/Documentação de Equipamentos`
--   MC `0.3 - Equipamentos Colorado 2026`     -> erp `002 - Equipamentos Colorado 2026`
--   MC `003 - Recuperação do Ramal do Gama`   -> igual nos dois
--
-- Fornecedor: 12 dos 14 casam pelo nome exato. Os outros dois vão por ID porque
-- casar por nome erraria:
--   `Areacre - Josias` é `JOSIAS O DA SILVA LTDA` / fantasia `Areacre`
--     (CNPJ 19892960000131, 39 lançamentos). O nome do MC não bate com nada.
--   `MARANATA GÁS` tem DOIS cadastros no erp-emt. Vale o de 26/06
--     (`M NASCIMENTO DA SILVA LTDA`, 36 lançamentos); o de 05/08 é duplicata órfã.
--
-- `data_compra` é a data de CRIAÇÃO no MC. O MC não tem campo de competência na
-- ordem de compra (conferido na aba Informações): ele só define competência quando
-- gera o lançamento. Por isso as três ordens cuja descrição diz "CAIXA DO DIA
-- 31/07/2026" ficam com competência de AGOSTO, que é quando foram lançadas.
--
-- ## A única suposição do arquivo, e ela está marcada
--
-- `condicao_pagamento_id` é NOT NULL, e em quatro ordens o Mais Controle escreve
-- só "BOLETO" na condição, que é FORMA de pagamento e não prazo. Elas entram com
-- `Boleto 30 dias`, a única condição de boleto do erp-emt, e a observação de cada
-- uma registra que o MC não informou o prazo. São ordens em rascunho: o prazo se
-- corrige num clique antes de aprovar.

do $$
declare
  v_falta text;
  v_n int;
begin
  -- ------------------------------------------------------------------
  -- Cabeçalhos
  -- ------------------------------------------------------------------
  create temp table _oc (
    num text primary key, forn uuid, cond uuid, forma uuid,
    data date, descricao text, frete numeric, outras numeric,
    impostos numeric, desconto numeric, total_mc numeric, obs text
  ) on commit drop;

  insert into _oc (num, forn, cond, forma, data, descricao, frete, outras, impostos, desconto, total_mc, obs)
  select d.num,
         coalesce(d.forn_id, (select f.id from public.fornecedores f
                               where f.ativo
                                 and upper(btrim(coalesce(f.nome_fantasia, f.razao_social))) = upper(btrim(d.forn_nome))
                               limit 1)),
         (select c.id from public.condicoes_pagamento c where c.descricao = d.cond_desc),
         (select fp.id from public.formas_pagamento fp where fp.nome = d.forma_nome),
         d.data, nullif(d.descricao, ''), d.frete, 0, d.impostos, d.desconto, d.total_mc,
         'Ordem de compra Mais Controle ' || d.num
           || E'\nCondição no Mais Controle: ' || d.cond_mc
           || case when d.cond_mc in ('BOLETO') then
                E'\nATENÇÃO: o Mais Controle informou apenas "BOLETO", sem prazo. Condição preenchida como "Boleto 30 dias" por suposição — confirmar antes de aprovar.'
              else '' end
  from (values
    ('2607','Areacre - Josias','783c2db2-c6bc-40a5-8a7a-eea9e2f17e84'::uuid,'15 dias',null,        '15 dias', date '2026-08-17','',                        0,     0,    0.02, 10000.00),
    ('2606','VIBRA ENERGIA S.A',null::uuid,                                  '30 dias',null,        '30',      date '2026-08-17','',                        0,     0.01, 0,    29473.50),
    ('2605','VIBRA ENERGIA S.A',null::uuid,                                  '30 dias',null,        '30',      date '2026-08-17','',                        0,     0.02, 0,    91155.00),
    ('2604','PARCEIRAO DO ELETRICISTA',null::uuid,                    'Boleto 30 dias','Boleto',    'BOLETO',  date '2026-08-15','',                        0,     0,    22.62, 151.38),
    ('2603','AUTO ELETR. TEIXEIRA',null::uuid,                        'Boleto 30 dias','Boleto',    'BOLETO',  date '2026-08-15','',                        0,     0,    0,     820.00),
    ('2602','CS46-PEMAZA',null::uuid,                                 'Boleto 30 dias','Boleto',    'BOLETO',  date '2026-08-15','',                        0,     0,    0,     520.00),
    ('2601','RONDOBRAS',null::uuid,                                   'Boleto 30 dias','Boleto',    'BOLETO',  date '2026-08-15','',                        5.99,  0,    0,    2200.55),
    ('2600','GOL LOG',null::uuid,                                          'À vista','PIX',         'PIX',     date '2026-08-14','',                        0,     0,    0,     375.17),
    ('2599','MARANATA GÁS','158c0412-1788-4862-8128-21e7b180663a'::uuid,   'À vista','Dinheiro',    'Dinheiro',date '2026-08-14','CAIXA DO DIA 01/08/2026', 0,     0,    0,     135.00),
    ('2598','MARANATA GÁS','158c0412-1788-4862-8128-21e7b180663a'::uuid,   'À vista','Dinheiro',    'Dinheiro',date '2026-08-14','CAIXA DO DIA 01/08/2026', 0,     0,    0,     134.00),
    ('2597','ORLEIR COSTA OLIVEIRA - CARÁ',null::uuid,                     'À vista','Dinheiro',    'Dinheiro',date '2026-08-14','CAIXA DO DIA 01/08/2026', 0,     0,    0,     500.00),
    ('2596','AUTO POSTO AMAZONIA II',null::uuid,                           'À vista','Dinheiro',    'Dinheiro',date '2026-08-14','CAIXA DO DIA 01/08/2026', 0,     0,    0,      50.00),
    ('2586','CRUZEIRO PEÇAS',null::uuid,                                   'À vista','Dinheiro',    'Dinheiro',date '2026-08-14','CAIXA DO DIA 01/08/2026', 0,     0,    0,      40.00),
    ('2595','FRANCISCO FUX DA SILVA',null::uuid,                           'À vista','Dinheiro',    'Dinheiro',date '2026-08-14','CAIXA DO DIA 31/07/2026', 0,     0,    0,     160.00),
    ('2594','TRANS LIMA EXPRESS',null::uuid,                               'À vista','Dinheiro',    'Dinheiro',date '2026-08-14','CAIXA DO DIA 31/07/2026', 0,     0,    0,      10.00),
    ('2593','CRUZEIRO PEÇAS',null::uuid,                                   'À vista','Dinheiro',    'Dinheiro',date '2026-08-14','CAIXA DO DIA 31/07/2026', 0,     0,    0,      14.00),
    ('2592','BRITAS DA AMAZONIA MINERACAO E COMERCIO - BRITAM',null::uuid, 'À vista','PIX',         'PIX Á VISTA',date '2026-08-14','',                     0,     0, 3835.95, 100000.00)
  ) as d(num, forn_nome, forn_id, cond_desc, forma_nome, cond_mc, data, descricao, frete, impostos, desconto, total_mc);

  select count(*) into v_n from _oc;
  if v_n <> 17 then raise exception 'esperava 17 cabeçalhos, montou %', v_n; end if;

  select string_agg(num, ', ') into v_falta from _oc where forn is null;
  if v_falta is not null then raise exception 'fornecedor não resolvido em: %', v_falta; end if;
  select string_agg(num, ', ') into v_falta from _oc where cond is null;
  if v_falta is not null then raise exception 'condição de pagamento não resolvida em: %', v_falta; end if;

  -- Não recarregar em cima de si mesma.
  select string_agg(num, ', ') into v_falta from _oc o
   where exists (select 1 from public.ordens_compra x
                  where x.observacoes like 'Ordem de compra Mais Controle ' || o.num || '%');
  if v_falta is not null then
    raise exception 'estas ordens já foram carregadas antes: %', v_falta;
  end if;

  -- ------------------------------------------------------------------
  -- Itens
  -- ------------------------------------------------------------------
  create temp table _it (
    num text, cod text, qtd numeric, preco numeric, centro_mc text, centro uuid
  ) on commit drop;

  insert into _it (num, cod, qtd, preco, centro_mc, centro)
  select d.num, d.cod, d.qtd, d.preco, d.centro_mc,
         (select cc.id from public.centros_custo cc where cc.nome = d.centro_erp)
  from (values
    ('2607','10093',        1140.34, 6.5770,'009 Lote 09','009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10'),
    ('2607','10259',         390.95, 6.3947,'009 Lote 09','009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10'),
    ('2606','10259',        4609.05, 6.3947,'010 Lote 10','009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10'),
    ('2605','10093',       13859.66, 6.5770,'009 Lote 09','009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10'),
    ('2604','1335M544PE157',     1, 27.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2604','6050',              4,  9.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2604','1182',             16,  3.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2604','1335M544PE213',     1, 14.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2604','1335M544PE275',     1, 10.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2604','10069',             1,  5.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2604','10068',             1, 34.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2603','1335M544PE66',      1,100.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2603','1335M544PE327',     1,680.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2603','1335M544PE66',      1, 40.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2602','55',                1, 22.45,  '0.3 Colorado','002 - Equipamentos Colorado 2026'),
    ('2602','1335M285',          1,143.35,  '0.3 Colorado','002 - Equipamentos Colorado 2026'),
    ('2602','1335M544PE325',     2, 82.09,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2602','1335M544PE326',     2, 95.01,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2601','114',               1,2194.56, '0.3 Colorado','002 - Equipamentos Colorado 2026'),
    ('2600','894',               1,375.17,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2599','10231',             1,135.00,  '003 Gama','003 - Recuperação do Ramal do Gama'),
    ('2598','10231',             1,134.00,  '010 Lote 10','009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10'),
    ('2597','799',               1,500.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2596','184',           6.282,  7.96,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2586','779',               2, 20.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2595','799',               1,160.00,  '010 Lote 10','009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10'),
    ('2594','10164',             1, 10.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2593','10043',             2,  7.00,  '0.2 EMT','Manutenção/Documentação de Equipamentos'),
    ('2592','1335M348',      466.2,101.65,  '009 Lote 09','009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10'),
    ('2592','1335M390',      421.1,106.73,  '009 Lote 09','009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10'),
    ('2592','1335M349',       94.3,121.98,  '009 Lote 09','009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10')
  ) as d(num, cod, qtd, preco, centro_mc, centro_erp);

  select count(*) into v_n from _it;
  if v_n <> 31 then raise exception 'esperava 31 itens, montou %', v_n; end if;

  select string_agg(distinct num, ', ') into v_falta from _it where centro is null;
  if v_falta is not null then raise exception 'centro de custo não resolvido em: %', v_falta; end if;

  select string_agg(distinct cod, ', ') into v_falta
    from _it where not exists (select 1 from public.insumos i where i.codigo = _it.cod);
  if v_falta is not null then raise exception 'insumo não encontrado: %', v_falta; end if;

  select string_agg(num, ', ') into v_falta
    from (select num from _it group by num) x where not exists (select 1 from _oc o where o.num = x.num);
  if v_falta is not null then raise exception 'item sem cabeçalho: %', v_falta; end if;

  -- ------------------------------------------------------------------
  -- Grava
  -- ------------------------------------------------------------------
  create temp table _novo (num text primary key, oc uuid) on commit drop;

  with inserido as (
    insert into public.ordens_compra
      (fornecedor_id, condicao_pagamento_id, forma_pagamento_id, status,
       data_compra, mes_competencia, descricao, observacoes,
       frete, outras_despesas, impostos, desconto)
    select o.forn, o.cond, o.forma, 'rascunho',
           o.data, date_trunc('month', o.data)::date, o.descricao, o.obs,
           o.frete, o.outras, o.impostos, o.desconto
    from _oc o
    returning id, observacoes
  )
  insert into _novo (num, oc)
  select substring(i.observacoes from 'Mais Controle (\d+)'), i.id from inserido i;

  select count(*) into v_n from _novo;
  if v_n <> 17 then raise exception 'gravou % ordens, esperava 17', v_n; end if;

  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  select n.oc, (select i.id from public.insumos i where i.codigo = t.cod limit 1),
         t.qtd, t.preco, t.centro
  from _it t join _novo n on n.num = t.num;

  select count(*) into v_n from public.oc_itens i join _novo n on n.oc = i.ordem_compra_id;
  if v_n <> 31 then raise exception 'gravou % itens, esperava 31', v_n; end if;

  -- ------------------------------------------------------------------
  -- A prova: o total de CADA ordem tem que dar o mesmo do Mais Controle
  -- ------------------------------------------------------------------
  select string_agg(o.num || ' (erp ' || x.valor_total || ' vs mc ' || o.total_mc || ')', '; ')
    into v_falta
  from _oc o
  join _novo n on n.num = o.num
  join public.ordens_compra x on x.id = n.oc
  where x.valor_total <> o.total_mc;

  if v_falta is not null then
    raise exception 'total divergente do Mais Controle em: %', v_falta;
  end if;

  raise notice 'carga ok: 17 ordens, 31 itens, todos os totais iguais ao Mais Controle';
end $$;
