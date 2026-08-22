-- =============================================================
-- As nove medicoes do DNIT: lancar as cinco que faltam e corrigir as quatro
--
-- PEDIDO DO TIAGO (22/08/2026): "lanca todas essas e corrige as que ja foram
-- lancadas para bater exatamente com o extrato do banco e com as notas ficais,
-- as que nao tem no extrato coloque como esta na nota."
--
-- ============================================================
-- DE ONDE VEM CADA NUMERO
-- ============================================================
-- `valor_bruto` = "Valor do Servico" da nota. `valor` = o que o banco CREDITOU,
-- lido do extrato da conta 30.893-5, oito das nove como "Ordem Banc 12 Sec Tes
-- Nac" ou "DEPART.NAC.INFRA".
--
-- A NOTA 362 e a excecao e esta como ele mandou: julho/2026 e o unico mes de 2026
-- sem extrato dessa conta, entao o valor vem da propria nota (R$ 4.540.548,51) e
-- a data do credito e ESTIMADA em 23/07/2026, um mes depois da emissao, que e o
-- prazo que ele descreveu. Fica registrado em observacoes: numero da nota,
-- data suposta.
--
-- ============================================================
-- A DECOMPOSICAO DAS RETENCOES, E O QUE EU NAO INVENTEI
-- ============================================================
-- Com nome proprio vai so o que a nota nomeia sem ambiguidade:
--   retencao_iss  <- "ISSQN Apurado" / o ISS da NFS-e antiga
--   retencao_ir   <- "IRRF"
--   retencao_inss <- "Contribuicao Previdenciaria - Retida"
--   pis/cofins/csll <- SO nas notas 345 e 350, as duas do layout antigo, que
--                      listam os cinco tributos federais um por um
--
-- Nas sete DANFSe o resto vai em `retencao_outras`, de proposito. Elas informam
-- um AGREGADO ("Contribuicoes Sociais - Retidas: 3 - PIS/COFINS/CSLL Retidos") e
-- nao a quebra; e em cinco delas o "PIS/COFINS - Debito Apuracao Propria" tambem
-- sai do liquido, enquanto em duas nao sai. Decompor isso seria inventar regra
-- fiscal. O total esta certo e conferido; a quebra fica como a nota entregou, e
-- e decisao do Tiago se vale abrir depois.
--
-- ============================================================
-- O ISSQN E RETIDO MESMO QUANDO A NOTA DIZ "NAO RETIDO"
-- ============================================================
-- Duas notas trazem o ISSQN marcado como nao retido, e o extrato mostra que o
-- DNIT retem:
--   nota 356: liquido impresso 2.227.816,95 - ISSQN 48.169,01 = 2.179.647,94
--             creditado no extrato: 2.179.647,95
--   nota 361: liquido impresso 6.922.525,80 - ISSQN 56.128,59 = 6.866.397,21
--             creditado no extrato: 6.866.397,24
-- E dai que vem R$ 48.169,00 dos R$ 88.172,14 que estao hoje lancados a mais.
--
-- ============================================================
-- ISTO NAO MEXE NO SALDO BANCARIO, E ISSO FOI MEDIDO
-- ============================================================
-- As nove entraram na conta entre 30/01/2026 e 05/08/2026, e a 30.893-5 tem data
-- de corte em 21/08/2026 (migration 20260822240000). Todas caem ANTES do corte,
-- entao alimentam DRE, custo de obra e extrato do cliente sem mover o saldo, que
-- ja bate com o extrato. Provado em transacao desfeita: saldo antes e depois,
-- R$ 1.406.246,33 nos dois.
--
-- ============================================================
-- A COMPETENCIA MUDA EM DUAS
-- ============================================================
-- As notas 345 e 350 cobrem novembro e dezembro de 2025 e estavam lancadas com
-- competencia 02/2026. Passam para o mes do servico, que e o que a nota diz e o
-- que ele pediu ("bater com as notas fiscais"). Efeito: R$ 5.077.636,30 de
-- receita saem de 2026 e vao para 2025, onde o custo delas ja estava.
-- =============================================================

do $carga$
declare
  v_cli uuid; v_cat uuid; v_centro uuid; v_conta uuid; v_uid uuid;
  n record; v_lanc uuid;
  v_saldo_antes numeric; v_saldo_depois numeric;
  v_corrigidas int := 0; v_criadas int := 0;
  v_total numeric;
begin
  select id into v_uid from public.usuarios where email = 'tiago@emtconstrutora.com';
  select id into v_cli from public.clientes where nome like 'Departamento Nacional%';
  select id into v_cat from public.categorias_financeiras
   where nome = 'Medições de obra' and tipo = 'receita';
  select id into v_centro from public.centros_custo where nome like '009%';
  select id into v_conta from public.contas_bancarias where nome = 'BANCO DO BRASIL 30.893-5';

  if v_cli is null or v_cat is null or v_centro is null or v_conta is null then
    raise exception 'Cadastro faltando: cliente=% categoria=% centro=% conta=%',
      v_cli, v_cat, v_centro, v_conta;
  end if;

  v_saldo_antes := public.fn_saldo_conta(v_conta);

  for n in
    select * from (values
      ('345','2026-01-16'::date,'2025-11-01'::date,'2026-01-30'::date, 3243566.33, 2935427.53,  64871.33, 38922.79,  53518.84, 21083.18, 97306.99, 32435.66,      0.01, 'LAN-2026-6195', false),
      ('350','2026-01-30'::date,'2025-12-01'::date,'2026-02-18'::date, 2367081.49, 2142208.77,  47341.63, 28404.98,  39056.84, 15386.03, 71012.44, 23670.81,      0.00, 'LAN-2026-6196', false),
      ('356','2026-03-05'::date,'2026-01-01'::date,'2026-03-23'::date, 2408450.74, 2179647.95,  48169.01, 28901.41,  39739.43,     0.00,     0.00,     0.00, 111992.94, 'LAN-2026-6252', false),
      ('359','2026-03-20'::date,'2026-02-01'::date,'2026-04-07'::date, 2576284.98, 2363741.48,  19322.14, 30915.42,  42508.70,     0.00,     0.00,     0.00, 119797.24, 'LAN-2026-6286', false),
      ('360','2026-05-07'::date,'2026-03-01'::date,'2026-05-19'::date, 3567204.63, 3272910.26,  26754.03, 42806.46,  58858.88,     0.00,     0.00,     0.00, 165875.00, null,            false),
      ('361','2026-05-21'::date,'2026-04-01'::date,'2026-06-11'::date, 7483811.68, 6866397.24,  56128.59, 89805.74, 123482.89,     0.00,     0.00,     0.00, 347997.22, null,            false),
      ('362','2026-06-23'::date,'2026-05-01'::date,'2026-07-23'::date, 4962348.09, 4540548.51,  49623.48, 59548.18,  81878.74,     0.00,     0.00,     0.00, 230749.18, null,            true),
      ('363','2026-07-15'::date,'2026-06-01'::date,'2026-08-05'::date, 4290559.52, 3936588.37,  32179.20, 51486.71,  70794.23,     0.00,     0.00,     0.00, 199511.01, null,            false),
      ('364','2026-07-15'::date,'2026-06-01'::date,'2026-08-05'::date, 3599159.26, 3275234.94,  53987.39, 43189.91,  59386.13,     0.00,     0.00,     0.00, 167360.89, null,            false)
    ) as t(nf, emissao, competencia, credito, bruto, creditado,
           iss, ir, inss, pis, cofins, csll, outras, lanc, data_estimada)
  loop
    if n.lanc is not null then
      select id into v_lanc from public.lancamentos where numero = n.lanc;
      if v_lanc is null then
        raise exception 'Lancamento % nao encontrado: a base mudou desde a conferencia.', n.lanc;
      end if;
      update public.lancamentos set
        valor = n.creditado,
        valor_bruto = n.bruto,
        retencao_iss = n.iss, retencao_ir = n.ir, retencao_inss = n.inss,
        retencao_pis = n.pis, retencao_cofins = n.cofins, retencao_csll = n.csll,
        retencao_outras = n.outras,
        numero_documento = n.nf,
        data_compra = n.emissao,
        mes_competencia = n.competencia,
        data_vencimento = n.credito,
        observacoes = concat_ws(E'\n', observacoes,
          'Conferido contra a NF ' || n.nf || ' e o extrato da conta 30.893-5 em 22/08/2026: '
          || 'bruto R$ ' || to_char(n.bruto,'FM999999999990.00')
          || ', creditado R$ ' || to_char(n.creditado,'FM999999999990.00') || '.')
      where id = v_lanc;
      -- Uma parcela por medicao (pagamento unico do DNIT). O update cobre as
      -- tres coisas que mudam: valor, data do credito e vencimento.
      update public.lancamento_parcelas set
        valor = n.creditado, data_pagamento = n.credito, data_vencimento = n.credito,
        conta_bancaria_id = coalesce(conta_bancaria_id, v_conta)
      where lancamento_id = v_lanc;
      update public.lancamento_rateios set valor = n.creditado where lancamento_id = v_lanc;
      v_corrigidas := v_corrigidas + 1;
    else
      insert into public.lancamentos (tipo, origem, cliente_id, categoria_id, descricao,
        valor, valor_bruto, retencao_iss, retencao_ir, retencao_inss,
        retencao_pis, retencao_cofins, retencao_csll, retencao_outras,
        status, data_compra, mes_competencia, data_vencimento, numero_documento,
        observacoes, created_by)
      values ('a_receber', 'manual', v_cli, v_cat, 'Medição',
        n.creditado, n.bruto, n.iss, n.ir, n.inss, n.pis, n.cofins, n.csll, n.outras,
        'pago', n.emissao, n.competencia, n.credito, n.nf,
        'NF ' || n.nf || ' da manutencao da BR-364. Bruto R$ '
          || to_char(n.bruto,'FM999999999990.00') || ', creditado R$ '
          || to_char(n.creditado,'FM999999999990.00') || '.'
          || case when n.data_estimada then
               ' ATENCAO: data do credito ESTIMADA (um mes depois da emissao) e valor'
               || ' tirado da propria nota, porque o extrato de julho/2026 da conta'
               || ' 30.893-5 nao foi levantado. Conferir quando ele chegar.'
             else '' end,
        v_uid)
      returning id into v_lanc;

      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
      values (v_lanc, v_centro, n.creditado, v_uid);

      insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor,
        data_vencimento, status, conta_bancaria_id, data_pagamento, created_by)
      values (v_lanc, 1, n.creditado, n.credito, 'pago', v_conta, n.credito, v_uid);
      v_criadas := v_criadas + 1;
    end if;
  end loop;

  -- A invariante do centro de custo, uma vez, depois de todo rateio existir.
  execute 'set constraints all immediate';

  -- ---------- as tres linhas de controle ----------
  if v_corrigidas <> 4 or v_criadas <> 5 then
    raise exception 'Esperava corrigir 4 e criar 5, e fiz % e %.', v_corrigidas, v_criadas;
  end if;

  select coalesce(sum(l.valor), 0) into v_total
  from public.lancamentos l
  where l.tipo = 'a_receber' and l.status <> 'cancelado'
    and l.categoria_id = v_cat
    and l.numero_documento in ('345','350','356','359','360','361','362','363','364');
  if v_total <> 31512705.05 then
    raise exception 'A soma das nove medicoes deu R$ % e o extrato diz R$ 31.512.705,05.',
      to_char(v_total, 'FM999999999990.00');
  end if;

  -- A que mais importa: nada disto pode mover o saldo, porque as nove sao
  -- anteriores a data de corte da conta.
  v_saldo_depois := public.fn_saldo_conta(v_conta);
  if v_saldo_depois <> v_saldo_antes then
    raise exception
      'O saldo da 30.893-5 mudou de R$ % para R$ %. As nove medicoes sao anteriores ao corte de 21/08 e nao deviam mover nada.',
      to_char(v_saldo_antes, 'FM999999999990.00'), to_char(v_saldo_depois, 'FM999999999990.00');
  end if;

  raise notice 'Medicoes DNIT: % corrigidas, % criadas, soma R$ %, saldo intacto em R$ %.',
    v_corrigidas, v_criadas, to_char(v_total,'FM999999999990.00'),
    to_char(v_saldo_depois,'FM999999999990.00');
end $carga$;
