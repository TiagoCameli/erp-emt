/**
 * O rateio por centro de custo de um lançamento, do ponto de vista de quem
 * edita. Módulo puro: sem React, sem 'use server'.
 *
 * ## O problema que isto resolve
 *
 * Até 01/09/2026, o rateio só se editava pelo formulário do lançamento — e
 * `fn_salvar_lancamento` recusa lançamento com parcela paga ou aprovada. Ou
 * seja: no dia em que a primeira parcela era paga, a divisão do custo entre as
 * obras congelava para sempre. As parcelas já tinham escapado dessa trava (elas
 * ganharam `fn_definir_parcelas_lancamento`); o rateio não.
 *
 * O caso que expôs isso: o seguro dos caminhões, R$ 132.081,60 em 11 parcelas
 * com 5 já pagas, rateado entre quatro carretas. Com uma carreta a menos na
 * apólice não havia como corrigir a divisão sem estornar cinco pagamentos.
 *
 * ## A regra de dinheiro: o total NÃO muda
 *
 * Editar rateio é **repartir o mesmo dinheiro de outro jeito**, nunca mudar
 * quanto o lançamento vale. `trg_valida_soma_do_rateio` exige que a soma do
 * rateio seja exatamente o valor do lançamento, e esta tela respeita isso em vez
 * de contorná-lo: quem precisa mudar o total mexe nas PARCELAS, que é de onde o
 * total vem (ver `parcelas-editaveis.ts`).
 *
 * É por isso que aqui não existe "preservada" e "editável" como nas parcelas. O
 * rateio não tem status: ele é do lançamento inteiro, não de cada parcela, então
 * não há uma "parte já paga do rateio" para proteger. O que protege o histórico
 * é a trilha, não a trava.
 *
 * Tudo em centavos inteiros. Dinheiro em ponto flutuante mente: 0,1 + 0,2 não é
 * 0,3, e quatro carretas de 32.454,08 não somam o que a calculadora diz se a
 * soma passar por float.
 */

import { formatarBRL } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";

/** Uma linha do rateio como a tela guarda: o valor em texto, com vírgula. */
export interface RateioForm {
  centroCustoId: string;
  valor: string;
}

/** Uma linha do rateio como ela está gravada, para comparar antes e depois. */
export interface RateioValor {
  centroCustoId: string;
  valor: number;
}

/** Converte reais para centavos inteiros. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/** Soma das linhas digitadas, em reais. Texto inválido conta como zero. */
export function somarRateios(linhas: RateioForm[]): number {
  const total = linhas.reduce(
    (soma, linha) => soma + centavos(paraNumero(linha.valor ?? "")),
    0,
  );
  return total / 100;
}

/**
 * Quanto falta (positivo) ou sobra (negativo) para o rateio fechar com o valor
 * do lançamento. Zero significa que fecha exatamente.
 */
export function diferencaParaFechar(
  linhas: RateioForm[],
  valorDoLancamento: number,
): number {
  return (centavos(valorDoLancamento) - centavos(somarRateios(linhas))) / 100;
}

/**
 * O que impede de salvar, em uma frase, ou null quando dá para salvar.
 *
 * Uma frase só, não uma lista: a tela mostra um aviso, e o primeiro problema é o
 * que a pessoa vai consertar. A ordem importa e é a mesma do diálogo de
 * parcelas — tudo que é DADO primeiro, a justificativa por último. Pedir a
 * explicação antes de o dinheiro fechar esconderia o erro real atrás de uma
 * exigência de texto.
 */
export function motivoParaNaoSalvar(params: {
  linhas: RateioForm[];
  /** Valor do lançamento. O rateio tem que fechar com ele, sempre. */
  valorDoLancamento: number;
  /**
   * Por que o rateio está mudando. Sempre obrigatório, ao contrário das
   * parcelas: rateio nunca é "definição inicial" numa tela de detalhe, porque
   * `trg_lancamento_exige_centro` impede um lançamento de existir sem ele. Toda
   * edição aqui é reclassificação de custo entre obras, e isso pede um porquê.
   */
  justificativa?: string;
}): string | null {
  const { linhas, valorDoLancamento, justificativa } = params;

  if (linhas.length === 0) {
    return "Informe ao menos um centro de custo.";
  }

  if (linhas.some((linha) => linha.centroCustoId.trim() === "")) {
    return "Escolha o centro de custo de todas as linhas.";
  }

  if (linhas.some((linha) => centavos(paraNumero(linha.valor ?? "")) <= 0)) {
    return "Toda linha do rateio precisa de um valor maior que zero.";
  }

  // Duas linhas do mesmo centro somam certo e passariam pela trigger do banco,
  // mas viram duas verdades sobre a mesma obra em todo relatório por centro.
  const centros = new Set(linhas.map((linha) => linha.centroCustoId));
  if (centros.size !== linhas.length) {
    return "O mesmo centro de custo aparece em duas linhas: some os valores numa linha só.";
  }

  const diferenca = diferencaParaFechar(linhas, valorDoLancamento);
  if (centavos(diferenca) !== 0) {
    const sobra = diferenca < 0;
    return (
      `A soma do rateio (${formatarBRL(somarRateios(linhas))}) precisa fechar ` +
      `com o valor do lançamento (${formatarBRL(valorDoLancamento)}). ` +
      `${sobra ? "Sobram" : "Faltam"} ${formatarBRL(Math.abs(diferenca))}.`
    );
  }

  if ((justificativa ?? "").trim() === "") {
    return "Explique por que o rateio está mudando.";
  }

  return null;
}

/** Um centro que continuou no rateio, com o valor de antes e o de agora. */
export interface RateioMudou {
  centroCustoId: string;
  valorDe: number;
  valorPara: number;
}

/** O que mudou entre o rateio gravado e o que está sendo salvo. */
export interface DiffDoRateio {
  entraram: RateioValor[];
  sairam: RateioValor[];
  mudaram: RateioMudou[];
  /** Houve qualquer mudança? Falso quando o salvamento não muda nada. */
  mudou: boolean;
}

/**
 * Compara o rateio de antes com o de depois, por centro de custo.
 *
 * Serve à trilha: "de que obra para que obra o custo foi" é a pergunta que a
 * pessoa faz seis meses depois, e ela não se responde com duas listas cruas.
 * A comparação é em CENTAVOS — um centavo movido entre obras é reclassificação
 * de custo, e um `===` em float chamaria de igual o que não é.
 */
export function diffDoRateio(
  antes: RateioValor[],
  depois: RateioValor[],
): DiffDoRateio {
  const mapaAntes = new Map(antes.map((r) => [r.centroCustoId, r.valor]));
  const mapaDepois = new Map(depois.map((r) => [r.centroCustoId, r.valor]));

  const entraram = depois.filter((r) => !mapaAntes.has(r.centroCustoId));
  const sairam = antes.filter((r) => !mapaDepois.has(r.centroCustoId));
  const mudaram = depois
    .filter((r) => {
      const valorAntes = mapaAntes.get(r.centroCustoId);
      return valorAntes !== undefined && centavos(valorAntes) !== centavos(r.valor);
    })
    .map((r) => ({
      centroCustoId: r.centroCustoId,
      valorDe: mapaAntes.get(r.centroCustoId) as number,
      valorPara: r.valor,
    }));

  return {
    entraram,
    sairam,
    mudaram,
    mudou: entraram.length > 0 || sairam.length > 0 || mudaram.length > 0,
  };
}
