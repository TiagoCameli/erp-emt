-- Carga do historico de RECEBIMENTOS e TRANSFERENCIAS do Mais Controle.
--
-- Aplicada no banco em 20/08/2026. Este arquivo e o REGISTRO do que entrou e de
-- como as escolhas foram feitas: os dados vieram por uma tabela de staging
-- temporaria (_stg_receb / _stg_transf), ja removida, alimentada a partir dos
-- arquivos em
--   ~/Desktop/personal-os/outputs/extracao-maiscontrole/2026-08-20/
-- (o PDF do relatorio, o texto extraido, o CSV das transferencias e o parser).
--
-- ## O que entrou
--
--   497 recebimentos  R$ 31.518.528,98   (05/12/2024 a 30/07/2026)
--   319 transferencias R$ 41.828.914,95  (02/01/2025 a 28/07/2026)
--   4 categorias de receita novas, 4 clientes novos
--
-- ## De onde vieram os numeros, e como sabemos que estao certos
--
-- Recebimentos: relatorio "Recebimento" do Mais Controle, periodo 01/12/2024 a
-- 31/08/2026, com rodape Recebido R$ 38.918.166,21 / Em aberto R$ 0,00. O PDF
-- foi lido por DOIS parsers independentes -- um por texto corrido e outro por
-- coordenadas (pdftotext -bbox-layout) -- e os dois chegaram nos MESMOS 570
-- registros, na MESMA soma de R$ 38.918.166,21 e na mesma distribuicao por
-- conta. E o rodape do proprio relatorio que serve de prova de fecho.
--
-- Transferencias: tela Financeiro > Contas Bancarias > Transferencias, mesmo
-- periodo, 322 registros somando R$ 41.863.914,96. A soma dos efeitos liquidos
-- por conta da ZERO, que e o que uma transferencia tem que dar.
--
-- ## O que ficou de fora, e por que
--
-- 73 recebimentos (R$ 7.399.637,23) sem centro de custo identificavel. O Tiago
-- pediu para deixar "para outra hora" o que nao fosse claramente caixa da
-- Amazonia (-> Escritorio Central) ou aplicacao financeira (-> Investimentos).
-- Entre eles esta o UNICO recebimento de dezembro/2024 (R$ 3.334,91, James
-- Castro Cameli) e cinco que trazem "CONSORCIO CRUZEIRO 2 AC 405" na descricao
-- (R$ 1,51 mi), que PARECEM ser da obra 007 mas nao foram assumidos como tal.
--
-- 3 transferencias (R$ 35.000,01) que tocam BANCO DO BRASIL 118.754-6 LAVOURA
-- ou SICREDI 914493, contas que existem no Mais Controle e nao no erp-emt.
-- Decisao do Tiago: pular, em vez de criar as duas contas.
--
-- ## O ajuste do saldo inicial
--
-- `contas_bancarias.saldo_inicial` NAO era o saldo real da conta: tinha sido
-- calibrado como exatamente o total pago de cada conta, para o saldo fechar
-- enquanto os recebimentos nao existiam no app. Carregar recebimento sem mexer
-- nele contaria o mesmo dinheiro duas vezes. Por isso, no mesmo bloco:
--
--   saldo_inicial_novo = saldo_inicial - recebimentos(conta)
--                        - transferencias_recebidas(conta)
--                        + transferencias_enviadas(conta)
--
-- Isso preserva o saldo ATUAL de cada conta exatamente como estava. O bloco
-- media o saldo de todas as contas ANTES, media de novo DEPOIS e levantava
-- excecao se qualquer um tivesse mudado -- a carga inteira era desfeita.
--
-- Consequencia aceita pelo Tiago: a conta BANCO DO BRASIL 1197-5 AMAZONIA fica
-- com saldo inicial NEGATIVO (-R$ 854.793,45). Ela recebeu R$ 1,45 mi em
-- transferencias contra R$ 137 mil de pagamentos registrados, entao o saldo
-- "R$ 0,00" que ela mostra e que provavelmente esta errado -- os pagamentos
-- dela nao estao no erp-emt. O negativo e o residuo disso, nao um erro da carga.
--
-- ## Como cada recebimento virou lancamento
--
--   lancamentos       tipo a_receber, origem 'manual', status 'pago',
--                     data_compra = data do RECEBIMENTO (nao a do vencimento),
--                     observacoes 'Importado do Mais Controle em 20/08/2026'
--   lancamento_rateios  um por lancamento, com o centro de custo do balde
--   lancamento_parcelas um por baixa, status 'pago', com a conta bancaria
--
-- Sao 499 parcelas para 497 lancamentos: o recebimento de R$ 855.837,38 do
-- DERACRE (9a Medicao AC-405 Lote 2) foi baixado em TRES parcelas, em 17 e
-- 18/09/2025. `valor_liquido` nao e preenchido aqui porque e coluna gerada.
--
-- ## Mapeamentos
--
-- Centro de custo:  medicao -> a obra do relatorio (003, 007, 009)
--                   resgate de CDB / BB Rende Facil -> Investimentos
--                   caixa da Amazonia -> Escritorio Central
-- Categoria:        Medicao -> Medicoes de obra (ja existia)
--                   Outras receitas -> ja existia
--                   Prestacao de servicos, Juros de aplicacoes financeiras,
--                   Contrato, Financiamento bancario -> CRIADAS por esta carga
-- Pagador:          criados BANCO DO BRASIL S/A, CAIXA ECONOMICA FEDERAL,
--                   TARIFAS BANCARIAS e BANCO BRADESCO S/A. Nao sao clientes de
--                   obra, mas sao a origem de R$ 17,6 mi em rendimento e
--                   resgate, e o Tiago preferiu ter o pagador preenchido.
--
-- ## Numeracao
--
-- As transferencias foram numeradas por ANO DA PROPRIA DATA (TRF-2025-0001 em
-- diante, TRF-2026-0001 em diante), e nao pelo ano corrente, senao a numeracao
-- nao diria nada. `documento_sequencias` foi acertada no fim para que a proxima
-- transferencia criada pela tela nao repita um numero que ja existe.
--
-- ## Rollback
--
-- supabase/rollbacks/recebimentos_e_transferencias_mc_2026_08_20_rollback.sql

-- Nada a executar: a carga ja foi aplicada. Este arquivo e documentacao.
-- A conferencia abaixo pode ser rodada a qualquer momento e tem que dar tudo
-- true; se algum der false, alguem mexeu no que a carga gravou.

select
  (select count(*) from public.lancamentos
    where tipo = 'a_receber'
      and observacoes = 'Importado do Mais Controle em 20/08/2026') = 497
    as recebimentos_ok,
  (select sum(valor) from public.lancamentos
    where tipo = 'a_receber'
      and observacoes = 'Importado do Mais Controle em 20/08/2026') = 31518528.98
    as soma_recebimentos_ok,
  (select count(*) from public.transferencias_contas
    where observacoes = 'Importado do Mais Controle em 20/08/2026') = 319
    as transferencias_ok,
  (select sum(valor) from public.transferencias_contas
    where observacoes = 'Importado do Mais Controle em 20/08/2026') = 41828914.95
    as soma_transferencias_ok,
  -- LINHA DE CONTROLE: as transferencias entre as cinco contas tem que ser soma
  -- zero. Se der diferente de zero, alguma entrou com origem ou destino errado.
  (select coalesce(sum(case when c.id = t.conta_destino_id then t.valor else -t.valor end), 0)
     from public.transferencias_contas t
     cross join public.contas_bancarias c
    where c.id in (t.conta_origem_id, t.conta_destino_id)) = 0
    as transferencias_somam_zero;
