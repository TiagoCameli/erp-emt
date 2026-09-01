import type { ParcelaAprovada } from "@/modules/financeiro/pagamentos/queries";

/**
 * A parcela pode ser paga agora?
 *
 * Só `aprovado`. `fn_pagar_parcela` recusa `pendente` ("a parcela precisa estar
 * aprovada para pagamento") e `em_revisao` ("precisa ser reenviada e aprovada
 * antes de pagar"), então esta é a MESMA regra do banco — e é ela que decide se
 * a linha ganha botão de pagar e se entra no pagamento em lote.
 *
 * Parcela sem `status` é a que chega pela aba Programados, cuja fila já é só de
 * aprovadas; tratar a ausência como "pode" mantém aquela tela funcionando sem
 * ela precisar carregar o campo.
 */
export function podePagarParcela(parcela: ParcelaAprovada): boolean {
  return (parcela.status ?? "aprovado") === "aprovado";
}

/** Resumo de um conjunto de parcelas em aberto, para os cards do topo. */
export interface ResumoAPagar {
  total: number;
  parcelas: number;
  /** O que já pode ser pago hoje. */
  aprovado: number;
  aprovadas: number;
  /** O que ainda depende de aprovação (pendente ou em revisão). */
  aguardando: number;
  aguardandoParcelas: number;
  /** O que já passou do vencimento, aprovado ou não. */
  vencido: number;
  vencidas: number;
}

const VAZIO: ResumoAPagar = {
  total: 0,
  parcelas: 0,
  aprovado: 0,
  aprovadas: 0,
  aguardando: 0,
  aguardandoParcelas: 0,
  vencido: 0,
  vencidas: 0,
};

/**
 * Soma o conjunto para os cards, numa passada só.
 *
 * `hoje` vem do SERVIDOR (data de Rio Branco), nunca do relógio do navegador:
 * máquina com fuso ou data errada pintaria de vencido o que ainda não venceu, e
 * vencido é o número que faz alguém correr para pagar.
 *
 * Vencido cruza com aprovado de propósito: uma parcela vencida e ainda não
 * aprovada conta nos dois cards, porque as duas perguntas são diferentes
 * ("quanto já está atrasado" e "quanto eu consigo pagar agora"). Somar os
 * quatro cards não dá o total, e não deve dar.
 */
export function somarParaResumo(
  parcelas: readonly ParcelaAprovada[],
  hoje: string,
): ResumoAPagar {
  const resumo: ResumoAPagar = { ...VAZIO };

  for (const parcela of parcelas) {
    resumo.total += parcela.valor;
    resumo.parcelas += 1;

    if (podePagarParcela(parcela)) {
      resumo.aprovado += parcela.valor;
      resumo.aprovadas += 1;
    } else {
      resumo.aguardando += parcela.valor;
      resumo.aguardandoParcelas += 1;
    }

    if (parcela.dataVencimento !== null && parcela.dataVencimento < hoje) {
      resumo.vencido += parcela.valor;
      resumo.vencidas += 1;
    }
  }

  return resumo;
}

/** "3 parcelas" / "1 parcela", para o detalhe do card. */
export function contagem(quantas: number): string {
  return quantas === 1 ? "1 parcela" : `${quantas} parcelas`;
}

// ---------------------------------------------------------------------------
// Histórico de pagas: a soma do recorte inteiro
// ---------------------------------------------------------------------------

/**
 * As somas do histórico filtrado, na MESMA composição de uma linha da tabela.
 *
 * Cinco números e não um só porque a coluna "Valor" da aba mostra o `valor` da
 * parcela e o card mostra o `valor_liquido`: com desconto, juros ou despesa no
 * recorte os dois DIVERGEM, e um rodapé que mostrasse só um deles criaria dois
 * totais na mesma tela sem dizer por que não fecham. Levando a composição
 * inteira, o rodapé fecha a conta na cara do usuário
 * (valor − desconto + juros + despesas = líquido) e o líquido dele é, por
 * construção, o número do card.
 */
export interface ResumoPagas {
  parcelas: number;
  valor: number;
  desconto: number;
  juros: number;
  outrasDespesas: number;
  /** valor − desconto + juros + outras despesas: o que saiu da conta. */
  valorLiquido: number;
  /**
   * O recorte está por FATIA de centro de custo?
   *
   * A tela precisa saber para dizer, no card e no rodapé, que o número é a parte
   * daquele centro e não o pagamento inteiro. Total de dinheiro que muda de
   * significado sem mudar de rótulo é o mesmo defeito de antes com outra roupa.
   */
  recortado: boolean;
}

/** O mínimo de uma linha de parcela paga que a soma precisa ler. */
export interface LinhaPaga {
  valor: number | string | null;
  desconto: number | string | null;
  juros: number | string | null;
  outras_despesas: number | string | null;
  valor_liquido: number | string | null;
}

export const RESUMO_PAGAS_VAZIO: ResumoPagas = {
  parcelas: 0,
  valor: 0,
  desconto: 0,
  juros: 0,
  outrasDespesas: 0,
  valorLiquido: 0,
  recortado: false,
};

/** Reais para centavos inteiros. Nulo é zero: parcela sem desconto não tem linha. */
function centavos(valor: number | string | null): number {
  if (valor === null) return 0;
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

/**
 * Soma o recorte inteiro do histórico, EM CENTAVOS.
 *
 * Em centavos e não em reais porque o acumulador é o problema: `0,07` não tem
 * representação exata em ponto flutuante, e somar sete mil linhas de dinheiro
 * assim deixa um rastro de frações de centavo no total. O número que sai daqui
 * tem que bater com a soma feita em SQL (`fn_rel_gestao_financeiro_resumo`, o
 * cartão "Pago no mês" do Painel) e com a conferência que alguém faz na mão
 * contra o extrato do banco. Inteiro soma exato; a divisão por 100 acontece uma
 * vez, no fim.
 *
 * Módulo puro, sem banco: quem lê as linhas é o `queries.ts`.
 */
export function somarPagas(linhas: readonly LinhaPaga[]): ResumoPagas {
  let valor = 0;
  let desconto = 0;
  let juros = 0;
  let outras = 0;
  let liquido = 0;

  for (const linha of linhas) {
    valor += centavos(linha.valor);
    desconto += centavos(linha.desconto);
    juros += centavos(linha.juros);
    outras += centavos(linha.outras_despesas);
    // O líquido é lido da COLUNA, não recalculado: ela é gerada pelo banco, e
    // recalcular aqui faria a tela discordar do que está gravado no dia em que
    // a fórmula da coluna mudar.
    liquido += centavos(linha.valor_liquido);
  }

  return {
    parcelas: linhas.length,
    valor: valor / 100,
    desconto: desconto / 100,
    juros: juros / 100,
    outrasDespesas: outras / 100,
    valorLiquido: liquido / 100,
    // Quem sabe se houve recorte é quem aplicou o filtro, não a soma.
    recortado: false,
  };
}
