import { formatarBRL, formatarData } from "@/lib/formatadores";
import { rotuloParcela } from "@/modules/rh/decimo-terceiro/formato";

/**
 * A mensagem que vai para o WhatsApp de quem aprova o 13º.
 *
 * Mesma razão de ser da mensagem da folha: o caminho real do pedido de
 * aprovação não é o sistema, é o Tiago mandando mensagem para alguém. Sem isto
 * ele copia o link da barra do navegador e digita o resto na mão toda vez.
 *
 * Carrega NÚMERO, e não só o link: quem recebe precisa saber o tamanho do que
 * está sendo pedido antes de clicar.
 *
 * O número que só o 13º tem é **quantas linhas estão preenchidas**. O lote
 * nasce com todo mundo zerado, então "59 colaboradores" sozinho não diz nada:
 * 59 com 3 preenchidas é um pedido completamente diferente de 59 com 59.
 *
 * Módulo puro: nada de React, nada de banco, nada de `window`. A origem entra
 * por parâmetro para o teste poder fixá-la, e porque em Server Component
 * `window` não existe.
 */

export interface LoteParaMensagem {
  id: string;
  ano: number;
  parcela: number;
  /** Quantas linhas o lote tem. */
  pessoas: number;
  /** Quantas delas têm valor maior que zero. */
  preenchidos: number;
  valorLiquido: number;
  /** yyyy-MM-dd, ou null quando vale o padrão. */
  dataVencimento: string | null;
}

/**
 * Monta o texto pronto para colar.
 *
 * `origem` é o `window.location.origin` de quem clicou. Vem de fora porque uma
 * constante no código apontaria para o domínio errado no preview da Vercel, e o
 * link chegaria quebrado justamente para quem foi pedir que testasse.
 */
export function mensagemDeAprovacao(
  lote: LoteParaMensagem,
  origem: string,
): string {
  // Sem barra no fim: `https://app.com/` + `/rh/...` daria barra dupla, que
  // funciona no Next e fica feia no WhatsApp, onde o link aparece cru.
  const base = origem.replace(/\/+$/, "");
  const link = `${base}/rh/decimo-terceiro-e-ferias/13o/${lote.id}`;

  const pessoas =
    lote.pessoas === 1 ? "1 colaborador" : `${lote.pessoas} colaboradores`;

  const linhas = [
    `13º ${lote.ano}, ${rotuloParcela(lote.parcela)} pronto para aprovação.`,
    "",
    `${pessoas}, ${lote.preenchidos} com valor preenchido`,
    `Líquido a pagar: ${formatarBRL(lote.valorLiquido)}`,
  ];

  // Sem data escolhida vale o padrão do banco (20/12). Prometer uma data que
  // não está gravada seria pior que omitir.
  if (lote.dataVencimento) {
    linhas.push(`Vence em ${formatarData(lote.dataVencimento)}`);
  }

  linhas.push("", `Aprovar: ${link}`);

  return linhas.join("\n");
}
