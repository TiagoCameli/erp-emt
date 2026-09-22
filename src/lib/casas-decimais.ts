/**
 * Casas decimais dos números do ERP, em UM lugar só.
 *
 * Constante pura, sem import: é lida por schema de servidor, schema de
 * formulário e componente de cliente ao mesmo tempo.
 *
 * A separação é a da regra 3 do CLAUDE.md, e ela não é estética:
 *
 * - **VALOR** (`CASAS_DINHEIRO`) é dinheiro que alguém paga ou recebe —
 *   `valor_total`, parcela, rateio, pagamento, salário, diária. Centavo é a
 *   unidade em que o boleto é pago e em que o extrato OFX concilia, então
 *   NUMERIC(14,2) e duas casas na tela. Guardar R$ 1.234,5678 numa parcela
 *   criaria valor impagável e inconferível.
 * - **TAXA** (`CASAS_TAXA`) é o número que MULTIPLICA para virar valor: preço
 *   unitário, quantidade, percentual, extensão. Diesel é vendido a R$ 6,3947 o
 *   litro; arredondar a taxa erra o valor final, e erra por item — medido na OC
 *   2605, R$ 41,56 de erro numa ordem só.
 *
 * Quem digita uma taxa pode usar até 4 casas em qualquer tela do app. Se um
 * campo novo recusar 4 casas, o lugar de consertar é aqui e na coluna, nunca
 * escrevendo o número solto na tela.
 */
export const CASAS_DINHEIRO = 2;

/** Preço unitário, quantidade, percentual e extensão: NUMERIC(_,4). */
export const CASAS_TAXA = 4;

/**
 * VALOR dos módulos operacionais (Frete, Combustível e Manutenção): conta
 * corrente da transportadora, abastecimento, frete, pagamento de frete e custo
 * da OS. NUMERIC(14,4).
 *
 * É a exceção à regra 3, decidida pelo Tiago em 22/09/2026 (plano
 * `docs/PLANO-FRETE-COMBUSTIVEL-MANUTENCAO.md`, decisão 5). Esses valores nascem
 * de litros × preço por litro e t·km × tarifa, e o Gestão Obras sempre guardou
 * as 4 casas. Copiar sem arredondar é o que deixa o saldo da transportadora
 * bater na quarta casa na virada.
 *
 * NUNCA usar no Financeiro. Nada destes módulos vira lançamento, parcela ou
 * rateio; quem paga o frete lança à mão, em centavo, com `CASAS_DINHEIRO`.
 * A tela mostra 2 casas em R$ (`MoneyText`) e o detalhe mostra as 4.
 */
export const CASAS_VALOR_OPERACIONAL = 4;
