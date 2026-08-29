import { formatarBRL } from "@/lib/formatadores";
import { formatarCompetencia } from "@/modules/rh/_shared/formato";

/**
 * A mensagem que vai para o WhatsApp de quem aprova a folha.
 *
 * Existe porque o caminho real do pedido de aprovação não é o sistema: é o Tiago
 * mandando mensagem para alguém. Sem isto, ele copia o link da barra do navegador
 * e digita o resto na mão toda vez — e o "resto" é justamente o que faz a pessoa
 * decidir se abre agora ou depois do almoço.
 *
 * A mensagem carrega NÚMERO, e não só o link, de propósito. Quem recebe precisa
 * saber o tamanho do que está sendo pedido antes de clicar: aprovar uma folha de
 * R$ 173 mil não é o mesmo pedido que conferir uma de R$ 4 mil, e um link nu não
 * diz qual dos dois é.
 *
 * Módulo puro: nada de React, nada de banco, nada de `window`. A origem entra por
 * parâmetro para o teste poder fixá-la — e porque em Server Component `window`
 * não existe.
 */

export interface FolhaParaMensagem {
  id: string;
  /** Primeiro dia do mês (yyyy-MM-dd), como vem do banco. */
  competencia: string;
  /** Quantas pessoas entraram na folha. */
  colaboradores: number;
  /** Custo total da empresa: bruto mais provisão. */
  custoTotal: number;
  /** O que os colaboradores recebem. */
  liquido: number;
}

/**
 * Monta o texto pronto para colar.
 *
 * `origem` é o `window.location.origin` de quem clicou. Vem de fora porque uma
 * constante no código apontaria para o domínio errado no preview da Vercel, e o
 * link chegaria quebrado justamente para quem foi pedir que testasse.
 */
export function mensagemDeAprovacao(
  folha: FolhaParaMensagem,
  origem: string,
): string {
  // Sem barra no fim: `https://app.com/` + `/rh/folha/x` daria barra dupla, que
  // funciona no Next e fica feio no WhatsApp, onde o link aparece cru.
  const base = origem.replace(/\/+$/, "");
  const link = `${base}/rh/folha/${folha.id}`;
  const pessoas =
    folha.colaboradores === 1
      ? "1 colaborador"
      : `${folha.colaboradores} colaboradores`;

  return [
    `Folha de ${formatarCompetencia(folha.competencia)} pronta para aprovação.`,
    "",
    `${pessoas}`,
    `Custo total: ${formatarBRL(folha.custoTotal)}`,
    `Líquido a pagar: ${formatarBRL(folha.liquido)}`,
    "",
    `Aprovar: ${link}`,
  ].join("\n");
}
