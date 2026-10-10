/**
 * Bloco copiado do Excel ou do Google Planilhas (texto com tabulação). Aspas só abrem célula no começo
 * dela, e "" dentro de aspas é uma aspa, igual ao que o Excel escreve na área de transferência.
 */
export function lerBlocoColado(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let emAspas = false;
  const t = texto.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (emAspas) {
      if (c === '"' && t[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') {
        emAspas = false;
      } else {
        celula += c;
      }
    } else if (c === '"' && celula === "") {
      emAspas = true;
    } else if (c === "\t") {
      linha.push(celula);
      celula = "";
    } else if (c === "\n") {
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = "";
    } else {
      celula += c;
    }
  }
  if (celula !== "" || linha.length > 0) {
    linha.push(celula);
    linhas.push(linha);
  }
  return linhas;
}
