import type { LinhaBoletim } from "./tipos";

export type NoBoletim = LinhaBoletim & { filhos: NoBoletim[] };

/**
 * Árvore da planilha para EXIBIR o boletim: liga cada linha ao pai por `pai_id`, com irmãos na
 * ordem de `ordem`. O código não serve de chave (a planilha oficial repete `02.01`), por isso a
 * ligação é sempre pelo id. Linha cujo pai não veio na lista vira raiz, para nada sumir da tela.
 *
 * Não toca em número nenhum: os valores de cada linha (inclusive os dos títulos) já vêm prontos
 * da RPC (D7).
 */
export function montarArvoreBoletim(linhas: LinhaBoletim[]): NoBoletim[] {
  const ordenadas = [...linhas].sort((a, b) => a.ordem - b.ordem);
  const nos = new Map<string, NoBoletim>(ordenadas.map((l) => [l.id, { ...l, filhos: [] }]));
  const raizes: NoBoletim[] = [];
  for (const linha of ordenadas) {
    const no = nos.get(linha.id)!;
    const pai = linha.pai_id !== null && linha.pai_id !== linha.id ? nos.get(linha.pai_id) : undefined;
    if (pai) pai.filhos.push(no);
    else raizes.push(no);
  }
  return raizes;
}
