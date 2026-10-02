import "server-only";

import { getDocumentProxy } from "unpdf";

import { ErroRelatorioSiac, type PedacoTexto } from "./ler-relatorio";

/**
 * Texto do PDF com a posição de cada pedaço, página a página (unpdf = pdf.js para servidor, roda na
 * Vercel sem binário). A posição passa pelo viewport da página, então a rotação (o relatório SIAC é
 * landscape girado 90°) já vem aplicada: x cresce para a direita e y para baixo. O pdf.js repete
 * alguns pedaços (a sigla da tabela de índices sai duas vezes): o repetido no mesmo lugar é descartado.
 */
export async function extrairTextoPdf(bytes: Uint8Array): Promise<PedacoTexto[][]> {
  try {
    return await extrair(bytes);
  } catch (e) {
    throw traduzirErroPdf(e);
  }
}

/** Erro do pdf.js (em inglês) vira ErroRelatorioSiac em pt-BR. */
export function traduzirErroPdf(e: unknown): ErroRelatorioSiac {
  if (e instanceof ErroRelatorioSiac) return e;
  if (e instanceof Error && e.name === "PasswordException") {
    return new ErroRelatorioSiac("O PDF está protegido por senha; envie o relatório sem senha.");
  }
  return new ErroRelatorioSiac("O arquivo não é um PDF válido ou está corrompido.");
}

async function extrair(bytes: Uint8Array): Promise<PedacoTexto[][]> {
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
