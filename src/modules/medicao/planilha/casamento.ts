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

export type Situacao = "igual" | "mudou_quantidade" | "mudou_preco" | "mudou_quantidade_e_preco" | "mudou_tipo" | "novo" | "ambiguo";

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
  if (nova.tipo !== anterior.tipo) return "mudou_tipo";
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
  const ambiguoItens = new Set<string>();

  // Ruling 2: Only consider escolhas whose ordem exists in novas.
  const novasOrdens = new Set(novas.map((n) => n.ordem));
  const validEscolhas: Record<number, string | null> = {};
  for (const [ordem, itemId] of Object.entries(escolhas)) {
    if (novasOrdens.has(parseInt(ordem, 10))) {
      validEscolhas[parseInt(ordem, 10)] = itemId;
    }
  }

  // Ruling 1: Find itemIds chosen by multiple lines via escolhas.
  const contadorEscolhas = new Map<string | null, number>();
  for (const itemId of Object.values(validEscolhas)) {
    contadorEscolhas.set(itemId, (contadorEscolhas.get(itemId) ?? 0) + 1);
  }
  const ambiguoEscolhas = new Set<string>();
  for (const [itemId, count] of contadorEscolhas.entries()) {
    if (count > 1 && itemId) {
      ambiguoEscolhas.add(itemId);
      ambiguoItens.add(itemId);
    }
  }

  // Pre-reserve all itemIds chosen by valid escolhas (single or disputed) so auto-matching doesn't take them.
  for (const [itemId] of contadorEscolhas.entries()) {
    if (itemId && porId.has(itemId)) {
      usados.add(itemId);
    }
  }

  const linhas: Casamento[] = novas.map((nova) => {
    if (nova.ordem in validEscolhas) {
      const itemId = validEscolhas[nova.ordem];

      // Se escolha é null, retornar novo direto.
      if (!itemId) {
        return { ordem: nova.ordem, itemId: null, situacao: "novo", candidatos: [] };
      }

      // Ruling 1: If this itemId is multiply chosen, make ambiguo.
      if (ambiguoEscolhas.has(itemId)) {
        const keyCandidatos = (porChave.get(chaveDoItem(nova.codigo, nova.descricao, nova.unidade)) ?? [])
          .map((c) => c.itemId)
          .filter((id) => id !== itemId);
        return { ordem: nova.ordem, itemId: null, situacao: "ambiguo", candidatos: [itemId, ...keyCandidatos] };
      }

      // Ruling 4: Non-existent itemId becomes ambiguo with key candidates.
      const anterior = porId.get(itemId);
      if (!anterior) {
        const keyCandidatos = porChave.get(chaveDoItem(nova.codigo, nova.descricao, nova.unidade)) ?? [];
        ambiguoItens.add(itemId);
        return {
          ordem: nova.ordem,
          itemId: null,
          situacao: "ambiguo",
          candidatos: keyCandidatos.map((c) => c.itemId),
        };
      }

      usados.add(itemId);
      return {
        ordem: nova.ordem,
        itemId: anterior.itemId,
        situacao: situacaoDe(nova, anterior),
        candidatos: [],
      };
    }

    const candidatos = (porChave.get(chaveDoItem(nova.codigo, nova.descricao, nova.unidade)) ?? []).filter((a) => !usados.has(a.itemId));
    if (candidatos.length === 0) return { ordem: nova.ordem, itemId: null, situacao: "novo", candidatos: [] };
    if (candidatos.length > 1)
      return { ordem: nova.ordem, itemId: null, situacao: "ambiguo", candidatos: candidatos.map((c) => c.itemId) };
    usados.add(candidatos[0].itemId);
    return { ordem: nova.ordem, itemId: candidatos[0].itemId, situacao: situacaoDe(nova, candidatos[0]), candidatos: [] };
  });

  const casados = new Set(linhas.map((l) => l.itemId).filter((id): id is string => id !== null));
  return { linhas, sairam: anteriores.filter((a) => !casados.has(a.itemId) && !ambiguoItens.has(a.itemId)) };
}
