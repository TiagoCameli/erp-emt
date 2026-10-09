# Financeiro: controle total (travas, reclassificação, rateio do indireto, aplicações, dívidas e consórcios)

**Data:** 09/10/2026 · **Status:** aprovado em conversa pelo Tiago, spec para revisão · **Origem:** reauditoria do Financeiro de 09/10/2026 (vault `projects/erp-emt/auditoria-financeiro-2026-10-09`).

## 1. Objetivo

Fechar todo mês todas as contas com o saldo do sistema igual ao do banco e sem que nada mude depois; saber quanto as aplicações renderam de verdade; ver o custo real de cada obra (com o indireto) e o resultado real da empresa (sem CAPEX, sem retirada de sócio, sem dinheiro de empresa ligada); saber quanto a EMT deve de principal, quanto paga de juros e onde estão os consórcios.

Sucesso:
- Nenhuma operação muda o saldo de um mês conciliado fechado sem reabrir o mês com motivo.
- O DRE de 2026 não tem CAPEX, retirada de sócio nem mútuo em despesa operacional, e tem os juros dos empréstimos no resultado financeiro.
- Cada obra mostra margem com e sem indireto; o rateio de cada mês é conferido pelo Tiago.
- Rendimento de aplicação negativo ou fora do CDI não entra sem confirmação.
- Créditos mostra saldo devedor de principal por contrato; consórcio tem cota, status e carta.

## 2. Decisões (09/10/2026)

| # | Decisão | Origem |
|---|---|---|
| D1 | O saldo inicial atual das contas **fica como está** (já bate com o banco). Mudar passa a exigir motivo e é recusado se a conta tiver mês conciliado fechado. | Tiago |
| D2 | Trava de período por **conta + data ≤ último mês conciliado fechado da conta** (não só o mês exato do movimento). | Proposta aprovada |
| D3 | **Não existe pró-labore formal.** Todo envio a sócio (James Castro Cameli, Tiago de Melo Cameli) e toda despesa pessoal da família paga pela EMT (Casa James, caseiro, mãe do Sr. James, plano de saúde Dona Izete, colégio) vira **distribuição ao sócio beneficiário**, fora do DRE e do custo das obras. | Tiago |
| D4 | Amazônia Agroindústria e Juruá FM são **empresas ligadas**: o que a EMT paga por elas é mútuo (a receber), o que volta abate. Fora do DRE. | Tiago |
| D5 | Galpão Silo continua obra. Aquisição de Equipamentos e Aquisição de Imóveis viram centros de **investimento**. Carretas EMT é unidade própria (não rateia). | Tiago |
| D6 | Indiretos rateados: **Escritório Central, Manutenção/Documentação de Equipamentos, 002 - Equipamentos Colorado 2026**. Base: **custo direto** operacional de cada obra no mês. | Tiago |
| D7 | O rateio é **automático todo mês** e o Tiago pode **ajustar manualmente** os percentuais de cada mês no fechamento; o mês ajustado/confirmado usa os percentuais gravados. | Tiago |
| D8 | O rateio vive **só no relatório**: não cria nem altera lançamento. | Proposta aprovada |
| D9 | Consórcio: **ativo até contemplar**. Fundo comum pago = investimento ("Consórcio a contemplar"); taxa de administração e fundo de reserva = despesa. Contemplou: carta vira o bem; parcelas restantes viram dívida em Créditos. | Tiago |
| D10 | Dados de contrato de dívida e de consórcio vêm dos **PDFs** que o Tiago envia. PR de dados só depois deles. | Tiago |
| D11 | Reclassificação de dados só é aplicada **depois de o Tiago aprovar a planilha de-para**; casos ambíguos vêm marcados para decisão. | Proposta aprovada |
| D12 | Competências de jan/2025 a ago/2026 são fechadas **depois** da reclassificação e do rateio. | Proposta aprovada |
| D13 | Depreciação de equipamento nas obras fica **fora** desta rodada (próximo passo anotado). | Tiago concordou |

## 3. Frentes

### A. Travas de período (PR 1, SQL + mensagens)
- `fn_conciliacao_exigir_data_aberta(p_conta uuid, p_data date)`: recusa quando existe `conciliacao_fechamentos` da conta (ou da conta pai, no caso de subconta) com mês ≥ mês de `p_data`. Mensagem: "Setembro/2026 da conta X está conciliado. Reabra o mês na Conciliação para mudar."
- Chamada em: `fn_pagar_parcela` (conta e data do pagamento), `fn_estornar_pagamento` (troca a checagem do mês exato por esta), `fn_salvar_transferencia` (origem e destino, valores antigos e novos), `fn_excluir_transferencia` (e recusa com mensagem quando houver `extrato_transacoes.transferencia_id`, em vez do erro de FK), `fn_salvar_posicao_aplicacao` (subconta).
- Saldo inicial: trigger em `contas_bancarias` exige motivo (`set_config('app.motivo', ...)` pela action) quando `saldo_inicial` ou `saldo_inicial_data` mudam, grava evento, e recusa se a conta tiver fechamento.
- Painel da conciliação: para cada mês fechado, recalcula o saldo do app no fim do mês; se diferir do `saldo_app` gravado, mostra "Desviou R$ X depois do fechamento" em vermelho.
- Testes: provas SQL em begin/rollback para cada função (paga em mês fechado → erro; mês seguinte → ok; subconta herda a trava da conta pai).

### B. Reclassificação (PR 2 código + aplicação de dados)
- `categorias_financeiras.natureza` ganha `distribuicao` e `mutuo`. Categorias novas: "Distribuição a sócio" (distribuicao), "Mútuo com empresa ligada" (mutuo), "Consórcio a contemplar" (investimento), "Taxa de administração de consórcio" (operacional), "Juros de empréstimos" (financeiro; usada na frente F).
- `centros_custo.tipo` ganha `socio`, `empresa_ligada`, `investimento` (se ainda não aceito). Centros: "Sócio James Castro Cameli" (absorve James Cameli Pessoa Física e Casa James), "Sócio Tiago de Melo Cameli" (novo), Amazônia e Juruá FM → `empresa_ligada`, Aquisição de Equipamentos e Aquisição de Imóveis → `investimento`.
- DRE e relatórios de custo excluem `distribuicao`, `mutuo` e centros `socio`/`empresa_ligada`/`investimento`, pelo mesmo predicado único já usado para `investimento`/`movimentacao`. DRE ganha bloco "Abaixo do resultado: distribuições a sócios".
- Relatório novo "Sócios e ligadas": por sócio, distribuído por mês e no ano; por ligada, enviado, devolvido e saldo do mútuo.
- Log: troca de `natureza` de categoria e de `tipo` de centro grava evento com motivo.
- Dados: script SELECT gera `outputs/reclassificacao-2026-10/de-para.xlsx` (lançamento, rateio, data, valor, descrição, de categoria/centro, para categoria/centro, regra que decidiu, marca "decidir"). Regras: envio a sócio/PF e despesas pessoais → distribuição do sócio; Amazônia/Juruá → mútuo; Paccar, consórcios, Hilux, roll-on, terreno em "Outras despesas" → investimento/consórcio; lançamentos operacionais do centro Aquisição de Equipamentos → "Aquisição de Equipamento", exceto frete/documentação → Manutenção/Documentação. Ambíguos (R$ 5.000 "salário" em obras, custeio de pecuária, Despesas financeiras genéricas) marcados "decidir". Após aprovação, aplicação em lote por RPC que usa o mesmo caminho de `fn_definir_rateio_lancamento` (motivo "Reclassificação 10/2026", histórico preservado).

### C. Rateio do indireto (PR 3)
- `centros_custo.rateia_indireto boolean` (marca os três de D6).
- Tabela `rateio_indireto_meses(mes date pk, status 'automatico'|'ajustado'|'confirmado', confirmado_por, confirmado_em, motivo)` e `rateio_indireto_percentuais(mes, centro_obra_id, percentual numeric(9,6))`, soma = 100% por check na confirmação.
- `fn_rateio_indireto_sugerido(mes)`: percentual de cada obra = custo direto operacional da obra no mês / soma das obras (obras = centros tipo `obra` sem `rateia_indireto`, excluindo Carretas EMT, investimento, movimentação, distribuição, mútuo).
- `fn_rateio_indireto_mes(mes)`: usa os percentuais gravados se o mês estiver `ajustado`/`confirmado`, senão o sugerido; distribui o indireto do mês em centavos por maior resto. Mês sem custo direto: indireto fica "não rateado".
- Tela no Financeiro > Relatórios > Custo por centro: aba/drawer "Rateio do mês" mostra sugerido x atual por obra, permite editar percentuais (com motivo) e confirmar. Mês com competência fechada fica só leitura.
- Custo por centro e Custo x Receita ganham "Com indireto" (coluna Indireto, margem com e sem).
- Testes: Vitest para a distribuição em centavos; prova SQL do sugerido e do ajustado.

### D. Fechamento de competências (operação, sem PR)
- Depois de B aplicado e C no ar: conferir o DRE 2025 e jan-ago/2026 com o Tiago e fechar as competências pela tela existente.

### E. Aplicações (PR 4)
- Fechamento mensal da conta corrente volta a exigir a subconta, mas pela **posição do último dia do mês** (com PDF) como âncora da subconta.
- `fn_salvar_posicao_aplicacao`: calcula o rendimento esperado = CDI do período × % contratado (100% se vazio); rendimento negativo ou fora de 50%–150% do esperado exige `p_confirmar = true` com motivo; posição marcada "fora do CDI" na tela.
- Casar aplicação/resgate com OFX alinha `data_transferencia` à data do movimento (com evento), como já acontece com parcela.
- Relatórios > Investimentos: "Saldo aplicado" = saldo da subconta (`fn_saldos_das_contas`), mesma fonte do KPI. Resgate automático reconhecido por regra/origem da transferência, não pelo texto.
- Rende Fácil: rendimento conta a partir da próxima posição (D1).

### F. Dívidas e consórcios (PR 5 estrutura; PR 6 dados após os PDFs)
- `contratos_divida`: credor, número, tipo (empréstimo, capital de giro, FINAME, CDC, leasing, financiamento de equipamento), etapa do centro Empréstimos, valor contratado, valor liberado, data de liberação, taxa (a.m.), indexador (pré, CDI+, TJLP, IPCA+), sistema (Price, SAC, cronograma do banco), carência, nº de parcelas, garantia, status (ativo, quitado, renegociado), PDF.
- `contrato_divida_cronograma`: nº, vencimento, principal, juros, encargos, saldo devedor após. Gerado por Price/SAC ou digitado do cronograma do banco (pós-fixado).
- Prestação: o lançamento da parcela passa a ter dois rateios na etapa do contrato: principal em "Pagamento de Empréstimo" (movimentação) e juros em "Juros de empréstimos" (financeiro, entra no DRE na competência do vencimento).
- Eventos `contrato_divida_eventos`: amortização antecipada, quitação, renegociação (regera cronograma; parcelas antigas ficam no histórico).
- Créditos: saldo devedor de principal, juros pagos, juros a pagar, CET, próximas 12 parcelas. Financiamentos de equipamento usam o mesmo cadastro; o bem fica em investimento.
- `consorcio_cotas`: administradora, grupo, cota, bem, valor do crédito, prazo, taxa de administração %, fundo de reserva %, status (ativa, contemplada, quitada), data e forma de contemplação (sorteio/lance), valor do lance, PDF. Parcela rateada em fundo comum ("Consórcio a contemplar") e taxa+reserva ("Taxa de administração de consórcio"). Contemplação: evento grava a carta e o bem; parcelas restantes entram em Créditos como dívida.

## 4. Ordem e dependências
1. PR 1 (A) — independente.
2. PR 2 (B código) → planilha de-para → aprovação do Tiago → aplicação dos dados.
3. PR 3 (C).
4. D: fechar competências.
5. PR 4 (E).
6. PR 5 (F estrutura) → PDFs → PR 6 (dados dos contratos e cotas, juros separados).

## 5. Fora do escopo
Depreciação de equipamento nas obras; medição gerando contas a receber; encargos e provisões da folha; limpeza geral de "Despesas financeiras" e "Outras despesas" além dos casos de B.

## 6. Regras de projeto que valem
Cálculo de dinheiro só no banco, centavos inteiros; migrations versionadas em `supabase/migrations` (sempre gravar o .sql); provas SQL pelo CLI em begin/rollback; ids com `idSchema`; merge e deploy ao fechar cada PR com portão verde.
