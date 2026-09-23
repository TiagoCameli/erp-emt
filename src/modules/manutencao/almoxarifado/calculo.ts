/**
 * Cálculo puro do almoxarifado de peças. Sem React, sem "use server", sem
 * server-only: serve tela, schema e action (e o Vitest importa direto).
 *
 * Quem decide saldo e custo médio é o banco (gatilho `fn_almox_recalcular_saldo`
 * e `round(q * u, 4)` nas RPCs). O que está aqui é só para MOSTRAR: o total da
 * linha na prévia do formulário, o valor em estoque e o sinal de abaixo do
 * mínimo. Nada daqui é gravado.
 */

import { CASAS_TAXA, CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";

/**
 * Texto digitado (pt-BR) em número, com no máximo `casas` decimais.
 *
 * Passa pelo MESMO normalizador dos inputs canônicos, então "1.234,5" e "1234.5"
 * dão 1234,5, e o que a pessoa vê é o que vai para o banco. Devolve null quando o
 * texto não é número ou tem casa decimal demais: quem chama decide o erro.
 */
export function paraNumero(texto: string, casas: number = CASAS_TAXA): number | null {
  const normalizado = normalizarNumeroDigitado(texto, casas);
  if (normalizado === null) return null;
  const numero = Number(normalizado.replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Número do banco para o texto cru do formulário ("1234,5678"), sem milhar.
 * É o formato que `InputQuantidade`/`InputPreco` guardam. Nulo vira "".
 */
export function numeroParaTexto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  const texto = valor.toFixed(CASAS_TAXA).replace(/\.?0+$/, "");
  return texto.replace(".", ",");
}

/**
 * Arredonda em `casas` decimais, meio para longe do zero (o `round` do Postgres).
 * O ajuste pelo épsilon relativo evita que 1,00005 vire 1,0000 porque o binário
 * guardou 1,0000499999.
 */
export function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  const sinal = valor < 0 ? -1 : 1;
  const absoluto = Math.abs(valor);
  return (sinal * Math.round(absoluto * fator * (1 + Number.EPSILON))) / fator;
}

/**
 * Total de uma linha da entrada: quantidade × valor unitário, em 4 casas, igual
 * ao `round(v_q * v_u, 4)` da `fn_almox_registrar_entrada`. Só para a prévia.
 */
export function totalDaLinha(quantidade: number, valorUnitario: number): number {
  return arredondar(quantidade * valorUnitario, CASAS_VALOR_OPERACIONAL);
}

/**
 * Valor em estoque de uma linha de saldo: saldo × custo médio, em 4 casas
 * (`CASAS_VALOR_OPERACIONAL`). A tela mostra em R$ com 2 (`MoneyText`).
 *
 * O custo médio vem do banco com 8 casas (soma do valor ÷ soma da quantidade das
 * entradas); multiplicar antes de arredondar é o que faz a soma dos itens bater
 * com o valor das entradas quando o saldo é a quantidade inteira que entrou.
 */
export function valorEmEstoque(saldo: number, custoMedio: number): number {
  return arredondar(saldo * custoMedio, CASAS_VALOR_OPERACIONAL);
}

/**
 * O saldo está abaixo do estoque mínimo da peça?
 *
 * Sem mínimo cadastrado (null) nunca está. Igual ao mínimo NÃO é abaixo: o
 * mínimo é o que se quer manter, e estar nele ainda é estar em dia.
 */
export function abaixoDoMinimo(saldo: number, estoqueMinimo: number | null): boolean {
  if (estoqueMinimo === null || estoqueMinimo === undefined) return false;
  return saldo < estoqueMinimo;
}

/** O que os cartões do topo da tela de saldos precisam de cada linha. */
export interface LinhaResumoSaldo {
  saldo: number;
  custoMedio: number;
  estoqueMinimo: number | null;
}

export interface ResumoSaldos {
  /** Linhas (depósito × peça) com saldo maior que zero. */
  comSaldo: number;
  /** Linhas com saldo zero: a peça já entrou e saiu toda. */
  zerados: number;
  /** Linhas abaixo do mínimo, zeradas inclusive. */
  abaixoDoMinimo: number;
  /** Soma do valor em estoque, 4 casas. */
  valorEmEstoque: number;
}

/**
 * Resumo para os KPIs. Soma o valor já arredondado de cada linha, para o total
 * do cartão ser a soma do que a tabela mostra (e não um número à parte).
 */
export function resumirSaldos(linhas: readonly LinhaResumoSaldo[]): ResumoSaldos {
  let comSaldo = 0;
  let zerados = 0;
  let abaixo = 0;
  let valor = 0;
  for (const linha of linhas) {
    if (linha.saldo > 0) comSaldo += 1;
    else zerados += 1;
    if (abaixoDoMinimo(linha.saldo, linha.estoqueMinimo)) abaixo += 1;
    valor += valorEmEstoque(linha.saldo, linha.custoMedio);
  }
  return {
    comSaldo,
    zerados,
    abaixoDoMinimo: abaixo,
    valorEmEstoque: arredondar(valor, CASAS_VALOR_OPERACIONAL),
  };
}

const formatadorPreco = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: CASAS_TAXA,
});

/**
 * Preço unitário e custo médio em R$ com no mínimo 2 e no máximo 4 casas, igual
 * ao que o `InputPreco` exibe: "R$ 10,00" para preço redondo e "R$ 6,3947"
 * quando as quatro existem. Não é `MoneyText` porque preço é taxa, não valor.
 */
export function formatarPreco(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return formatadorPreco.format(0);
  }
  return formatadorPreco.format(arredondar(valor, CASAS_TAXA));
}
