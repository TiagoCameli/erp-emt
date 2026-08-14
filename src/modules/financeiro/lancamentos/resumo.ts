import { ehParcelaAberta } from "@/modules/financeiro/_shared/formato";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";
import type { MedidaRecorte } from "@/modules/financeiro/lancamentos/recorte";

/**
 * Contas do resumo do cabeçalho de Lançamentos: quanto tem, quanto já saiu,
 * quanto falta, quanto está atrasado e quanto ainda espera revisão.
 *
 * Duas regras mandam aqui, e as duas vêm de medição no banco (13/08/2026), não
 * de gosto:
 *
 * 1. **O estado do dinheiro é o da PARCELA, não o do lançamento.** 107
 *    lançamentos da base estão parcialmente pagos: R$ 12,36 milhões de valor com
 *    R$ 2,53 milhões já pagos. Somar pelo status do documento jogaria esses
 *    R$ 2,53 milhões em "em aberto", dizendo que a empresa deve dinheiro que já
 *    pagou.
 * 2. **Pago é o LÍQUIDO.** 20 parcelas têm desconto, R$ 31.599,01 no total. O que
 *    saiu da conta é valor menos desconto; usar o bruto infla o pago em R$ 30 mil
 *    e faz o desconto obtido desaparecer da conta.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** O mínimo de uma parcela para as contas de dinheiro. */
export interface ParcelaParaResumo {
  status: string;
  valor: number;
  /** Valor menos desconto. Null em parcela antiga: cai no `valor`. */
  valorLiquido: number | null;
  desconto: number | null;
  dataVencimento: string | null;
}

/** Dinheiro de UM lançamento, repartido pelo estado das parcelas. */
export interface DinheiroDasParcelas {
  valorPago: number;
  valorAberto: number;
  valorVencido: number;
  descontoObtido: number;
}

/**
 * Somas de dinheiro em CENTAVOS inteiros.
 *
 * Somar 5.848 floats de duas casas acumula resto binário (o velho
 * 0.1 + 0.2 = 0.30000000000000004). No fim de milhares de parcelas isso aparece
 * como um total que não fecha com a soma da planilha por alguns centavos, e num
 * painel de dinheiro isso destrói a confiança no número inteiro. Inteiro de
 * centavo não tem esse problema, e R$ 62 milhões dão 6,2 bilhões de centavos,
 * bem dentro do inteiro seguro do JavaScript (9 quatrilhões).
 */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/** Volta de centavos para reais, na fronteira de saída. */
function reais(cents: number): number {
  return cents / 100;
}

/** Parcela paga: o dinheiro saiu. */
function estaPaga(parcela: ParcelaParaResumo): boolean {
  return parcela.status === "pago";
}

/**
 * Parcela em aberto: não paga e não cancelada. Cancelada não é dívida, e somá-la
 * no aberto faria a empresa parecer devedora de algo que foi desfeito.
 *
 * A regra vem de `_shared/formato` porque o filtro de atraso da listagem usa a
 * MESMA definição para escolher os lançamentos: se as duas divergirem, o cartão
 * "Vencido" mostra um número e o filtro traz outro conjunto.
 */
function estaAberta(parcela: ParcelaParaResumo): boolean {
  return ehParcelaAberta(parcela.status);
}

/**
 * Está vencida: em aberto e com vencimento ANTES de hoje.
 *
 * Comparação de string em yyyy-MM-dd é comparação de data, e evita fuso. Parcela
 * sem vencimento não está atrasada (não há prazo para ter estourado), e vencendo
 * hoje também não: ainda dá para pagar.
 */
export function estaVencida(
  parcela: Pick<ParcelaParaResumo, "status" | "dataVencimento">,
  hojeISO: string,
): boolean {
  if (!ehParcelaAberta(parcela.status)) return false;
  return parcela.dataVencimento !== null && parcela.dataVencimento < hojeISO;
}

/**
 * Situação de atraso de um lançamento, a partir das parcelas dele. É o que o
 * filtro "Atraso" da listagem escolhe, e usa as mesmas duas funções acima que
 * alimentam o cartão "Vencido".
 *
 * `sem-aberto` é lançamento quitado (ou com tudo cancelado): não é vencido nem a
 * vencer, e fica fora dos dois lados do filtro.
 */
export function situacaoDeAtraso(
  parcelas: Array<Pick<ParcelaParaResumo, "status" | "dataVencimento">>,
  hojeISO: string,
): "vencido" | "a_vencer" | "sem-aberto" {
  let temAberta = false;
  for (const parcela of parcelas) {
    if (estaVencida(parcela, hojeISO)) return "vencido";
    if (ehParcelaAberta(parcela.status)) temAberta = true;
  }
  return temAberta ? "a_vencer" : "sem-aberto";
}

/**
 * Reparte o dinheiro de um lançamento pelo estado das parcelas.
 *
 * `hojeISO` entra por parâmetro (yyyy-MM-dd no fuso de Rio Branco) em vez de ler
 * o relógio: assim a função é pura e o "vencido" de um teste não muda de
 * resultado amanhã.
 */
export function dinheiroDasParcelas(
  parcelas: ParcelaParaResumo[],
  hojeISO: string,
): DinheiroDasParcelas {
  let pago = 0;
  let aberto = 0;
  let vencido = 0;
  let desconto = 0;

  for (const parcela of parcelas) {
    if (estaPaga(parcela)) {
      // Líquido é o que saiu do banco. `valor_liquido` pode vir null em parcela
      // antiga, e aí o valor cheio é a melhor verdade disponível.
      pago += centavos(parcela.valorLiquido ?? parcela.valor);
      desconto += centavos(parcela.desconto ?? 0);
      continue;
    }
    if (!estaAberta(parcela)) continue;

    aberto += centavos(parcela.valor);
    // Mesma função que o filtro de atraso usa, para o cartão "Vencido" e o
    // filtro "Com parcela vencida" nunca falarem de conjuntos diferentes.
    if (estaVencida(parcela, hojeISO)) vencido += centavos(parcela.valor);
  }

  return {
    valorPago: reais(pago),
    valorAberto: reais(aberto),
    valorVencido: reais(vencido),
    descontoObtido: reais(desconto),
  };
}

/**
 * Soma as parcelas JÁ FILTRADAS pela fatia, na medida que o relatório de origem
 * usa. Quem escolhe QUAIS parcelas entram é a consulta (a fatia vive no banco,
 * ver `fn_lancamentos_do_recorte`); aqui é só a soma, em centavos.
 */
export function valorDasParcelasNoRecorte(
  parcelas: ParcelaParaResumo[],
  medida: MedidaRecorte,
): number {
  let total = 0;
  for (const parcela of parcelas) {
    total +=
      medida === "liquido"
        ? centavos(parcela.valorLiquido ?? parcela.valor)
        : centavos(parcela.valor);
  }
  return reais(total);
}

/**
 * Qual fatia vale, quando a URL recorta por centro de custo E por parcela ao
 * mesmo tempo.
 *
 * O centro ganha. O produto dos dois (a parte do centro dentro das parcelas da
 * fatia) é uma conta que NENHUM relatório pede: o relatório de centro de custo não
 * tem dimensão de parcela, e os de parcela não têm dimensão de centro. Inventar
 * essa conta seria pior que não tê-la, porque ela apareceria na tela como um
 * número com aparência de verdade que ninguém sabe conferir.
 *
 * Zero é fatia de zero e ganha normalmente: a comparação é com `null`, não com
 * falsidade.
 */
export function escolherValorRecorte(
  valorNoCentro: number | null,
  valorNaParcela: number | null,
): number | null {
  if (valorNoCentro !== null) return valorNoCentro;
  return valorNaParcela;
}

/** O resumo que os cartões do cabeçalho mostram. */
export interface ResumoLancamentos {
  /** Quantos lançamentos o filtro pegou. */
  quantidade: number;
  /** Soma do valor dos lançamentos (o total do documento). */
  valorTotal: number;
  /** Já pago, pelo líquido. */
  valorPago: number;
  /** Lançamentos sem nada em aberto. */
  quantidadeQuitados: number;
  /** Desconto obtido nas parcelas pagas. */
  descontoObtido: number;
  /** Falta pagar. */
  valorAberto: number;
  /** Lançamentos com algum saldo em aberto. */
  quantidadeComSaldo: number;
  /** Parte do aberto já vencida. */
  valorVencido: number;
  /** Lançamentos com alguma parcela vencida. */
  quantidadeVencidos: number;
  /** Lançamentos que já pagaram parte e ainda devem parte. */
  quantidadeParciais: number;
  /** Lançamentos esperando conta bancária (sem conta ou conta parcial). */
  quantidadeARevisar: number;
  /** Quanto de dinheiro em aberto está preso nesses lançamentos a revisar. */
  valorARevisar: number;
  /**
   * Soma da FATIA quando a URL recorta (o rateio de um centro, ou as parcelas de
   * uma faixa, mês ou conta). Sem recorte é igual a `valorTotal`.
   *
   * É o número que fecha com a célula do relatório que foi clicada, e é por isso
   * que ele existe separado do `valorTotal`: os dois são verdadeiros e dizem
   * coisas diferentes (o documento inteiro, e a parte dele que está nesta fatia).
   */
  valorNoRecorte: number;
  /** Há recorte valendo? Decide se a tela mostra a coluna e o cartão da fatia. */
  temRecorte: boolean;
}

const VAZIO: ResumoLancamentos = {
  quantidade: 0,
  valorTotal: 0,
  valorPago: 0,
  quantidadeQuitados: 0,
  descontoObtido: 0,
  valorAberto: 0,
  quantidadeComSaldo: 0,
  valorVencido: 0,
  quantidadeVencidos: 0,
  quantidadeParciais: 0,
  quantidadeARevisar: 0,
  valorARevisar: 0,
  valorNoRecorte: 0,
  temRecorte: false,
};

/**
 * Soma os lançamentos lidos do filtro num resumo só.
 *
 * Recebe as LINHAS da listagem, as mesmas que a tela mostra e que a planilha
 * exporta, então o resumo não pode discordar da lista: é a mesma consulta e o
 * mesmo filtro. Um agregado em SQL seria mais rápido, mas passaria a ter a sua
 * própria cópia dos filtros, e no primeiro filtro novo os cartões começariam a
 * contar um conjunto diferente do que está na tela.
 */
export function resumirLancamentos(
  itens: LancamentoLista[],
): ResumoLancamentos {
  if (itens.length === 0) return { ...VAZIO };

  let valorTotal = 0;
  let valorPago = 0;
  let valorAberto = 0;
  let valorVencido = 0;
  let descontoObtido = 0;
  let valorARevisar = 0;
  let quantidadeQuitados = 0;
  let quantidadeComSaldo = 0;
  let quantidadeVencidos = 0;
  let quantidadeParciais = 0;
  let quantidadeARevisar = 0;
  let valorNoRecorte = 0;
  let temRecorte = false;

  for (const item of itens) {
    valorTotal += centavos(item.valor);
    // `?? item.valor` e não `?? 0`: linha sem recorte contribui com o documento
    // inteiro. Zero é fatia de zero, e o `??` respeita isso (só null cai no
    // fallback).
    valorNoRecorte += centavos(item.valorRecorte ?? item.valor);
    if (item.valorRecorte !== null) temRecorte = true;
    valorPago += centavos(item.valorPago);
    valorAberto += centavos(item.valorAberto);
    valorVencido += centavos(item.valorVencido);
    descontoObtido += centavos(item.descontoObtido);

    const temSaldo = item.valorAberto > 0;
    if (temSaldo) quantidadeComSaldo += 1;
    else quantidadeQuitados += 1;
    if (item.valorVencido > 0) quantidadeVencidos += 1;
    if (temSaldo && item.valorPago > 0) quantidadeParciais += 1;

    // "A revisar" é a mesma pergunta da coluna Revisão da lista: falta escolher a
    // conta bancária de alguma parcela em aberto? Sem conta o lançamento não
    // chega na fila de aprovação, então é fila de trabalho, não estatística.
    if (item.revisao === "sem-conta" || item.revisao === "parcial") {
      quantidadeARevisar += 1;
      valorARevisar += centavos(item.valorAberto);
    }
  }

  return {
    quantidade: itens.length,
    valorTotal: reais(valorTotal),
    valorPago: reais(valorPago),
    quantidadeQuitados,
    descontoObtido: reais(descontoObtido),
    valorAberto: reais(valorAberto),
    quantidadeComSaldo,
    valorVencido: reais(valorVencido),
    quantidadeVencidos,
    quantidadeParciais,
    quantidadeARevisar,
    valorARevisar: reais(valorARevisar),
    valorNoRecorte: reais(valorNoRecorte),
    temRecorte,
  };
}
