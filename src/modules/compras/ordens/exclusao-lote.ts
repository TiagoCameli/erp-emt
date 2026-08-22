/**
 * Exclusão de ordem de compra em LOTE: quem entra, quem fica de fora, e o que a
 * pessoa lê antes e depois.
 *
 * Módulo puro (nada de banco, nada de React) porque as três decisões daqui
 * precisam de teste e são lidas em dois lugares: o diálogo (antes) usa a mesma
 * separação que a Server Action aplica de verdade (depois).
 *
 * A regra que mais importa é a do AVISO. Ação em massa que só diz "pronto"
 * esconde justamente o que a pessoa precisa saber: que 2 das 13 ficaram de fora e
 * por quê. Mesma disciplina do `textoResumoLote` de Lançamentos.
 *
 * ATENÇÃO: a separação daqui é para MOSTRAR. Quem decide de verdade é o servidor,
 * que relê o status no banco — a lista da tela pode estar velha, e status é
 * exatamente o campo que muda por baixo (outra pessoa aprovando).
 */

import { ROTULO_STATUS_OC } from "@/modules/compras/_shared/formato";

/**
 * Os três status de OC morta.
 *
 * Rascunho nunca saiu do lugar, cancelada foi desfeita e rejeitada voltou
 * reprovada. Tudo o mais (pendente, aprovada, recebida, paga) tem efeito adiante
 * — lançamento, recebimento, pagamento — e exclusão em massa não é o caminho para
 * desfazer efeito: para isso existe desaprovar e cancelar, que exigem motivo.
 */
export const STATUS_EXCLUIVEIS: readonly string[] = [
  "rascunho",
  "cancelado",
  "rejeitado",
];

/**
 * Teto de OCs por lote.
 *
 * O lote é um laço de uma chamada por OC (cada uma passa pela própria guarda no
 * banco), então o teto existe para uma seleção enorme não virar centenas de
 * chamadas sem ninguém perceber. Cinquenta é muito acima do uso real: o caso que
 * originou o botão foram 13 tentativas da mesma compra.
 */
export const MAX_EXCLUSAO_LOTE = 50;

/** O mínimo que a separação precisa saber de cada OC. */
export interface OrdemParaExcluir {
  id: string;
  numero: string | null;
  status: string;
}

/** Um grupo de OCs que fica de fora, com o rótulo do status na tela. */
export interface PuladaPorStatus {
  status: string;
  rotulo: string;
  quantidade: number;
}

export interface SeparacaoExclusao {
  elegiveis: OrdemParaExcluir[];
  /**
   * As que ficam de fora, agrupadas por status, na ordem do CATÁLOGO de status
   * (não na ordem em que apareceram na lista). Ordem por aparição faria a mesma
   * seleção gerar duas frases diferentes conforme a ordenação da tabela.
   */
  puladas: PuladaPorStatus[];
}

/** Separa o que pode ser excluído do que fica de fora. */
export function separarParaExclusao(
  ordens: readonly OrdemParaExcluir[],
): SeparacaoExclusao {
  const elegiveis = ordens.filter((ordem) =>
    STATUS_EXCLUIVEIS.includes(ordem.status),
  );

  const contagem = new Map<string, number>();
  for (const ordem of ordens) {
    if (STATUS_EXCLUIVEIS.includes(ordem.status)) continue;
    contagem.set(ordem.status, (contagem.get(ordem.status) ?? 0) + 1);
  }

  // Ordem do catálogo primeiro; status que o catálogo não conhece vai para o fim,
  // na ordem em que apareceu. Status desconhecido NÃO é elegível de propósito: um
  // status novo que ninguém mapeou não pode virar exclusão definitiva por
  // descuido.
  const doCatalogo = Object.keys(ROTULO_STATUS_OC).filter((status) =>
    contagem.has(status),
  );
  const forasteiros = [...contagem.keys()].filter(
    (status) => !(status in ROTULO_STATUS_OC),
  );

  const puladas: PuladaPorStatus[] = [...doCatalogo, ...forasteiros].map(
    (status) => ({
      status,
      rotulo:
        ROTULO_STATUS_OC[status as keyof typeof ROTULO_STATUS_OC]?.rotulo ??
        status,
      quantidade: contagem.get(status) ?? 0,
    }),
  );

  return { elegiveis, puladas };
}

/**
 * Plural de rótulo de status: pluraliza a PRIMEIRA palavra.
 *
 * "Aprovada" -> "aprovadas", e "Pendente de aprovação" -> "pendentes de
 * aprovação". Somar "s" no fim da frase daria "pendente de aprovaçãos".
 */
function rotuloNoPlural(rotulo: string, quantidade: number): string {
  const minusculo = rotulo.toLocaleLowerCase("pt-BR");
  if (quantidade === 1) return minusculo;
  const [primeira, ...resto] = minusculo.split(" ");
  return [`${primeira}s`, ...resto].join(" ");
}

function listaPorStatus(puladas: readonly PuladaPorStatus[]): string {
  return puladas
    .map(
      (pulada) =>
        `${pulada.quantidade} ${rotuloNoPlural(pulada.rotulo, pulada.quantidade)}`,
    )
    .join(", ");
}

/**
 * A frase do DIÁLOGO sobre o que fica de fora. Vazia quando não fica nada.
 *
 * Ela existe porque o dono escolheu ver antes de confirmar, em vez de descobrir
 * depois: com a seleção misturada, o diálogo diz quantas apaga e quantas pula.
 */
export function textoPuladas(puladas: readonly PuladaPorStatus[]): string {
  const total = puladas.reduce((soma, pulada) => soma + pulada.quantidade, 0);
  if (total === 0) return "";
  const detalhe = listaPorStatus(puladas);
  return total === 1
    ? `1 marcada não pode ser excluída (${detalhe}) e será pulada.`
    : `${total} marcadas não podem ser excluídas (${detalhe}) e serão puladas.`;
}

/** Uma OC que o banco recusou, com o motivo que ele deu. */
export interface RecusadaNoLote {
  numero: string;
  motivo: string;
}

export interface ResumoExclusaoLote {
  excluidas: number;
  puladasPorStatus: PuladaPorStatus[];
  /** Recusas do banco (recebimento, parcela aprovada ou paga, conciliação). */
  recusadas: RecusadaNoLote[];
  /** Marcadas que não existiam mais quando o lote rodou. */
  naoEncontradas: number;
}

/**
 * O texto do toast depois do lote: diz o que foi feito E o que não foi.
 *
 * "Nenhuma excluída" aparece de frente, e não como silêncio: um toast verde
 * dizendo "pronto" depois de apagar zero é a pior das saídas.
 */
export function textoResumoExclusao(resumo: ResumoExclusaoLote): string {
  const feito =
    resumo.excluidas === 0
      ? "Nenhuma ordem de compra excluída"
      : resumo.excluidas === 1
        ? "1 ordem de compra excluída"
        : `${resumo.excluidas} ordens de compra excluídas`;

  const partes = [feito];

  if (resumo.puladasPorStatus.length > 0) {
    partes.push(`${listaPorStatus(resumo.puladasPorStatus)}: puladas`);
  }

  if (resumo.recusadas.length > 0) {
    const detalhe = resumo.recusadas
      .map((recusada) => `${recusada.numero} (${recusada.motivo})`)
      .join("; ");
    partes.push(
      resumo.recusadas.length === 1
        ? `1 recusada pelo banco: ${detalhe}`
        : `${resumo.recusadas.length} recusadas pelo banco: ${detalhe}`,
    );
  }

  if (resumo.naoEncontradas > 0) {
    partes.push(
      resumo.naoEncontradas === 1
        ? "1 não foi encontrada: a lista estava velha, recarregue a tela"
        : `${resumo.naoEncontradas} não foram encontradas: a lista estava velha, recarregue a tela`,
    );
  }

  return partes.join(". ");
}
