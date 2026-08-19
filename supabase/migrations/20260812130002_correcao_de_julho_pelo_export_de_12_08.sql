-- =============================================================
-- Julho/2026: o que o maiscontrole mudou depois do export de 11/08
--
-- ACHADO. Julho estava R$ 164.281,37 abaixo do maiscontrole. Com o export em
-- nivel de parcela de 12/08/2026 (687 linhas, 587 parcelas, liquido
-- R$ 6.607.138,48, igual ao rodape da tela), a diferenca de multiconjunto
-- contra as 562 parcelas do ERP fecha exata nas duas pontas:
--
--   faltam no ERP ..: 37 parcelas   R$ 182.420,24
--   sobram no ERP ..: 12 parcelas   R$  18.138,87
--   liquido ........:               R$ 164.281,37
--
-- AS 12 QUE SOBRAM NAO SAO ERRO DA CARGA: sao lancamentos que o maiscontrole
-- EDITOU depois do export, e por isso nao existem mais na forma que carregamos.
-- Tres grupos, todos conferidos linha a linha:
--
--   01/07  duas tarifas de PIX (17,78 + 37,29) viraram uma de 55,07
--   20/07  duas guias de FGTS  (505,09 + 7.102,35) viraram uma de 7.607,44
--   06/07  oito pagamentos de folha viraram sete, MESMO total R$ 10.476,36,
--          com valor corrigido pessoa por pessoa:
--            JOAO SANTIAGO DE OLIVEIRA      2.267,70 -> 2.201,04
--            ANTONIO DA SILVA SOUZA-SANTIM  1.521,93 -> 2.159,68
--            ANTONIO TELES MESSIAS          1.905,07 -> 1.943,95
--            CLAUDEILSON FIGUEREDO ALVES    2.620,58 -> 1.943,95
--            FRANCISCO ELISSON SILVA CARMO    333,22 ->   200,00
--            JEFERSON MELO DOS SANTOS       1.299,55 -> saiu
--            CLELTON PEREIRA OLIVEIRA            --  -> 1.499,43 (entrou)
--            duas tarifas (17,91 + 510,40)          ->   528,31
--
-- COMO. Substituicao, e nao remendo de valor: as 12 saem e as 37 do export
-- entram. O arquivo e a fonte de verdade e ja traz o rateio por centro de cada
-- uma; recalcular proporcao na mao (o pagamento do Joao Santiago rateia em dois
-- centros) seria inventar numero que o export ja da.
--
-- DELETE e nao soft delete, pelo mesmo motivo da migration que removeu a carga
-- estimada: isto nao e o usuario excluindo lancamento, e conserto de carga
-- tecnica. Mandar para a lixeira entupiria a tela que serve para recuperar
-- exclusao legitima. As 12 sao todas de parcela unica e nenhuma tem extrato,
-- folha, recebimento ou adiantamento apontando para ela -- a migration verifica
-- isso antes de apagar e aborta se achar.
--
-- Os lancamentos nascem por fn_salvar_lancamento, para ter parcela, rateio,
-- numero e status pela regra normal. O pagamento e marcado direto e nao passa
-- por fn_pagar_parcela de proposito: ela exige saldo em conta, e as contas
-- estao em zero por decisao do Tiago, entao a guarda recusaria pagamento
-- historico que de fato aconteceu.
--
-- Depois disto julho bate ao centavo: R$ 6.607.138,48.
-- =============================================================

-- -------------------------------------------------------------
-- PARTE 1: as 12 superadas saem
-- -------------------------------------------------------------
do $$
declare
  v_ids uuid[];
  v_soma numeric(14,2);
  v_presos int;
begin
  create temp table _superadas(venc date, valor numeric(14,2), fornecedor text) on commit drop;
  insert into _superadas values
    ('2026-07-01',   17.78, 'BANCO DO BRASIL S/A'),
    ('2026-07-01',   37.29, 'BANCO DO BRASIL S/A'),
    ('2026-07-06',   17.91, 'TARIFAS BANCARIAS'),
    ('2026-07-06',  333.22, 'FRANCISCO ELISSON SILVA DO CARMO'),
    ('2026-07-06',  510.40, 'TARIFAS BANCARIAS'),
    ('2026-07-06', 1299.55, 'JEFERSON MELO DOS SANTOS'),
    ('2026-07-06', 1521.93, 'ANTONIO DA SILVA SOUZA - SANTIM'),
    ('2026-07-06', 1905.07, 'ANTONIO TELES MESSIAS'),
    ('2026-07-06', 2267.70, 'JOÃO SANTIAGO DE OLIVEIRA'),
    ('2026-07-06', 2620.58, 'CLAUDEILSON FIGUEREDO ALVES'),
    ('2026-07-20',  505.09, 'FUNDO DE GARANTIA DO TEMPO DE SERVIÇO - FGTS'),
    ('2026-07-20', 7102.35, 'FUNDO DE GARANTIA DO TEMPO DE SERVIÇO - FGTS');

  select coalesce(array_agg(l.id), '{}'), coalesce(sum(p.valor), 0)
    into v_ids, v_soma
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  join public.fornecedores f on f.id = l.fornecedor_id
  join _superadas s
    on s.venc = p.data_vencimento
   and s.valor = p.valor
   and public.fn_chave_nome(f.razao_social) = public.fn_chave_nome(s.fornecedor)
  where (select count(*) from public.lancamento_parcelas x where x.lancamento_id = l.id) = 1;

  -- Replay: se ja rodou, as 12 nao estao mais aqui e nao ha nada a fazer.
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise notice 'As 12 superadas ja nao existem. Parte 1 sem efeito.';
    return;
  end if;

  -- Guarda de identidade: 12 lancamentos e R$ 18.138,87, nem um a mais.
  if array_length(v_ids, 1) <> 12 or v_soma <> 18138.87 then
    raise exception 'Alvo errado: % lancamentos somando %. Esperado 12 e 18138.87.',
      array_length(v_ids, 1), v_soma;
  end if;

  -- Guarda de dependencia: nada de outro modulo pode apontar para eles.
  select count(*) into v_presos from (
    select 1 from public.extrato_transacoes t
      join public.lancamento_parcelas p on p.id = t.parcela_id
     where p.lancamento_id = any(v_ids)
    union all select 1 from public.folha_guias   where lancamento_id = any(v_ids)
    union all select 1 from public.folha_itens   where lancamento_id = any(v_ids)
    union all select 1 from public.recebimentos  where lancamento_id = any(v_ids)
    union all select 1 from public.rh_adiantamentos where lancamento_id = any(v_ids)
    union all select 1 from public.rh_diarias    where lancamento_id = any(v_ids)
  ) x;
  if v_presos > 0 then
    raise exception 'Ha % vinculos de outros modulos nesses lancamentos. Nada removido.', v_presos;
  end if;

  delete from public.lancamento_rateios  where lancamento_id = any(v_ids);
  delete from public.lancamento_parcelas where lancamento_id = any(v_ids);
  delete from public.lancamentos         where id = any(v_ids);

  raise notice 'Removidos 12 lancamentos superados, R$ %.', v_soma;
end $$;

-- -------------------------------------------------------------
-- PARTE 2: as 37 do export entram
-- -------------------------------------------------------------
do $$
declare
  r record;
  v_forn uuid; v_cat uuid; v_forma uuid; v_rateio jsonb; v_cc uuid;
  c record;
  v_criados int := 0;
begin
  create temp table _novas(
    fornecedor text, cnpj text, categoria text, forma text, descricao text,
    valor numeric(14,2), competencia date, vencimento date, pagamento date,
    documento text, rateio jsonb
  ) on commit drop;
  insert into _novas values
    ('BANCO DO BRASIL S/A', null, 'Tarifa Bancária', null, 'TARIFA PIX ENVIADO', 55.07, '2026-07-01', '2026-07-01', '2026-07-01', null, '[{"centro":"Escritório Central","valor":"55.07"}]'::jsonb),
    ('JOÃO SANTIAGO DE OLIVEIRA', null, 'Salário Mão de Obra', 'PIX', 'REFERENTE PAGAMENTO DE SALÁRIO MÊS 06/2026', 2201.04, '2026-07-11', '2026-07-06', '2026-06-26', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"1100.52"},{"centro":"003 - Recuperação do Ramal do Gama","valor":"1100.52"}]'::jsonb),
    ('ANTONIO DA SILVA SOUZA - SANTIM', null, 'Mão de Obra Terceirizada', 'PIX', 'REFERENTE PAGAMENTO DE AJUDA DE CUSTO DO MÊS 06/2026', 2159.68, '2026-07-07', '2026-07-06', '2026-06-26', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"2159.68"}]'::jsonb),
    ('CLAUDEILSON FIGUEREDO ALVES', null, 'Mão de Obra Terceirizada', 'PIX', 'REFERENTE PAGAMENTO DE PRESTAÇÃO DE SERVIÇO DO MÊS 06/2026', 1943.95, '2026-07-07', '2026-07-06', '2026-06-26', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"1943.95"}]'::jsonb),
    ('ANTONIO TELES MESSIAS', null, 'Mão de Obra Terceirizada', 'Transferência', 'REFERENTE PAGAMENTO DE PRESTAÇÃO DE SERVIÇO DO MÊS 06/2026', 1943.95, '2026-07-07', '2026-07-06', '2026-06-26', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"1943.95"}]'::jsonb),
    ('CLELTON PEREIRA OLIVEIRA', null, 'Salário Mão de Obra', 'PIX', 'REFERENTE PAGAMENTO DE SALARIO DO MÊS 06/2026', 1499.43, '2026-07-06', '2026-07-06', '2026-06-29', null, '[{"centro":"Casa James","valor":"1499.43"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 528.31, '2026-07-06', '2026-07-06', '2026-07-06', null, '[{"centro":"Escritório Central","valor":"528.31"}]'::jsonb),
    ('FRANCISCO ELISSON SILVA DO CARMO', null, 'Salário Mão de Obra', 'PIX', 'REFERENTE PAGAMENTO DE AJUDA DE CUSTO MÊS 06/2026', 200.00, '2026-07-11', '2026-07-06', '2026-06-26', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"200.00"}]'::jsonb),
    ('SADRAQUE ARAÚJO', null, 'Frete', 'PIX', 'REFERENTE FRETE DA BOMBA DYNAPAC DE RBR X PVH', 130.00, '2026-07-09', '2026-07-09', '2026-07-09', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"130.00"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 18.20, '2026-07-09', '2026-07-09', '2026-07-09', null, '[{"centro":"Escritório Central","valor":"18.20"}]'::jsonb),
    ('BRENDA CIACCI PEREIRA', null, 'Salário Mão de Obra', 'PIX', 'REFERENTE VALE ADIANTAMENTO DE SALARIO.', 250.00, '2026-07-10', '2026-07-10', '2026-07-10', null, '[{"centro":"Escritório Central","valor":"250.00"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 14.54, '2026-07-10', '2026-07-10', '2026-07-10', null, '[{"centro":"Escritório Central","valor":"14.54"}]'::jsonb),
    ('GRAFFIT PAPELARIA', null, 'Material de Escritório', 'PIX', 'REFERENTE COMPRA DE 10 PENDRIVE DE 8G', 380.00, '2026-07-13', '2026-07-13', '2026-07-13', null, '[{"centro":"Escritório Central","valor":"380.00"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 17.52, '2026-07-13', '2026-07-13', '2026-07-13', null, '[{"centro":"Escritório Central","valor":"17.52"}]'::jsonb),
    ('TRANS ACREANA LTDA', null, 'Viagens', 'PIX', 'REFERENTE PASSAGEM DO GREGORIO X CZS E DE CZS X GREGORIO - FRANCISCO BRUNO COSTA', 128.66, '2026-07-14', '2026-07-14', '2026-07-14', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"128.66"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 11.27, '2026-07-14', '2026-07-14', '2026-07-14', null, '[{"centro":"Escritório Central","valor":"11.27"}]'::jsonb),
    ('JOAO VICTOR FERNANDES OLIVEIRA', null, 'Outras Despesas', 'PIX', 'REFERENTE SERVICO DAS LONAS DA CARRETA SQS 7E01', 350.00, '2026-07-15', '2026-07-15', '2026-07-15', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"350.00"}]'::jsonb),
    ('CASA DAS MANGUEIRAS', null, 'Manutenção', 'PIX', 'REFERENTE CORDA PARA AMARRAR LONA DA CARRETA SQS 7E01', 95.06, '2026-07-15', '2026-07-15', '2026-07-15', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"95.06"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 21.67, '2026-07-15', '2026-07-15', '2026-07-15', null, '[{"centro":"Escritório Central","valor":"21.67"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 19.90, '2026-07-16', '2026-07-16', '2026-07-16', null, '[{"centro":"Escritório Central","valor":"19.90"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TRANSFERÊNCIA ENTRE CONTAS', 49.83, '2026-07-17', '2026-07-17', '2026-07-17', null, '[{"centro":"Escritório Central","valor":"49.83"}]'::jsonb),
    ('FUNDO DE GARANTIA DO TEMPO DE SERVIÇO - FGTS', null, 'FGTS', 'Boleto', 'REFERENTE PAGAMENTO DE FGTS DO MÊS 06/2026', 7607.44, '2026-07-08', '2026-07-20', '2026-07-16', null, '[{"centro":"Escritório Central","valor":"7607.44"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 18.28, '2026-07-20', '2026-07-20', '2026-07-20', null, '[{"centro":"Escritório Central","valor":"18.28"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 43.39, '2026-07-21', '2026-07-21', '2026-07-21', null, '[{"centro":"Escritório Central","valor":"43.39"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 10.00, '2026-07-22', '2026-07-22', '2026-07-22', null, '[{"centro":"Escritório Central","valor":"10.00"}]'::jsonb),
    ('J.G. COSTA LTDA', null, 'Outras Despesas', 'PIX', 'REFERENTE PAGAMENTO DESPESAS OBRA BR 364', 35000.00, '2026-07-23', '2026-07-23', '2026-07-23', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"35000.00"}]'::jsonb),
    ('NORTE - AUTO PEÇAS', '34538850000755', 'Manutenção de Equipamentos', 'Boleto', 'REFERENTE FILTRO DIESEL, CABECOTE DO FILTRO DIESEL 4 FUROS CAMINHÃO NCP 4846', 300.00, '2026-06-27', '2026-07-23', '2026-07-16', '151176', '[{"centro":"Manutenção/Documentação de Equipamentos","valor":"300.00"}]'::jsonb),
    ('HENRY FREITAS DE NORONHA', null, 'Frete', 'PIX', 'REFERENTE FRETE DA SOLENOIDE DA PA CARREGADEIRA', 30.00, '2026-07-23', '2026-07-23', '2026-07-23', null, '[{"centro":"Manutenção/Documentação de Equipamentos","valor":"30.00"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 6.64, '2026-07-23', '2026-07-23', '2026-07-23', null, '[{"centro":"Escritório Central","valor":"6.64"}]'::jsonb),
    ('RONALDO SILVA SOUZA', null, 'Rescisões Trabalhistas Mão de Obra', 'PIX', 'REFERENTE PAGAMENTO ACERTO RESCISAO', 2260.77, '2026-07-24', '2026-07-24', '2026-07-24', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"2260.77"}]'::jsonb),
    ('RONALDO SILVA SOUZA', null, 'Rescisões Trabalhistas Mão de Obra', 'PIX', 'REFERENTE PAGAMENTO VERBAS RESCISORIAS', 1779.65, '2026-07-24', '2026-07-24', '2026-07-24', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"1779.65"}]'::jsonb),
    ('TARIFAS BANCARIAS', null, 'Tarifa Bancária', null, 'TARIFA', 39.38, '2026-07-24', '2026-07-24', '2026-07-24', null, '[{"centro":"Escritório Central","valor":"39.38"}]'::jsonb),
    ('DISK RAPIDO AGUA E GAS', null, 'Outras Despesas', 'PIX', 'REFERENTE PAGAMENTO DESPESAS OBRA BR 364', 10500.00, '2026-07-27', '2026-07-27', '2026-07-27', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"10500.00"}]'::jsonb),
    ('LORENZO DELFOR BAGNOLO', null, 'Mão de Obra Terceirizada', 'PIX', 'REFERENTE PAGAMENTO PRESTAÇÃO DE SERVIÇO', 6000.00, '2026-07-27', '2026-07-27', '2026-07-27', null, '[{"centro":"Escritório Central","valor":"6000.00"}]'::jsonb),
    ('PAULO CESAR BATISTA MARTINS', null, 'Outras Despesas', 'PIX', 'REFERENTE PAGAMENTO DESPESAS RAMAL DO GAMA', 6000.00, '2026-07-27', '2026-07-27', '2026-07-27', null, '[{"centro":"003 - Recuperação do Ramal do Gama","valor":"6000.00"}]'::jsonb),
    ('POSTO DE MOLAS JABA', null, 'Outras Despesas', 'PIX', 'REFERENTE 4 DESLIZANTES, PARAFUSOS, PORCA E SERVICO DE TROCA CARRETA SQU 9C94', 806.61, '2026-07-27', '2026-07-27', '2026-07-27', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"806.61"}]'::jsonb),
    ('BRITAS DA AMAZONIA MINERACAO E COMERCIO - BRITAM', '14666956000131', 'Materiais', 'PIX', 'REFERENTE PAGAMENTO DE PEDRAS PARA OBRA BR 364 - Lote 09', 100000.00, '2026-07-31', '2026-07-31', '2026-07-31', null, '[{"centro":"009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10","valor":"100000.00"}]'::jsonb);

  for r in select * from _novas loop
    -- Fornecedor: por CNPJ quando o export traz um que o cadastro tem sob
    -- outra razao social, por nome no resto. Mesma ordem da carga.
    v_forn := null;
    if r.cnpj is not null then
      select id into v_forn from public.fornecedores
       where regexp_replace(coalesce(cnpj_cpf,''), '\D', '', 'g') = r.cnpj limit 1;
    end if;
    if v_forn is null then
      select id into v_forn from public.fornecedores
       where public.fn_chave_nome(razao_social) = public.fn_chave_nome(r.fornecedor) limit 1;
    end if;

    select id into v_cat from public.categorias_financeiras
     where public.fn_chave_nome(nome) = public.fn_chave_nome(r.categoria) limit 1;

    v_forma := null;
    if r.forma is not null then
      select id into v_forma from public.formas_pagamento
       where public.fn_chave_nome(nome) = public.fn_chave_nome(r.forma) limit 1;
      if v_forma is null then
        raise exception 'Forma de pagamento nao encontrada: %', r.forma;
      end if;
    end if;

    if v_forn is null or v_cat is null then
      raise exception 'Cadastro faltando em % (% / %): fornecedor=% categoria=%',
        r.descricao, r.fornecedor, r.categoria, v_forn, v_cat;
    end if;

    -- Rateio com o centro do ERP no lugar do nome do maiscontrole.
    v_rateio := '[]'::jsonb;
    -- valor vem como texto e e convertido aqui: jsonb_to_recordset direto para
    -- numeric depende de o JSON ser numero, e aqui ele e string de proposito,
    -- para o dinheiro nao passar por float em nenhum ponto.
    for c in select * from jsonb_to_recordset(r.rateio) as x(centro text, valor text) loop
      select id into v_cc from public.centros_custo
       where public.fn_chave_nome(nome) = public.fn_chave_nome(c.centro) limit 1;
      if v_cc is null then
        raise exception 'Centro de custo nao encontrado: %', c.centro;
      end if;
      v_rateio := v_rateio || jsonb_build_object(
        'centro_custo_id', v_cc, 'valor', c.valor::numeric(14,2));
    end loop;

    if (select sum((x->>'valor')::numeric) from jsonb_array_elements(v_rateio) x) <> r.valor then
      raise exception 'Rateio nao fecha com o valor em %: % vs %', r.descricao,
        (select sum((x->>'valor')::numeric) from jsonb_array_elements(v_rateio) x), r.valor;
    end if;

    -- Idempotente: replay nao duplica.
    if exists (
      select 1 from public.lancamentos
       where fornecedor_id = v_forn and descricao = r.descricao
         and valor = r.valor and data_vencimento = r.vencimento
         and observacoes like '%Correcao de julho pelo export do maiscontrole de 12/08/2026.%'
    ) then
      continue;
    end if;

    -- fn_salvar_lancamento exige auth.uid(), dai o papel do usuario.
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}';

    perform public.fn_salvar_lancamento(null,
      jsonb_build_object(
        'tipo','a_pagar', 'fornecedor_id', v_forn, 'categoria_id', v_cat,
        'forma_pagamento_id', v_forma, 'condicao_pagamento_id', null,
        'descricao', r.descricao, 'valor', r.valor,
        'data_compra', to_char(r.competencia,'YYYY-MM-DD'),
        'mes_competencia', to_char(date_trunc('month', r.competencia),'YYYY-MM-DD'),
        'data_vencimento', to_char(r.vencimento,'YYYY-MM-DD'),
        'observacoes', case when r.documento is not null
                            then 'Documento: ' || r.documento || chr(10) else '' end
                       || 'Correcao de julho pelo export do maiscontrole de 12/08/2026.'),
      jsonb_build_array(jsonb_build_object('valor', r.valor,
        'data_vencimento', to_char(r.vencimento,'YYYY-MM-DD'))),
      v_rateio);

    reset role;
    v_criados := v_criados + 1;
  end loop;

  raise notice 'Lancamentos criados: %', v_criados;
end $$;

-- -------------------------------------------------------------
-- PARTE 3: pagamento historico das 37, com a data que o export da
-- -------------------------------------------------------------
do $$
declare
  v_conta uuid; v_pagas int;
begin
  select id into v_conta from public.contas_bancarias
   where public.fn_chave_nome(nome) = public.fn_chave_nome('BANCO DO BRASIL 102.124-9') limit 1;
  if v_conta is null then
    raise exception 'Conta BANCO DO BRASIL 102.124-9 nao encontrada.';
  end if;

  create temp table _pag(vencimento date, valor numeric(14,2), pagamento date) on commit drop;
  insert into _pag
    select distinct vencimento, valor, pagamento from (values
      ('2026-07-01'::date, 55.07::numeric(14,2), '2026-07-01'::date),
      ('2026-07-06'::date, 2201.04::numeric(14,2), '2026-06-26'::date),
      ('2026-07-06'::date, 2159.68::numeric(14,2), '2026-06-26'::date),
      ('2026-07-06'::date, 1943.95::numeric(14,2), '2026-06-26'::date),
      ('2026-07-06'::date, 1943.95::numeric(14,2), '2026-06-26'::date),
      ('2026-07-06'::date, 1499.43::numeric(14,2), '2026-06-29'::date),
      ('2026-07-06'::date, 528.31::numeric(14,2), '2026-07-06'::date),
      ('2026-07-06'::date, 200.00::numeric(14,2), '2026-06-26'::date),
      ('2026-07-09'::date, 130.00::numeric(14,2), '2026-07-09'::date),
      ('2026-07-09'::date, 18.20::numeric(14,2), '2026-07-09'::date),
      ('2026-07-10'::date, 250.00::numeric(14,2), '2026-07-10'::date),
      ('2026-07-10'::date, 14.54::numeric(14,2), '2026-07-10'::date),
      ('2026-07-13'::date, 380.00::numeric(14,2), '2026-07-13'::date),
      ('2026-07-13'::date, 17.52::numeric(14,2), '2026-07-13'::date),
      ('2026-07-14'::date, 128.66::numeric(14,2), '2026-07-14'::date),
      ('2026-07-14'::date, 11.27::numeric(14,2), '2026-07-14'::date),
      ('2026-07-15'::date, 350.00::numeric(14,2), '2026-07-15'::date),
      ('2026-07-15'::date, 95.06::numeric(14,2), '2026-07-15'::date),
      ('2026-07-15'::date, 21.67::numeric(14,2), '2026-07-15'::date),
      ('2026-07-16'::date, 19.90::numeric(14,2), '2026-07-16'::date),
      ('2026-07-17'::date, 49.83::numeric(14,2), '2026-07-17'::date),
      ('2026-07-20'::date, 7607.44::numeric(14,2), '2026-07-16'::date),
      ('2026-07-20'::date, 18.28::numeric(14,2), '2026-07-20'::date),
      ('2026-07-21'::date, 43.39::numeric(14,2), '2026-07-21'::date),
      ('2026-07-22'::date, 10.00::numeric(14,2), '2026-07-22'::date),
      ('2026-07-23'::date, 35000.00::numeric(14,2), '2026-07-23'::date),
      ('2026-07-23'::date, 300.00::numeric(14,2), '2026-07-16'::date),
      ('2026-07-23'::date, 30.00::numeric(14,2), '2026-07-23'::date),
      ('2026-07-23'::date, 6.64::numeric(14,2), '2026-07-23'::date),
      ('2026-07-24'::date, 2260.77::numeric(14,2), '2026-07-24'::date),
      ('2026-07-24'::date, 1779.65::numeric(14,2), '2026-07-24'::date),
      ('2026-07-24'::date, 39.38::numeric(14,2), '2026-07-24'::date),
      ('2026-07-27'::date, 10500.00::numeric(14,2), '2026-07-27'::date),
      ('2026-07-27'::date, 6000.00::numeric(14,2), '2026-07-27'::date),
      ('2026-07-27'::date, 6000.00::numeric(14,2), '2026-07-27'::date),
      ('2026-07-27'::date, 806.61::numeric(14,2), '2026-07-27'::date),
      ('2026-07-31'::date, 100000.00::numeric(14,2), '2026-07-31'::date)
    ) v(vencimento, valor, pagamento);

  -- Duas das 37 tem o mesmo vencimento e o mesmo valor (1.943,95 em 06/07 e
  -- 6.000,00 em 27/07, fornecedores diferentes). Casar por par so e seguro
  -- porque a data de pagamento delas coincide; se algum dia nao coincidir, o
  -- update escolheria uma ao acaso, e ai e melhor falhar.
  if exists (select 1 from _pag group by vencimento, valor having count(*) > 1) then
    raise exception 'Par vencimento+valor com datas de pagamento diferentes. Nada pago.';
  end if;

  update public.lancamento_parcelas p
  set status = 'pago',
      conta_bancaria_id = v_conta,
      data_programada = p.data_vencimento,
      data_programada_origem = 'vencimento',
      data_pagamento = g.pagamento,
      desconto = 0, juros = 0,
      aprovado_por = 'c66fca9f-5428-4fb9-855f-dcff548764df', aprovado_em = now(),
      conferido_por = 'c66fca9f-5428-4fb9-855f-dcff548764df', conferido_em = now(),
      pago_por = 'c66fca9f-5428-4fb9-855f-dcff548764df', pago_em = now()
  from public.lancamentos l, _pag g
  where l.id = p.lancamento_id
    and l.observacoes like '%Correcao de julho pelo export do maiscontrole de 12/08/2026.%'
    and p.data_vencimento = g.vencimento
    and p.valor = g.valor
    and p.status <> 'pago';
  get diagnostics v_pagas = row_count;

  update public.lancamentos l
  set status = 'pago'
  where l.observacoes like '%Correcao de julho pelo export do maiscontrole de 12/08/2026.%'
    and not exists (
      select 1 from public.lancamento_parcelas p
       where p.lancamento_id = l.id and p.status <> 'pago');

  raise notice 'Parcelas marcadas como pagas: %', v_pagas;
end $$;

-- -------------------------------------------------------------
-- PARTE 4: o saldo deriva das parcelas pagas, entao volta a fechar em zero
-- -------------------------------------------------------------
update public.contas_bancarias c
set saldo_inicial = coalesce((
  select sum(case when l.tipo = 'a_receber' then -p.valor_liquido else p.valor_liquido end)
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.conta_bancaria_id = c.id and p.status = 'pago'
), 0);

-- -------------------------------------------------------------
-- PARTE 5: a conferencia, que aborta tudo se julho nao fechar
--
-- Os tres numeros sao os do export de 12/08/2026, e o liquido e o mesmo que o
-- rodape da tela do maiscontrole mostra. Como a migration roda em uma
-- transacao, uma excecao aqui desfaz as partes 1 a 4 -- de proposito: e melhor
-- julho continuar errado e visivel do que meio corrigido e silencioso.
-- -------------------------------------------------------------
do $$
declare
  v_n int; v_face numeric(14,2); v_liq numeric(14,2); v_fora int;
begin
  select count(*), coalesce(sum(p.valor), 0),
         coalesce(sum(p.valor - p.desconto + p.juros), 0)
    into v_n, v_face, v_liq
  from public.lancamento_parcelas p
  where p.data_vencimento between date '2026-07-01' and date '2026-07-31';

  if v_n <> 587 or v_face <> 6613615.49 or v_liq <> 6607138.48 then
    raise exception 'Julho nao fechou: % parcelas, face %, liquido %. Esperado 587, 6613615.49 e 6607138.48.',
      v_n, v_face, v_liq;
  end if;

  select count(*) into v_fora from (
    select c.id from public.contas_bancarias c
    left join public.lancamento_parcelas p
      on p.conta_bancaria_id = c.id and p.status = 'pago'
    left join public.lancamentos l on l.id = p.lancamento_id
    group by c.id, c.saldo_inicial
    having c.saldo_inicial - coalesce(sum(
      case when l.tipo = 'a_receber' then -p.valor_liquido else p.valor_liquido end), 0) <> 0
  ) x;
  if v_fora > 0 then
    raise exception 'Ha % contas com saldo fora de zero depois da correcao.', v_fora;
  end if;

  raise notice 'Julho fechado: % parcelas, face %, liquido %.', v_n, v_face, v_liq;
end $$;
