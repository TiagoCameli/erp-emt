import type { TipoAtividade } from "@/modules/execucao/_shared/rotulos";

/**
 * Operações de árvore da grade (recuar, avançar, mover, inserir). Devolvem só as mudanças, no formato
 * do lote (fn_ex_atividades_salvar_lote): quem grava e valida é o banco. `ordem` vale entre irmãs.
 */
export type LinhaArvore = { id: string; codigo: string; paiId: string | null; tipo: TipoAtividade; ordem: number };
export type Mudanca = { id: string; pai_codigo?: string; ordem?: number; tipo?: TipoAtividade };

function irmas(linhas: readonly LinhaArvore[], paiId: string | null): LinhaArvore[] {
  return linhas.filter((l) => l.paiId === paiId).sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
}

export function ordenarArvore(linhas: readonly LinhaArvore[]): LinhaArvore[] {
  const saida: LinhaArvore[] = [];
  const visitar = (paiId: string | null) => {
    for (const l of irmas(linhas, paiId)) {
      saida.push(l);
      visitar(l.id);
    }
  };
  visitar(null);
  return saida;
}

function achar(linhas: readonly LinhaArvore[], id: string): LinhaArvore {
  const l = linhas.find((x) => x.id === id);
  if (!l) throw new Error(`Linha ${id} não está na grade`);
  return l;
}

export function recuar(linhas: readonly LinhaArvore[], id: string): Mudanca[] {
  const linha = achar(linhas, id);
  const lista = irmas(linhas, linha.paiId);
  const i = lista.findIndex((l) => l.id === id);
  if (i <= 0) return [];
  const novoPai = lista[i - 1];
  const filhasDoNovoPai = irmas(linhas, novoPai.id);
  const ordem = (filhasDoNovoPai.at(-1)?.ordem ?? 0) + 1;
  const mudancas: Mudanca[] = [];
  if (novoPai.tipo !== "resumo") mudancas.push({ id: novoPai.id, tipo: "resumo" });
  mudancas.push({ id, pai_codigo: novoPai.codigo, ordem });
  return mudancas;
}

export function avancar(linhas: readonly LinhaArvore[], id: string): Mudanca[] {
  const linha = achar(linhas, id);
  if (linha.paiId === null) return [];
  const pai = achar(linhas, linha.paiId);
  const avo = pai.paiId === null ? null : achar(linhas, pai.paiId);
  const ordem = pai.ordem + 1;
  const mudancas: Mudanca[] = [{ id, pai_codigo: avo?.codigo ?? "", ordem }];
  for (const irma of irmas(linhas, pai.paiId)) {
    if (irma.id !== pai.id && irma.ordem >= ordem) mudancas.push({ id: irma.id, ordem: irma.ordem + 1 });
  }
  return mudancas;
}

function trocar(linhas: readonly LinhaArvore[], id: string, delta: -1 | 1): Mudanca[] {
  const linha = achar(linhas, id);
  const lista = irmas(linhas, linha.paiId);
  const i = lista.findIndex((l) => l.id === id);
  const outra = lista[i + delta];
  if (!outra) return [];
  return [{ id, ordem: outra.ordem }, { id: outra.id, ordem: linha.ordem }];
}

export const moverAcima = (linhas: readonly LinhaArvore[], id: string) => trocar(linhas, id, -1);
export const moverAbaixo = (linhas: readonly LinhaArvore[], id: string) => trocar(linhas, id, 1);

/** Código livre seguinte entre as irmãs: prefixo do pai + (maior último número + 1). */
function proximoCodigo(linhas: readonly LinhaArvore[], pai: LinhaArvore | null): string {
  const prefixo = pai ? `${pai.codigo}.` : "";
  const numeros = linhas
    .filter((l) => (pai ? l.paiId === pai.id : l.paiId === null))
    .map((l) => Number(l.codigo.slice(prefixo.length)))
    .filter((n) => Number.isInteger(n));
  return `${prefixo}${(numeros.length ? Math.max(...numeros) : 0) + 1}`;
}

export function proximaLinha(
  linhas: readonly LinhaArvore[],
  idReferencia: string | null,
): { codigo: string; pai_codigo: string; ordem: number; mudancas: Mudanca[] } {
  if (idReferencia === null) {
    const raiz = irmas(linhas, null);
    return { codigo: proximoCodigo(linhas, null), pai_codigo: "", ordem: (raiz.at(-1)?.ordem ?? 0) + 1, mudancas: [] };
  }
  const ref = achar(linhas, idReferencia);
  const pai = ref.paiId === null ? null : achar(linhas, ref.paiId);
  const ordem = ref.ordem + 1;
  const mudancas = irmas(linhas, ref.paiId)
    .filter((l) => l.id !== ref.id && l.ordem >= ordem)
    .map((l) => ({ id: l.id, ordem: l.ordem + 1 }));
  return { codigo: proximoCodigo(linhas, pai), pai_codigo: pai?.codigo ?? "", ordem, mudancas };
}
