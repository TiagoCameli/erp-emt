/**
 * Quais parcelas de um lançamento podem ser reescritas, e quanto o lançamento
 * passa a valer depois disso. Módulo puro: sem React, sem 'use server'.
 *
 * ## O problema que isto resolve
 *
 * Até 18/08/2026, mexer nas parcelas de um lançamento que já tinha UMA parcela
 * paga era impossível: a tela escondia o botão e a função do banco recusava. A
 * regra protegia o certo (o pagamento já feito) do jeito errado (trancando
 * também as 38 parcelas futuras que ninguém pagou).
 *
 * O caso que expôs isso: LAN-2026-1603, ICMS renegociado com a SEFAZ, 41
 * parcelas — 3 pagas e 38 em aberto. Renegociação de imposto muda o saldo
 * devedor, e não havia como registrar isso sem apagar os três pagamentos.
 *
 * ## A regra de dinheiro
 *
 * **O valor do lançamento é a SOMA DAS PARCELAS.** Mudar uma parcela muda o
 * total, porque o total é derivado — mesmo desenho que a ordem de compra usa
 * para o `valor_total` dela.
 *
 * Isso INVERTE a regra antiga, em que as parcelas tinham que fechar com um total
 * digitado à parte. Vale para lançamento `manual`; em lançamento de origem o
 * cabeçalho pertence à origem (a OC, a folha) e continua mandando no total.
 *
 * ## Os três grupos, e por que a fronteira é onde é
 *
 * - **Preservada** (`pago`, `aprovado`): não é tocada. Paga é fato consumado;
 *   aprovada carrega data programada, conta e quem aprovou, e regravar apagaria
 *   isso. Quem precisa mexer numa aprovada desaprova primeiro.
 * - **Editável** (`pendente`, `em_revisao`): dívida futura que ninguém aprovou.
 *   É o que a tela deixa reescrever, somar, dividir e apagar.
 * - **Cancelada**: preservada como histórico e FORA do total. Parcela cancelada
 *   não é dívida, então somá-la inflaria o valor do lançamento.
 *
 * Tudo em centavos inteiros. Dinheiro em ponto flutuante mente: 0,1 + 0,2 não é
 * 0,3, e 38 parcelas de 1.699,44 não somam o que a calculadora diz se a soma
 * passar por float.
 */

import {
  somarParcelas,
  type ParcelaForm,
} from "@/modules/compras/ordens/calculo-parcelas";

/** Parcela como ela está gravada, com o status que decide o que dá para fazer. */
export interface ParcelaGravada {
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
  status: string;
}

/** Status que a edição NÃO toca: o pagamento e a aprovação são fatos. */
const PRESERVADAS = ["pago", "aprovado"] as const;

/** Status que somem do total: parcela cancelada não é dívida. */
const FORA_DO_TOTAL = ["cancelado"] as const;

/** Converte reais para centavos inteiros. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/** A parcela é fato consumado (paga ou aprovada) e não pode ser reescrita? */
export function ehParcelaPreservada(status: string): boolean {
  return (PRESERVADAS as readonly string[]).includes(status);
}

/** A parcela pode ter data e valor reescritos? */
export function ehParcelaEditavel(status: string): boolean {
  return !ehParcelaPreservada(status) && !ehParcelaCancelada(status);
}

/** A parcela é histórico que não entra no valor do lançamento? */
export function ehParcelaCancelada(status: string): boolean {
  return (FORA_DO_TOTAL as readonly string[]).includes(status);
}

/** As parcelas separadas pelo que a edição pode fazer com cada uma. */
export interface GruposDeParcelas {
  /** Pagas e aprovadas, na ordem original. Entram no total, não na edição. */
  preservadas: ParcelaGravada[];
  /** Pendentes e em revisão: é o que a tela abre para editar. */
  editaveis: ParcelaGravada[];
  /** Canceladas: ficam como estão e não entram no total. */
  canceladas: ParcelaGravada[];
}

export function separarParcelas(parcelas: ParcelaGravada[]): GruposDeParcelas {
  return {
    preservadas: parcelas.filter((p) => ehParcelaPreservada(p.status)),
    editaveis: parcelas.filter((p) => ehParcelaEditavel(p.status)),
    canceladas: parcelas.filter((p) => ehParcelaCancelada(p.status)),
  };
}

/** Quanto as parcelas preservadas somam, em reais. É o piso do lançamento. */
export function totalPreservado(parcelas: ParcelaGravada[]): number {
  const soma = separarParcelas(parcelas).preservadas.reduce(
    (total, parcela) => total + centavos(parcela.valor),
    0,
  );
  return soma / 100;
}

/**
 * O valor que o lançamento passa a ter: o preservado mais o que está digitado na
 * tela. É a conta que o banco vai repetir ao gravar, e a única fonte do total.
 */
export function totalDepoisDaEdicao(
  gravadas: ParcelaGravada[],
  editadas: ParcelaForm[],
): number {
  return (
    (centavos(totalPreservado(gravadas)) + centavos(somarParcelas(editadas))) /
    100
  );
}

/**
 * O que impede de salvar, em uma frase, ou null quando dá para salvar.
 *
 * Não devolve lista: a tela mostra um aviso só, e o primeiro problema é o que a
 * pessoa vai consertar. A validação de campo (data vazia, valor <= 0) continua
 * sendo a do formulário, marcando a linha errada.
 */
export function motivoParaNaoSalvar(params: {
  gravadas: ParcelaGravada[];
  editadas: ParcelaForm[];
  /** Origem do lançamento: só `manual` deixa o total seguir as parcelas. */
  origem: string;
  /** Valor atual do cabeçalho, que manda quando a origem não é manual. */
  valorDoCabecalho: number;
  /**
   * Por que as parcelas estão mudando. Obrigatório quando o lançamento JÁ tinha
   * parcela, porque aí é alteração de algo combinado; o banco recusa sem ele
   * (`fn_definir_parcelas_lancamento`). Opcional na definição inicial, quando o
   * lançamento nasceu sem parcela nenhuma e não há o que explicar.
   */
  justificativa?: string;
}): string | null {
  const { gravadas, editadas, origem, valorDoCabecalho, justificativa } =
    params;

  const temPreservada = separarParcelas(gravadas).preservadas.length > 0;

  if (editadas.length === 0 && !temPreservada) {
    return "Informe ao menos uma parcela.";
  }

  const novoTotal = totalDepoisDaEdicao(gravadas, editadas);
  if (centavos(novoTotal) <= 0) {
    return "O total das parcelas precisa ser maior que zero.";
  }

  if (origem !== "manual") {
    const diferenca = centavos(valorDoCabecalho) - centavos(novoTotal);
    if (diferenca !== 0) {
      return "Neste lançamento o valor vem da origem, então as parcelas precisam fechar com ele.";
    }
  }

  // Por último, depois de tudo que é dado: já existir parcela é a mesma fronteira
  // que o banco usa para separar alteração de definição inicial. Vem no fim de
  // propósito, porque valor zerado ou parcela faltando é o que o usuário precisa
  // consertar primeiro; pedir a explicação antes disso esconderia o erro real.
  if (gravadas.length > 0 && (justificativa ?? "").trim() === "") {
    return "Explique por que as parcelas estão mudando.";
  }

  return null;
}
