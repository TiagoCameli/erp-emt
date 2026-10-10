/**
 * Teclado da GradeEdicao, sem React: recebe a tecla e o estado, devolve o que fazer. Copiar e colar
 * NÃO passam por aqui: vêm dos eventos copy/paste do navegador, que trazem a área de transferência.
 */
export type PosicaoCelula = { linha: number; coluna: number };
export type AtalhoGrade = "recuar" | "avancar" | "acima" | "abaixo" | "inserir" | "excluir";
export type AcaoTeclado =
  | { tipo: "mover"; para: PosicaoCelula }
  | { tipo: "editar"; manterTexto: boolean; textoInicial?: string }
  | { tipo: "confirmar"; depois: PosicaoCelula }
  | { tipo: "cancelar" }
  | { tipo: "limpar" }
  | { tipo: "atalho"; atalho: AtalhoGrade }
  | { tipo: "nada" };

type Evento = { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean };
type Estado = { posicao: PosicaoCelula; editando: boolean; nLinhas: number; nColunas: number };

const limitar = (n: number, max: number) => Math.max(0, Math.min(n, max - 1));

/** Próxima célula no Tab, ou null na última (Shift+Tab: na primeira): aí o foco sai da grade. */
function andarTab(p: PosicaoCelula, voltar: boolean, nLinhas: number, nColunas: number): PosicaoCelula | null {
  let { linha, coluna } = p;
  coluna += voltar ? -1 : 1;
  if (coluna >= nColunas) { coluna = 0; linha += 1; }
  if (coluna < 0) { coluna = nColunas - 1; linha -= 1; }
  if (linha < 0 || linha >= nLinhas) return null;
  return { linha, coluna };
}

export function acaoDaTecla(e: Evento, s: Estado): AcaoTeclado {
  const mod = e.ctrlKey || e.metaKey;
  const { linha, coluna } = s.posicao;

  if (e.altKey && e.shiftKey && !s.editando) {
    const mapa: Record<string, AtalhoGrade> = { ArrowRight: "recuar", ArrowLeft: "avancar", ArrowUp: "acima", ArrowDown: "abaixo" };
    if (mapa[e.key]) return { tipo: "atalho", atalho: mapa[e.key] };
  }
  if (mod && e.key === "Enter" && !s.editando) return { tipo: "atalho", atalho: "inserir" };
  if (mod && (e.key === "Delete" || e.key === "Backspace") && !s.editando) return { tipo: "atalho", atalho: "excluir" };

  if (s.editando) {
    if (e.key === "Escape") return { tipo: "cancelar" };
    if (e.key === "Enter") return { tipo: "confirmar", depois: { linha: limitar(linha + (e.shiftKey ? -1 : 1), s.nLinhas), coluna } };
    if (e.key === "Tab") {
      // Na borda o Tab não é da grade (WCAG 2.1.2): o foco sai e o onBlur do campo confirma.
      const depois = andarTab(s.posicao, e.shiftKey, s.nLinhas, s.nColunas);
      return depois ? { tipo: "confirmar", depois } : { tipo: "nada" };
    }
    return { tipo: "nada" };
  }

  switch (e.key) {
    case "ArrowDown": return { tipo: "mover", para: { linha: limitar(linha + 1, s.nLinhas), coluna } };
    case "ArrowUp": return { tipo: "mover", para: { linha: limitar(linha - 1, s.nLinhas), coluna } };
    case "ArrowRight": return { tipo: "mover", para: { linha, coluna: limitar(coluna + 1, s.nColunas) } };
    case "ArrowLeft": return { tipo: "mover", para: { linha, coluna: limitar(coluna - 1, s.nColunas) } };
    case "Tab": {
      const para = andarTab(s.posicao, e.shiftKey, s.nLinhas, s.nColunas);
      return para ? { tipo: "mover", para } : { tipo: "nada" };
    }
    case "Enter":
    case "F2": return { tipo: "editar", manterTexto: true };
    case "Delete":
    case "Backspace": return { tipo: "limpar" };
  }
  if (!mod && !e.altKey && e.key.length === 1) return { tipo: "editar", manterTexto: false, textoInicial: e.key };
  return { tipo: "nada" };
}
