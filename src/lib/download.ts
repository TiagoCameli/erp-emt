/**
 * Download, no navegador, de um arquivo gerado por Server Action.
 *
 * Server Action não devolve arquivo, devolve bytes: quem gera planilha (ou PDF)
 * volta com base64, e é o navegador que transforma isso num download. Mora aqui
 * porque a conversão é idêntica em toda tela que exporta, e cada cópia dela é
 * uma chance de esquecer o `revokeObjectURL` e deixar o blob preso na memória.
 *
 * Sem "use client": é função pura de navegador, importada por Client Component.
 */

/** MIME de .xlsx, para quem exporta planilha. */
export const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * MIME de PDF. Precisa ser passado explicitamente: o default de `baixarBase64` é
 * xlsx, e um PDF baixado com MIME de planilha abre no Excel em vez do leitor.
 */
export const MIME_PDF = "application/pdf";

/** Converte o base64 da Server Action num Blob. Só roda no navegador (atob). */
function base64ParaBlob(base64: string, mime: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Baixa o arquivo que a Server Action devolveu em base64, com o nome que ela
 * escolheu. O link é criado e removido na hora: é a única forma de disparar
 * download com nome de arquivo definido pelo servidor sem abrir outra aba.
 */
export function baixarBase64(
  base64: string,
  nomeArquivo: string,
  mime: string = MIME_XLSX,
): void {
  const url = URL.createObjectURL(base64ParaBlob(base64, mime));
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
