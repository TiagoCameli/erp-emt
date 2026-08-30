import "server-only";

// `pdfmake/src/printer` e nao `pdfmake`: o `main` do pacote aponta para o
// printer do Node, mas o @types descreve a API de navegador. O caminho
// explícito casa com os tipos de `src/types/pdfmake-printer.d.ts`.
import PdfPrinter from "pdfmake/src/printer";
import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

/**
 * Transforma uma definição de documento do pdfmake em bytes de PDF.
 *
 * **Módulo de servidor.** Nunca importar de Client Component: o pdfmake pesa
 * mais de 1 MB e não tem por que viajar até o navegador de ninguém. A tela pede
 * o arquivo à Server Action e recebe base64, o mesmo caminho da planilha
 * exportada (`gerarPlanilhaFolha`), e `baixarBase64` faz o download.
 *
 * ============================================================
 * POR QUE HELVETICA, E NÃO A INTER DA MARCA
 * ============================================================
 * Helvetica é uma das 14 fontes PADRÃO do PDF: todo leitor já a tem, e o
 * gerador não precisa embutir arquivo nenhum. A alternativa seria empacotar os
 * .ttf da Inter (uns 400 KB) e carregá-los do disco — que em serverless é
 * justamente o tipo de leitura de arquivo que falha em produção e passa no
 * ambiente local.
 *
 * O preço é a fonte do documento não ser a da tela. É um preço pequeno: a marca
 * do documento é o cabeçalho e a Pista, que continuam iguais, e o acento do
 * pt-BR sobrevive porque a Helvetica padrão usa WinAnsi, que tem ã, ç, é e o
 * espaço não separável do "R$ 1.234,56".
 */

/**
 * As quatro variantes que o pdfmake exige de uma família. Os nomes são os das
 * fontes padrão do PDF; o pdfkit as reconhece sem arquivo.
 */
const FONTES: TFontDictionary = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

/**
 * Gera o PDF e devolve os bytes.
 *
 * `createPdfKitDocument` devolve um stream, e não uma Promise: os pedaços são
 * juntados aqui para o chamador receber um Buffer pronto. Sem isso, cada tela
 * que exporta PDF repetiria o mesmo `on("data")` — e um `on("error")`
 * esquecido deixaria a Server Action pendurada até o timeout, sem mensagem.
 */
export function gerarPdf(documento: TDocumentDefinitions): Promise<Buffer> {
  const printer = new PdfPrinter(FONTES);
  const doc = printer.createPdfKitDocument(documento);

  return new Promise((resolve, reject) => {
    const pedacos: Buffer[] = [];
    doc.on("data", (pedaco: Buffer) => pedacos.push(pedaco));
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
    doc.end();
  });
}
