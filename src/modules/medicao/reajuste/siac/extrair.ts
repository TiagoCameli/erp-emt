import "server-only";

import { getDocumentProxy } from "unpdf";

import type { PedacoTexto } from "./ler-relatorio";

/**
 * Texto do PDF com a posição de cada pedaço, página a página (unpdf = pdf.js para servidor, roda na
 * Vercel sem binário). A posição passa pelo viewport da página, então a rotação (o relatório SIAC é
 * landscape girado 90°) já vem aplicada: x cresce para a direita e y para baixo. O pdf.js repete
 * alguns pedaços (a sigla da tabela de índices sai duas vezes): o repetido no mesmo lugar é descartado.
 */
export async function extrairTextoPdf(bytes: Uint8Array): Promise<PedacoTexto[][]> {
  const pdf = await getDocumentProxy(bytes);
  try {
    const paginas: PedacoTexto[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n);
      const viewport = pagina.getViewport({ scale: 1 });
      const conteudo = await pagina.getTextContent();
      const vistos = new Set<string>();
      const pedacos: PedacoTexto[] = [];
      for (const item of conteudo.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const chave = `${item.str}|${Math.round(x)}|${Math.round(y)}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        pedacos.push({ texto: item.str.trim(), x, y });
      }
      paginas.push(pedacos);
    }
    return paginas;
  } finally {
    await pdf.cleanup();
  }
}
