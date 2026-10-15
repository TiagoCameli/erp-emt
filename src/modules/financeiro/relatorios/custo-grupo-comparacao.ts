import type { PeriodoCompetencia } from "@/modules/financeiro/relatorios/drill";

/**
 * "Onde o custo sobe" no Custo por grupo de insumo (15/10/2026): os meses do
 * período e as maiores variações contra o anterior (o período anterior em si é
 * o `periodoAnterior` do custo por centro, a mesma regra).
 *
 * Módulo puro: nada de banco, nada de React.
 */

function deslocarMes(mes: string, meses: number): string {
  const [ano, numero] = mes.split("-").map(Number);
  const data = new Date(Date.UTC(ano, numero - 1 + meses, 1));
  return data.toISOString().slice(0, 7);
}

function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}

/** Os meses de um período fechado, para a série. Aberto: lista vazia. */
export function mesesDoPeriodo(periodo: PeriodoCompetencia): string[] {
  if (periodo.mes) return [periodo.mes];
  if (!periodo.de || !periodo.ate) return [];
  const n = mesesEntre(periodo.de, periodo.ate);
  return Array.from({ length: n }, (_, i) => deslocarMes(periodo.de!, i));
}

export interface ItemComparado {
  chave: string;
  nome: string;
  atual: number;
  anterior: number;
  /** atual - anterior, em reais (somado em centavos). */
  variacao: number;
}

/**
 * Junta o atual e o anterior pela chave (quem só existe de um lado entra com
 * zero do outro) e devolve as maiores ALTAS, da maior para a menor. Queda não
 * entra: a pergunta é onde o custo sobe.
 */
export function maioresAltas(
  atual: { chave: string; nome: string; valor: number }[],
  anterior: { chave: string; nome: string; valor: number }[],
  quantas = 5,
): ItemComparado[] {
  const mapa = new Map<string, ItemComparado>();
  const cent = (v: number) => Math.round(v * 100);
  for (const a of anterior) {
    mapa.set(a.chave, { chave: a.chave, nome: a.nome, atual: 0, anterior: a.valor, variacao: 0 });
  }
  for (const a of atual) {
    const item = mapa.get(a.chave);
    if (item) {
      item.atual = a.valor;
      item.nome = a.nome;
    } else {
      mapa.set(a.chave, { chave: a.chave, nome: a.nome, atual: a.valor, anterior: 0, variacao: 0 });
    }
  }
  return [...mapa.values()]
    .map((i) => ({ ...i, variacao: (cent(i.atual) - cent(i.anterior)) / 100 }))
    .filter((i) => i.variacao > 0)
    .sort((a, b) => b.variacao - a.variacao || a.nome.localeCompare(b.nome))
    .slice(0, quantas);
}

/** Variação relativa (fração). Null quando o anterior é zero. */
export function variacaoRelativa(atual: number, anterior: number): number | null {
  return anterior === 0 ? null : (atual - anterior) / anterior;
}

/**
 * O que se compara entre dois períodos: cada grupo com insumo e, dentro do
 * "Sem insumo", cada categoria financeira. Comparar o "Sem insumo" inteiro não
 * diria nada (é quase todo o custo).
 */
export function itensComparaveis(grupos: {
  grupoId: string | null;
  nome: string;
  valor: number;
  categorias?: { categoriaId: string | null; nome: string; valor: number }[];
}[]): { chave: string; nome: string; valor: number }[] {
  return grupos.flatMap((g) =>
    g.grupoId !== null
      ? [{ chave: `grupo:${g.grupoId}`, nome: g.nome, valor: g.valor }]
      : (g.categorias ?? []).map((c) => ({
          chave: `categoria:${c.categoriaId ?? "sem"}`,
          nome: c.nome,
          valor: c.valor,
        })),
  );
}
