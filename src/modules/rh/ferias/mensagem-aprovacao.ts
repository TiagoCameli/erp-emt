import { formatarBRL, formatarData } from "@/lib/formatadores";

/**
 * A mensagem que vai para o WhatsApp de quem aprova o recibo de férias.
 *
 * Mesma razão de ser da mensagem do 13º e da folha: o caminho real do pedido
 * de aprovação não é o sistema, é o Tiago mandando mensagem para alguém. Sem
 * isto ele copia o link da barra do navegador e digita o resto na mão toda vez.
 *
 * Carrega NÚMERO, e não só o link: quem recebe precisa saber o tamanho do que
 * está sendo pedido antes de clicar.
 *
 * O que o recibo de férias tem e o 13º não é o PERÍODO. "R$ 900,00" sozinho
 * não diz se são 30 dias ou 10, e é a diferença entre um valor plausível e um
 * valor errado.
 *
 * Módulo puro: nada de React, nada de banco, nada de `window`. A origem entra
 * por parâmetro para o teste poder fixá-la, e porque em Server Component
 * `window` não existe.
 */

export interface ReciboParaMensagem {
  id: string;
  colaboradorNome: string;
  dias: number;
  /** Início do gozo, yyyy-MM-dd. */
  dataInicio: string;
  /** Fim do gozo, yyyy-MM-dd. */
  dataFim: string;
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
  recibo: ReciboParaMensagem,
  origem: string,
): string {
  // Sem barra no fim: `https://app.com/` + `/rh/...` daria barra dupla, que
  // funciona no Next e fica feia no WhatsApp, onde o link aparece cru.
  const base = origem.replace(/\/+$/, "");
  const link = `${base}/rh/decimo-terceiro-e-ferias/ferias/${recibo.id}`;

  const dias = recibo.dias === 1 ? "1 dia" : `${recibo.dias} dias`;

  const linhas = [
    `Recibo de férias de ${recibo.colaboradorNome} pronto para aprovação.`,
    "",
    `${dias}, de ${formatarData(recibo.dataInicio)} a ${formatarData(recibo.dataFim)}`,
    `Líquido a pagar: ${formatarBRL(recibo.valorLiquido)}`,
  ];

  // Sem data escolhida vale o padrão do banco (dois dias antes do início do
  // gozo). Prometer uma data que não está gravada seria pior que omitir.
  if (recibo.dataVencimento) {
    linhas.push(`Vence em ${formatarData(recibo.dataVencimento)}`);
  }

  linhas.push("", `Aprovar: ${link}`);

  return linhas.join("\n");
}
