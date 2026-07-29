/**
 * Cálculo puro das parcelas de uma ordem de compra. Sem React, sem 'use server'.
 *
 * A divisão pela condição de pagamento NÃO vive aqui: ela é uma função do
 * banco (fn_parcelas_da_condicao), chamada por RPC, para existir uma única
 * implementação daquela matemática. Aqui ficam as contas que a tela precisa
 * fazer sobre o que já está digitado: somar, mostrar a diferença e
 * redistribuir quando o total dos itens muda.
 *
 * Tudo em centavos inteiros. Dinheiro em ponto flutuante mente: 0,1 + 0,2 não
 * é 0,3, e três parcelas de 33,333... não somam 100.
 */

import { paraNumero } from "@/modules/compras/ordens/calculo";

/** Uma parcela como a tela guarda: valores em texto, no formato do formulário. */
export interface ParcelaForm {
  dataVencimento: string;
  valor: string;
}

/** Converte reais para centavos inteiros. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/** Converte centavos inteiros para o texto do formulário ("1234,56"). */
function paraTexto(centavosValor: number): string {
  const reais = (centavosValor / 100).toFixed(2);
  return reais.replace(".", ",");
}

/** Soma das parcelas digitadas, em reais. Texto inválido conta como zero. */
export function somarParcelas(parcelas: ParcelaForm[]): number {
  const total = parcelas.reduce(
    (soma, parcela) => soma + centavos(paraNumero(parcela.valor ?? "")),
    0,
  );
  return total / 100;
}

/**
 * Quanto falta (positivo) ou sobra (negativo) para as parcelas fecharem com o
 * total da ordem. Zero significa que fecha exatamente.
 */
export function diferencaParaTotal(
  parcelas: ParcelaForm[],
  total: number,
): number {
  return (centavos(total) - centavos(somarParcelas(parcelas))) / 100;
}

/**
 * Redistribui um novo total entre as parcelas existentes mantendo as datas e a
 * proporção que a pessoa tinha definido. A sobra de centavos vai para a última
 * parcela, igual à divisão do banco.
 *
 * Quando as parcelas somam zero (recém-adicionadas, ainda sem valor), divide em
 * partes iguais: não há proporção a preservar.
 */
export function redistribuirProporcional(
  parcelas: ParcelaForm[],
  novoTotal: number,
): ParcelaForm[] {
  if (parcelas.length === 0) return [];

  const alvo = centavos(novoTotal);
  if (alvo <= 0) {
    return parcelas.map((parcela) => ({ ...parcela, valor: "0,00" }));
  }

  const atuais = parcelas.map((parcela) => centavos(paraNumero(parcela.valor ?? "")));
  const somaAtual = atuais.reduce((soma, valor) => soma + valor, 0);

  const brutos = atuais.map((valor) =>
    somaAtual > 0
      ? Math.round((alvo * valor) / somaAtual)
      : Math.floor(alvo / parcelas.length),
  );

  // A última fecha a conta: recebe o alvo menos a soma de todas as anteriores.
  const somaAnteriores = brutos
    .slice(0, -1)
    .reduce((soma, valor) => soma + valor, 0);
  const ultima = alvo - somaAnteriores;

  return parcelas.map((parcela, indice) => ({
    ...parcela,
    valor: paraTexto(indice === parcelas.length - 1 ? ultima : brutos[indice]),
  }));
}

/** Uma data de vencimento vazia impede salvar. */
export function temDataVazia(parcelas: ParcelaForm[]): boolean {
  return parcelas.some((parcela) => (parcela.dataVencimento ?? "").trim() === "");
}

/** Uma parcela com valor zerado ou negativo impede salvar. */
export function temValorInvalido(parcelas: ParcelaForm[]): boolean {
  return parcelas.some((parcela) => paraNumero(parcela.valor ?? "") <= 0);
}

/**
 * Parcelas que vencem antes da emissão da ordem. Devolve os índices para a tela
 * marcar o campo errado, não só reclamar no geral.
 */
export function indicesVencimentoAntesDaEmissao(
  parcelas: ParcelaForm[],
  dataEmissao: string,
): number[] {
  if (dataEmissao === "") return [];
  return parcelas
    .map((parcela, indice) => ({ parcela, indice }))
    .filter(
      ({ parcela }) =>
        (parcela.dataVencimento ?? "") !== "" &&
        parcela.dataVencimento < dataEmissao,
    )
    .map(({ indice }) => indice);
}
