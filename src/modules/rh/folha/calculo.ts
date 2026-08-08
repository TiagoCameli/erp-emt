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
  LancamentoDaFolha,
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

/** Lançamentos da folha (Bloco 8a, Task 7) separados por tipo, com o total de cada grupo. */
export interface LancamentosDaFolhaAgrupados {
  salarios: LancamentoDaFolha[];
  guias: LancamentoDaFolha[];
  totalSalarios: number;
  totalGuias: number;
}

/**
 * Separa os lançamentos gerados pela aprovação da folha em salários (um por
 * colaborador) e guias (um por grupo de recolhimento), e soma cada grupo.
 * Pura: sem Supabase, para não obrigar `listarLancamentosDaFolha` a fazer uma
 * leitura por grupo (o erro que o Bloco 6 corrigiu na revisão desta mesma
 * tela, com `resumoPorCentroCusto`/`resumoPorEncargo` acima).
 *
 * Em rascunho e pendente_aprovacao não existe lançamento nenhum (a aprovação
 * é quem gera): a lista de entrada vem vazia e os dois grupos saem vazios,
 * sem quebrar. O rateio por centro de custo de uma guia pode ficar incompleto
 * quando um colaborador não tem centro de custo (docs/decisoes.md) — isso não
 * aparece aqui porque `LancamentoDaFolha` não carrega rateio, só o total do
 * lançamento, que é sempre o valor cheio da guia.
 */
export function agruparLancamentosDaFolha(
  lancamentos: LancamentoDaFolha[],
): LancamentosDaFolhaAgrupados {
  const porDescricao = (a: LancamentoDaFolha, b: LancamentoDaFolha) =>
    a.descricao.localeCompare(b.descricao, "pt-BR");

  const salarios = lancamentos
    .filter((lancamento) => lancamento.tipo === "salario")
    .sort(porDescricao);
  const guias = lancamentos
    .filter((lancamento) => lancamento.tipo === "guia")
    .sort(porDescricao);

  return {
    salarios,
    guias,
    totalSalarios: salarios.reduce((soma, l) => soma + l.valor, 0),
    totalGuias: guias.reduce((soma, l) => soma + l.valor, 0),
  };
}
