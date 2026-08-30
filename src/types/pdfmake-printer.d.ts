/**
 * Tipos do gerador de PDF do pdfmake NO NODE.
 *
 * O `@types/pdfmake` descreve só a API de NAVEGADOR (`createPdf`), e o `main` do
 * pacote aponta para `src/printer.js`, que é outra coisa: uma classe
 * `PdfPrinter`. Importar `"pdfmake"` com esses tipos dá "this expression is not
 * constructable" — o TypeScript está lendo a API errada do pacote certo.
 *
 * Por isso a importação no código é explícita (`pdfmake/src/printer`), e este
 * arquivo descreve só o que usamos: construir o printer com um dicionário de
 * fontes e pedir o stream do documento. Escrito à mão em vez de `any` porque a
 * regra do projeto é `strict` sem `any` novo, e porque a assinatura errada aqui
 * apareceria como PDF vazio em produção, não como erro de build.
 */
declare module "pdfmake/src/printer" {
  import type { Readable } from "node:stream";
  import type {
    TDocumentDefinitions,
    TFontDictionary,
  } from "pdfmake/interfaces";

  /**
   * O documento em construção. É um stream de leitura que só termina depois do
   * `end()` — quem consome junta os pedaços em `data` e resolve em `end`.
   */
  interface PdfKitDocument extends Readable {
    end(): void;
  }

  class PdfPrinter {
    constructor(fonts: TFontDictionary);
    createPdfKitDocument(documento: TDocumentDefinitions): PdfKitDocument;
  }

  export = PdfPrinter;
}
