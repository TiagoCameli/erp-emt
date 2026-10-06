/**
 * Parcelamento mensal pela QUANTIDADE: "este lançamento são 80 parcelas, uma
 * por mês a partir de 25/12". Módulo puro: sem React, sem 'use server'.
 *
 * Nasceu do consórcio: um lançamento só com dezenas de parcelas iguais, e a
 * tela obrigava a clicar "Adicionar parcela" e preencher linha por linha. A
 * condição de pagamento não serve aí, porque ninguém cadastra uma condição
 * "80x mensal" para usar uma vez.
 *
 * Tudo em centavos inteiros, pelo mesmo motivo de `parcelas-editaveis.ts`: 80
 * parcelas somadas em ponto flutuante não fecham com o total.
 */

/** Teto contra digitação absurda. Consórcio de imóvel passa de 200 meses. */
export const MAX_PARCELAS_MENSAIS = 420;

export interface ParcelaMensal {
  valor: number;
  /** yyyy-mm-dd */
  dataVencimento: string;
}

/**
 * Quantidade aceita: inteira, de 2 ao teto, e sem gerar parcela de zero
 * centavo. Uma parcela só não é parcelamento: é o campo Vencimento do topo.
 */
export function quantidadeValida(total: number, quantidade: number): boolean {
  return (
    Number.isInteger(quantidade) &&
    quantidade >= 2 &&
    quantidade <= MAX_PARCELAS_MENSAIS &&
    quantidade <= Math.round(total * 100)
  );
}

/**
 * O vencimento do mês `deslocamento` meses depois de `dataISO`, mantendo o dia
 * ORIGINAL e encostando no fim do mês quando ele não existe: 31/01 vira 28/02 e
 * volta a 31/03. Calculado sempre a partir da primeira data (nunca encadeado),
 * senão um 31 que passa por fevereiro viraria 28 para sempre.
 */
export function somarMesesNoDia(dataISO: string, deslocamento: number): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const alvo = new Date(Date.UTC(ano, mes - 1 + deslocamento, 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Divide `total` em `quantidade` parcelas iguais, uma por mês a partir de
 * `primeiroVencimento`. A sobra de centavos vai na ÚLTIMA, mesma regra de
 * `dividirValorPorParcelas` da condição de pagamento: quem gera pela condição
 * ou pela quantidade vê o resto no mesmo lugar.
 *
 * Entrada inválida devolve lista vazia; quem chama desabilita o botão antes.
 */
export function gerarParcelasMensais(
  total: number,
  quantidade: number,
  primeiroVencimento: string,
): ParcelaMensal[] {
  if (!Number.isFinite(total) || !quantidadeValida(total, quantidade)) {
    return [];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(primeiroVencimento)) return [];

  const totalCentavos = Math.round(total * 100);
  const base = Math.floor(totalCentavos / quantidade);
  const sobra = totalCentavos - base * quantidade;

  return Array.from({ length: quantidade }, (_, indice) => ({
    valor: (base + (indice === quantidade - 1 ? sobra : 0)) / 100,
    dataVencimento: somarMesesNoDia(primeiroVencimento, indice),
  }));
}
