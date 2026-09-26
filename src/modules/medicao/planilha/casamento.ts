import { comparar, lerDecimal } from "@/modules/medicao/_shared/decimal";

import type { LinhaImportada } from "./montagem";

/**
 * Casa as linhas da versão nova (aditivo) com os itens da versão anterior, para o acumulado
 * atravessar o aditivo pela identidade estável do item (spec 5.2). Chave: código + descrição
 * (sem caixa, espaço normalizado) + unidade. Chave repetida fica ambígua e espera o usuário. Um
 * item anterior casa com uma linha só. O que sobra da versão anterior "saiu".
 */

export interface LinhaAnterior {
  itemId: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  tipo: "titulo" | "servico";
  precoUnitario: string | null;
  quantidadePrevista: string | null;
}

export type Situacao = "igual" | "mudou_quantidade" | "mudou_preco" | "mudou_quantidade_e_preco" | "novo" | "ambiguo";

export interface Casamento {
  ordem: number;
  itemId: string | null;
  situacao: Situacao;
  candidatos: string[];
}

export interface ResultadoCasamento {
  linhas: Casamento[];
  sairam: LinhaAnterior[];
}

export function chaveDoItem(codigo: string, descricao: string, unidade: string | null): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return `${codigo.trim()}|${norm(descricao)}|${norm(unidade ?? "")}`;
}

function iguais(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return comparar(lerDecimal(a), lerDecimal(b)) === 0;
}

function situacaoDe(nova: LinhaImportada, anterior: LinhaAnterior): Situacao {
  const qtd = !iguais(nova.quantidadePrevista, anterior.quantidadePrevista);
  const preco = !iguais(nova.precoUnitario, anterior.precoUnitario);
  if (qtd && preco) return "mudou_quantidade_e_preco";
  if (qtd) return "mudou_quantidade";
  if (preco) return "mudou_preco";
  return "igual";
}

export function casarComVersaoAnterior(
  novas: LinhaImportada[],
  anteriores: LinhaAnterior[],
  escolhas: Record<number, string | null> = {},
): ResultadoCasamento {
  const porChave = new Map<string, LinhaAnterior[]>();
  for (const a of anteriores) {
    const chave = chaveDoItem(a.codigo, a.descricao, a.unidade);
    porChave.set(chave, [...(porChave.get(chave) ?? []), a]);
  }
  const porId = new Map(anteriores.map((a) => [a.itemId, a]));
  const usados = new Set<string>();

  // Escolhas explícitas primeiro, para o casamento automático não roubar o item escolhido.
  for (const [, itemId] of Object.entries(escolhas)) if (itemId) usados.add(itemId);

  const linhas: Casamento[] = novas.map((nova) => {
    if (nova.ordem in escolhas) {
      const itemId = escolhas[nova.ordem];
      const anterior = itemId ? porId.get(itemId) : undefined;
      return anterior
        ? { ordem: nova.ordem, itemId: anterior.itemId, situacao: situacaoDe(nova, anterior), candidatos: [] }
        : { ordem: nova.ordem, itemId: null, situacao: "novo", candidatos: [] };
    }
    const candidatos = (porChave.get(chaveDoItem(nova.codigo, nova.descricao, nova.unidade)) ?? []).filter((a) => !usados.has(a.itemId));
    if (candidatos.length === 0) return { ordem: nova.ordem, itemId: null, situacao: "novo", candidatos: [] };
    if (candidatos.length > 1) return { ordem: nova.ordem, itemId: null, situacao: "ambiguo", candidatos: candidatos.map((c) => c.itemId) };
    usados.add(candidatos[0].itemId);
    return { ordem: nova.ordem, itemId: candidatos[0].itemId, situacao: situacaoDe(nova, candidatos[0]), candidatos: [] };
  });

  const casados = new Set(linhas.map((l) => l.itemId).filter((id): id is string => id !== null));
  return { linhas, sairam: anteriores.filter((a) => !casados.has(a.itemId)) };
}
