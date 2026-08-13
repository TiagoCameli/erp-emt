import { idSchema } from "@/lib/id";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { rotuloParcela } from "@/modules/financeiro/_shared/formato";
import type { ParcelaPendente } from "@/modules/financeiro/aprovacao-pagamentos/queries";

/**
 * Link de aprovação: a URL que aponta para uma (ou algumas) parcelas da fila e a
 * mensagem que vai colada no WhatsApp de quem aprova.
 *
 * Tudo aqui é função pura, sem `window` e sem React, porque é o que dá para
 * testar de verdade: a montagem do texto que sai da empresa autorizando dinheiro
 * a sair não pode depender de renderizar uma tabela para ser conferida.
 *
 * O link NÃO é credencial: ele só aponta para a tela. Quem abre precisa de
 * sessão e de permissão de aprovar, exatamente como quem entra pelo menu. É por
 * isso que não existe token, expiração nem tabela nova nisso.
 */

/** Nome do parâmetro na URL da fila. Um só, com os ids separados por vírgula. */
export const PARAM_LINK_APROVACAO = "parcela";

const ROTA_FILA = "/financeiro/aprovacao-pagamentos";

/**
 * Monta a URL absoluta do link. `origem` é o `window.location.origin` de quem
 * gera: o link nasce no mesmo domínio em que a pessoa está, então quem abre o
 * app em produção manda link de produção e quem abre em preview manda de
 * preview, sem variável de ambiente para desencontrar.
 */
export function urlAprovacao(origem: string, ids: string[]): string {
  const base = origem.replace(/\/+$/, "");
  return `${base}${ROTA_FILA}?${PARAM_LINK_APROVACAO}=${ids.join(",")}`;
}

/**
 * Lê os ids do parâmetro da URL, aceitando as duas formas que o Next entrega:
 * uma string com vírgulas (`?parcela=a,b`) ou o parâmetro repetido
 * (`?parcela=a&parcela=b`), que é como um `searchParams` chega quando alguém
 * edita a URL na mão.
 *
 * Id que não passa pelo `idSchema` é descartado em silêncio. Filtrar a fila por
 * lixo devolveria "nenhum pagamento" e quem abriu concluiria que o pagamento
 * sumiu; descartando, a tela cai no aviso de parcela fora da fila, que explica.
 */
export function lerParcelasDoLink(
  valor: string | string[] | undefined,
): string[] {
  if (valor === undefined) return [];
  const cruas = (Array.isArray(valor) ? valor : [valor]).flatMap((parte) =>
    parte.split(","),
  );
  const vistos = new Set<string>();
  for (const crua of cruas) {
    const id = crua.trim();
    if (id === "" || vistos.has(id)) continue;
    if (!idSchema.safeParse(id).success) continue;
    vistos.add(id);
  }
  return [...vistos];
}

/** Soma em centavos, para o total do lote não arrastar erro de float. */
function somar(parcelas: ParcelaPendente[]): number {
  const centavos = parcelas.reduce(
    (total, parcela) => total + Math.round(parcela.valor * 100),
    0,
  );
  return centavos / 100;
}

/** Bloco de uma parcela só: os campos que decidem a aprovação, um por linha. */
function corpoDeUma(parcela: ParcelaPendente): string[] {
  const linhas = [
    `Fornecedor: ${parcela.fornecedorNome}`,
    `Valor: ${formatarBRL(parcela.valor)}`,
  ];
  if (parcela.dataVencimento) {
    linhas.push(`Vencimento: ${formatarData(parcela.dataVencimento)}`);
  }
  linhas.push(
    `Lançamento: ${rotuloParcela(
      parcela.lancamentoNumero,
      parcela.numeroParcela,
      parcela.totalParcelas,
    )}`,
    `Descrição: ${parcela.lancamentoDescricao}`,
  );
  if (parcela.categoriaNome) linhas.push(`Categoria: ${parcela.categoriaNome}`);
  if (parcela.semNota) {
    linhas.push("Atenção: a compra de origem está sem nota fiscal registrada.");
  }
  return linhas;
}

/** Uma linha por parcela no lote: fornecedor, valor e vencimento. */
function linhaDoLote(parcela: ParcelaPendente, indice: number): string {
  const vencimento = parcela.dataVencimento
    ? ` · vence ${formatarData(parcela.dataVencimento)}`
    : "";
  return `${indice + 1}. ${parcela.fornecedorNome} · ${formatarBRL(
    parcela.valor,
  )}${vencimento}`;
}

/**
 * Mensagem pronta para colar no WhatsApp de quem aprova.
 *
 * O link fica na última linha de propósito: o WhatsApp faz o preview do link e
 * ele precisa ser a última coisa lida, depois do valor e do vencimento. Quem
 * recebe decide pelo texto, não pelo preview.
 *
 * Lista vazia devolve string vazia: mensagem com link para nada é pior do que
 * nada, e é o botão que decide não copiar.
 */
export function mensagemAprovacao(
  parcelas: ParcelaPendente[],
  origem: string,
): string {
  if (parcelas.length === 0) return "";

  const url = urlAprovacao(
    origem,
    parcelas.map((parcela) => parcela.id),
  );

  const blocos: string[][] =
    parcelas.length === 1
      ? [["Aprovação de pagamento no ERP EMT"], corpoDeUma(parcelas[0])]
      : [
          [
            `${parcelas.length} pagamentos para aprovar no ERP EMT`,
            `Total: ${formatarBRL(somar(parcelas))}`,
          ],
          parcelas.map(linhaDoLote),
        ];

  blocos.push(["Abrir para aprovar:", url]);
  return blocos.map((bloco) => bloco.join("\n")).join("\n\n");
}
