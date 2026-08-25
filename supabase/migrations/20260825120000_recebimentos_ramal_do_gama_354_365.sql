-- =============================================================
-- Ramal do Gama: as medicoes 5 e 6, uma recebida e uma em aberto
--
-- PEDIDO DO TIAGO (25/08/2026): mandou 354.pdf e "NOTA FISCAL 365.pdf" dizendo
-- "e essas aqui sao duas do ramal do gama".
--
-- ============================================================
-- QUEM PAGA AQUI NAO E O DNIT
-- ============================================================
-- As nove medicoes anteriores eram da BR-364 e o tomador era o DNIT. Estas duas
-- sao de outra obra e de outro pagador: a RECUPERACAO DO RAMAL DO GAMA, em
-- Guajara/AM, contrato 049/2022 da Prefeitura Municipal de Guajara, convenio
-- 00023/2022-UGPE. O tomador nas duas notas e o MUNICIPIO DE GUAJARA, CNPJ
-- 22.812.242/0001-12, que no cadastro esta como "PREFEITURA DE GUAJARA" com esse
-- mesmo CNPJ, ativo. Resolvido pelo CNPJ e nao pelo nome, justamente porque os
-- dois nomes nao sao iguais.
--
-- Centro de custo 003 - Recuperacao do Ramal do Gama. Recebimento na 30.893-5,
-- que e o que as duas notas mandam no campo de dados bancarios.
--
-- ============================================================
-- UMA JA CAIU, A OUTRA NAO -- E ISSO NAO FOI SUPOSTO
-- ============================================================
-- NF 354, 5a medicao, emitida 06/02/2026: RECEBIDA no MESMO DIA. O extrato de
-- fevereiro/2026 da 30.893-5 traz, as 19:01 do dia 06 (a nota foi emitida as
-- 17:48 do mesmo dia), "Transferencia recebida ... 3.704.529,22 C" com historico
-- "06/02 19:01 PAVIMENTACAO RAMAL GAMA" -- o valor liquido exato da nota. Entra
-- como PAGA em 06/02/2026.
--
-- NF 365, 6a medicao, emitida 22/07/2026: entra EM ABERTO, e a razao esta
-- declarada aqui porque nao e uma certeza, e uma ausencia de prova.
--
--   Procurei R$ 951.500,00 em todos os extratos que existem das duas contas do
--   BB e nao esta em nenhum. Procurei tambem o historico "GAMA", que e como o
--   municipio identifica esses creditos: aparece tres vezes ao todo (23/08/2024
--   R$ 3.808.214,63, 31/12/2024 R$ 4.554.470,39 e a propria 354), nunca no valor
--   desta. O extrato de agosto/2026 cobre 31/07 a 21/08 e os unicos creditos de
--   fora sao dois do DNIT e um da Amazonia -- nada do municipio.
--
--   MAS o extrato de julho/2026 da 30.893-5 nao foi levantado, e a nota e do dia
--   22/07. A janela de 22 a 30/07 e cega para mim. Como a nota irma caiu no mesmo
--   dia da emissao, e perfeitamente possivel que esta tambem tenha caido e eu nao
--   esteja vendo.
--
--   Entre marcar como recebido sem prova e deixar em aberto, deixo em aberto: um
--   recebimento inventado suja saldo, DRE e fluxo de caixa de uma vez, e a
--   correcao depois e um clique na tela. Quando o extrato de julho chegar, se o
--   credito estiver la, e so receber a parcela pela data certa. A observacao do
--   lancamento diz isso, para quem abrir a tela saber por que esta em aberto.
--
-- VENCIMENTO: a 354 traz "Parcela 1, A vista" na forma de pagamento. A 365 nao
-- traz prazo nenhum, entao segue a irma: a vista, vencendo na emissao
-- (22/07/2026). Isso a deixa vencida no aging, o que e a leitura correta do que
-- sei hoje -- ou o municipio esta atrasado, ou ela ja foi paga em julho e o
-- extrato vai mostrar.
--
-- COMPETENCIA: nao inventei. Cada nota declara a sua. A 365 tem o campo
-- "Competencia da NFS-e: 22/07/2026" (07/2026), e a 354, no layout antigo, tem
-- "Data do fato gerador: 06/02/2026" (02/2026). Aqui nao dava para usar o mes do
-- servico como nas nove da BR-364: o periodo da 354 vai de 30/11/2024 a
-- 31/12/2025, treze meses, e o da 365 de 01/01/2026 a 21/07/2026.
--
-- ============================================================
-- DOIS LAYOUTS DIFERENTES, DUAS PROVAS CADA
-- ============================================================
-- A 354 e NFS-e antiga ('NOTA CZS' de Cruzeiro do Sul, com quadro "RETENCOES
-- FEDERAIS") e a 365 e DANFSe v1.0. Li as duas com dois parsers -- pdftotext
-- -layout, que le por coluna visual, e -raw, que le na ordem do fluxo interno --
-- e os dois concordam em todos os dez valores. Isso importa porque um valor lido
-- da celula errada mantem a soma total e passa despercebido.
--
-- ISS + IR + INSS = bruto menos liquido, os dois impressos na nota:
--   354: 77.867,14 + 46.720,28 + 64.240,39 = 188.827,81
--        3.893.357,03 - 188.827,81 = 3.704.529,22 (impresso)
--   365: 20.000,00 + 12.000,00 + 16.500,00 =  48.500,00
--        1.000.000,00 -  48.500,00 =   951.500,00 (impresso)
--
-- E as duas notas conferem internamente por aliquota: o ISS e 2% do bruto, o IRRF
-- e 1,2% do bruto e o INSS e 11% da mao de obra declarada na descricao (a 354
-- declara material 3.309.353,48 + mao de obra 584.003,55, que somam o bruto ao
-- centavo; a 365 declara 850.000,00 + 150.000,00).
--
-- O que NAO entra na retencao: na 354, PIS e COFINS estao zerados e a CSLL
-- tambem. Na 365, "Contribuicoes Sociais - Retidas" vem vazio com a legenda
-- "0 - PIS/COFINS/CSLL Nao Retidos", e os R$ 36.500,00 de "PIS/COFINS - Debito
-- Apuracao Propria" sao imposto que a EMT paga ela mesma -- o proprio total da
-- nota os exclui do liquido.
--
-- O ISS das duas esta retido ("Situacao desta NFS-e: Retida" na 354, "Retencao do
-- ISSQN: Retido" na 365), diferente das notas 356 e 361 da BR-364, em que a nota
-- dizia "Nao Retido" e o DNIT retia de todo jeito.
--
-- ============================================================
-- POR QUE A 354 NAO MEXE NO SALDO
-- ============================================================
-- A 30.893-5 tem data de corte 21/08/2026: o saldo conta apenas movimento
-- POSTERIOR a ela, porque o saldo inicial ja veio medido do extrato daquele dia.
-- Um recebimento de fevereiro esta dentro do que o saldo inicial ja contem, entao
-- lanca-lo nao pode somar de novo. E exatamente para isso que a data de corte
-- existe, e a guarda abaixo confere que o saldo nao se moveu.
--
-- So que "o saldo nao mudou" tambem seria verdade se esta migration nao tivesse
-- inserido nada. Por isso ha duas guardas que TEM de mudar: o recebido antes do
-- corte da 30.893-5 sobe exatamente R$ 3.704.529,22 (uma parcela a mais), e o
-- total do centro do Gama sobe R$ 4.656.029,22 (as duas notas). Sem uma linha
-- que muda, a prova passa sem provar nada.
--
-- ============================================================
-- PELA fn_salvar_lancamento, COM O PAGAMENTO POR UPDATE DEPOIS
-- ============================================================
-- As duas nascem pela funcao que a tela usa, para herdar a tolerancia de R$ 1,00
-- entre bruto menos retencoes e liquido, a soma das parcelas, a soma do rateio e
-- a exigencia de centro de custo. A funcao cria parcela pendente, entao a 354
-- recebe o UPDATE de pagamento em seguida -- mesmo caminho que a migration das
-- medicoes do DNIT usou para as quatro que ja existiam. fn_pagar_parcela nao
-- serve aqui: ela recusa por saldo, e as duas contas foram calibradas com saldo
-- atual, nao com o de fevereiro.
--
-- Os dois PDFs subiram antes ao bucket `anexos`, no formato que `pathNovo` gera,
-- e foi conferido no bucket que os objetos existem com 17.684 e 95.994 bytes --
-- os mesmos que vao para `tamanho_bytes`.
-- =============================================================

do $gama$
declare
  v_uid uuid; v_cli uuid; v_cat uuid; v_centro uuid; v_conta uuid;
  n record; v_id uuid; v_arq uuid;
  v_saldo_a numeric; v_saldo_d numeric;
  v_corte_a numeric; v_corte_d numeric;
  v_parc_a int; v_parc_d int;
  v_gama_a numeric; v_gama_d numeric;
  v_criados int := 0;
begin
  select id into v_uid from public.usuarios where email = 'tiago@emtconstrutora.com';
  -- pelo CNPJ, porque a nota diz "MUNICIPIO DE GUAJARA" e o cadastro
  -- "PREFEITURA DE GUAJARA"; e com `ativo`, porque a linha existir nao basta
  select id into v_cli from public.clientes
   where regexp_replace(coalesce(cpf_cnpj,''), '[^0-9]', '', 'g') = '22812242000112'
     and ativo;
  select id into v_cat from public.categorias_financeiras
   where nome = 'Medições de obra' and tipo = 'receita';
  select id into v_centro from public.centros_custo where nome ilike '003%Gama%';
  select id into v_conta from public.contas_bancarias where nome = 'BANCO DO BRASIL 30.893-5';

  if v_uid is null or v_cli is null or v_cat is null or v_centro is null or v_conta is null then
    raise exception 'Cadastro faltando: uid=% cliente=% categoria=% centro=% conta=%',
      v_uid, v_cli, v_cat, v_centro, v_conta;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- ---------- o antes das tres medidas ----------
  v_saldo_a := public.fn_saldo_conta(v_conta);
  select recebido, parcelas into v_corte_a, v_parc_a
    from public.fn_rel_movimento_antes_do_corte() where conta_bancaria_id = v_conta;
  select coalesce(sum(r.valor), 0) into v_gama_a
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
   where r.centro_custo_id = v_centro and l.tipo = 'a_receber' and l.status <> 'cancelado';

  for n in
    select * from (values
      ('354','2026-02-06'::date,'2026-02-01'::date,'2026-02-06'::date,'2026-02-06'::date,
       3893357.03, 3704529.22, 77867.14, 46720.28, 64240.39, '5ª',
       '30/11/2024 a 31/12/2025',
       'arquivos/2026/08/07ccf5ad-7c51-4374-a550-1edd723900b2.pdf',
       'cd1286f5d08ceead723daf1da727eed60ded7f129d349740a9ed5417dda458ae',
       17684, 'NF 354.pdf'),
      ('365','2026-07-22'::date,'2026-07-01'::date,'2026-07-22'::date, null::date,
       1000000.00,  951500.00, 20000.00, 12000.00, 16500.00, '6ª',
       '01/01/2026 a 21/07/2026',
       'arquivos/2026/08/79da658c-c118-4d3d-a798-b334f165465a.pdf',
       'b344b3b6e5b8195ca7ab674c51c953bee22b87e1683be214f0cba751bb1b517b',
       95994, 'NF 365.pdf')
    ) as t(nf, emissao, competencia, vencimento, pagamento,
           bruto, liquido, iss, ir, inss, ordem, periodo,
           path, hash, tamanho, nome_arq)
  loop
    -- rodar duas vezes nao pode criar o dobro
    if exists (
      select 1 from public.lancamentos
       where tipo = 'a_receber' and numero_documento = n.nf
         and cliente_id = v_cli and status <> 'cancelado'
    ) then
      raise notice 'NF % do Gama ja lancada, pulando.', n.nf;
      continue;
    end if;

    v_id := public.fn_salvar_lancamento(
      null,
      jsonb_build_object(
        'tipo', 'a_receber',
        'cliente_id', v_cli,
        'categoria_id', v_cat,
        'conta_bancaria_id', v_conta,
        'descricao', n.ordem || ' medição - Recuperação do Ramal do Gama'
                     || ' (contrato 049/2022)',
        'valor', n.liquido,
        'valor_bruto', n.bruto,
        'retencao_iss', n.iss,
        'retencao_ir', n.ir,
        'retencao_inss', n.inss,
        'data_compra', n.emissao,
        'mes_competencia', n.competencia,
        'data_vencimento', n.vencimento,
        'numero_documento', n.nf,
        'observacoes', 'NFS-e ' || n.nf || ', emitida em '
          || to_char(n.emissao, 'DD/MM/YYYY') || '. '
          || n.ordem || ' medição da recuperação do Ramal do Gama, Guajará/AM, '
          || 'contrato 049/2022 da Prefeitura Municipal de Guajará, '
          || 'convênio 00023/2022-UGPE. Período do serviço: ' || n.periodo || '. '
          || 'Bruto R$ ' || to_char(n.bruto, 'FM999999999990.00')
          || ', retido na fonte R$ ' || to_char(n.bruto - n.liquido, 'FM999999999990.00')
          || ' (ISS ' || to_char(n.iss, 'FM999999999990.00')
          || ' + IRRF ' || to_char(n.ir, 'FM999999999990.00')
          || ' + INSS ' || to_char(n.inss, 'FM999999999990.00')
          || '), líquido R$ ' || to_char(n.liquido, 'FM999999999990.00') || '. '
          || case when n.pagamento is not null then
               'Recebido em ' || to_char(n.pagamento, 'DD/MM/YYYY')
               || ', conferido no extrato da conta 30.893-5: transferência de R$ '
               || to_char(n.liquido, 'FM999999999990.00')
               || ' com histórico "PAVIMENTACAO RAMAL GAMA", no mesmo dia da emissão.'
             else
               'EM ABERTO: este crédito não foi encontrado em nenhum extrato'
               || ' disponível das contas do Banco do Brasil, e o histórico'
               || ' "GAMA" não aparece neste valor. Mas o extrato de julho/2026'
               || ' da 30.893-5 ainda não foi levantado e a nota é do dia 22/07,'
               || ' então a janela de 22 a 30/07 não foi verificada. A nota irmã'
               || ' (354) foi paga no mesmo dia da emissão, então é possível que'
               || ' esta também já tenha caído. Conferir quando o extrato de'
               || ' julho chegar e, se estiver lá, receber a parcela pela data'
               || ' do crédito. Vencimento à vista, como a nota irmã.'
             end),
      jsonb_build_array(jsonb_build_object('valor', n.liquido,
                                           'data_vencimento', n.vencimento)),
      jsonb_build_array(jsonb_build_object('centro_custo_id', v_centro,
                                           'valor', n.liquido)),
      '[]'::jsonb);

    -- a funcao cria parcela pendente; a 354 ja foi recebida
    if n.pagamento is not null then
      update public.lancamento_parcelas
         set status = 'pago', data_pagamento = n.pagamento, conta_bancaria_id = v_conta
       where lancamento_id = v_id;
      update public.lancamentos set status = 'pago' where id = v_id;
    end if;

    insert into public.arquivos (path_storage, nome_original, tipo_mime,
      tamanho_bytes, hash_sha256, created_by)
    values (n.path, n.nome_arq, 'application/pdf', n.tamanho, n.hash, v_uid)
    returning id into v_arq;

    insert into public.anexo_vinculos (arquivo_id, entidade_tipo, entidade_id,
      origem, nome_exibicao, created_by)
    values (v_arq, 'lancamento', v_id, 'upload_direto', n.nome_arq, v_uid);

    v_criados := v_criados + 1;
  end loop;

  -- a invariante do centro de custo, uma vez, com todo rateio ja existindo
  execute 'set constraints all immediate';

  -- ---------- o depois ----------
  v_saldo_d := public.fn_saldo_conta(v_conta);
  select recebido, parcelas into v_corte_d, v_parc_d
    from public.fn_rel_movimento_antes_do_corte() where conta_bancaria_id = v_conta;
  select coalesce(sum(r.valor), 0) into v_gama_d
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
   where r.centro_custo_id = v_centro and l.tipo = 'a_receber' and l.status <> 'cancelado';

  -- ---------- as guardas ----------
  if v_criados <> 2 then
    raise exception 'Esperava criar 2 lancamentos e criei %.', v_criados;
  end if;

  if (select count(*) from public.lancamentos l
       join public.anexo_vinculos av on av.entidade_id = l.id
        and av.entidade_tipo = 'lancamento'
      where l.tipo = 'a_receber' and l.numero_documento in ('354','365')
        and l.cliente_id = v_cli and l.status <> 'cancelado') <> 2 then
    raise exception 'As duas tinham de ficar com um anexo cada.';
  end if;

  if (select count(*) from public.lancamento_parcelas p
       join public.lancamentos l on l.id = p.lancamento_id
      where l.numero_documento = '354' and l.cliente_id = v_cli
        and p.status = 'pago' and p.data_pagamento = '2026-02-06') <> 1 then
    raise exception 'A 354 tinha de ficar paga em 06/02/2026.';
  end if;

  if (select count(*) from public.lancamento_parcelas p
       join public.lancamentos l on l.id = p.lancamento_id
      where l.numero_documento = '365' and l.cliente_id = v_cli
        and p.status = 'pendente') <> 1 then
    raise exception 'A 365 tinha de ficar em aberto.';
  end if;

  -- A que nao pode mudar: a 354 e de fevereiro, anterior ao corte de 21/08.
  if v_saldo_d <> v_saldo_a then
    raise exception
      'O saldo da 30.893-5 mudou de R$ % para R$ %. Recebimento anterior ao corte ja esta no saldo inicial e nao pode somar de novo.',
      to_char(v_saldo_a,'FM999999999990.00'), to_char(v_saldo_d,'FM999999999990.00');
  end if;

  -- As que TEM de mudar, senao a guarda de cima passa sem provar nada.
  if v_corte_d - v_corte_a <> 3704529.22 or v_parc_d <> v_parc_a + 1 then
    raise exception
      'O recebido antes do corte foi de R$ % para R$ % (delta %, esperado 3704529.22) e as parcelas de % para % (esperado +1).',
      to_char(v_corte_a,'FM999999999990.00'), to_char(v_corte_d,'FM999999999990.00'),
      to_char(v_corte_d - v_corte_a,'FM999999999990.00'), v_parc_a, v_parc_d;
  end if;

  if v_gama_d - v_gama_a <> 4656029.22 then
    raise exception
      'O total do centro do Gama foi de R$ % para R$ % (delta %, esperado 4656029.22).',
      to_char(v_gama_a,'FM999999999990.00'), to_char(v_gama_d,'FM999999999990.00'),
      to_char(v_gama_d - v_gama_a,'FM999999999990.00');
  end if;

  raise notice 'Ramal do Gama: 354 recebida em 06/02 e 365 em aberto, com a nota anexada. Saldo intacto em R$ %, recebido antes do corte R$ %, centro do Gama R$ %.',
    to_char(v_saldo_d,'FM999999999990.00'), to_char(v_corte_d,'FM999999999990.00'),
    to_char(v_gama_d,'FM999999999990.00');
end $gama$;
