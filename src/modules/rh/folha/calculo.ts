/**
 * Regras puras de agregação da folha (Bloco 6, Task 4 — fix de performance).
 * Sem Supabase: deriva os resumos por centro de custo e por encargo
 * diretamente dos itens de uma `FolhaDetalhe` já carregada por `buscarFolha`,
 * sem re-buscar a folha. Mantidas fora de `queries.ts` (que tem
 * `import "server-only"`) para poderem ser testadas com Vitest.
 */
import type {
  CustoCentroCusto,
  FolhaDetalhe,
  ResumoEncargo,
} from "@/modules/rh/folha/queries";

/**
 * Custo total da folha agrupado por centro de custo, somando o custo_total
 * dos itens. Itens sem centro de custo entram num grupo "Sem centro de
 * custo". Ordenado por custo decrescente.
 */
export function resumoPorCentroCusto(folha: FolhaDetalhe): CustoCentroCusto[] {
  const grupos = new Map<string, CustoCentroCusto>();

  for (const item of folha.itens) {
    const chave = item.centroCustoId ?? "__sem_centro__";
    const atual = grupos.get(chave);
    if (atual) {
      atual.custoTotal += item.custoTotal;
    } else {
      grupos.set(chave, {
        centroCustoId: item.centroCustoId,
        centroCustoNome: item.centroCustoNome,
        centroCustoCodigo: item.centroCustoCodigo,
        custoTotal: item.custoTotal,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => b.custoTotal - a.custoTotal);
}

/**
 * Total por tipo de encargo, somando as linhas de `encargosDetalhe` de todos
 * os itens da folha. Ordenado por nome. Folhas antigas, sem quebra gravada
 * (todo item com `encargosDetalhe: []`), retornam lista vazia — a UI então
 * omite esta seção e mostra só o total consolidado.
 */
export function resumoPorEncargo(folha: FolhaDetalhe): ResumoEncargo[] {
  const totais = new Map<string, number>();

  for (const item of folha.itens) {
    for (const encargo of item.encargosDetalhe) {
      totais.set(encargo.nome, (totais.get(encargo.nome) ?? 0) + encargo.valor);
    }
  }

  return [...totais.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
