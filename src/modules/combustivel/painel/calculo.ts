import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";

/**
 * Contas da visão geral do Combustível sobre as saídas não excluídas do mês.
 * Módulo puro, testado em calculo.test.ts.
 *
 * Litros e valor somam em inteiros de décimo de milésimo (`somarValoresOperacionais`):
 * os dois têm 4 casas no banco, e somar centenas de saídas em float erra a última.
 */

export interface SaidaPainel {
  tipoConsumidor: string;
  equipamentoId: string | null;
  insumoId: string;
  litros: number;
  valorTotal: number;
}

export interface TotalPorChave {
  id: string;
  litros: number;
  valor: number;
  abastecimentos: number;
}

export interface ResumoMes {
  abastecimentos: number;
  litros: number;
  /**
   * Custo = valor das saídas de EQUIPAMENTO PRÓPRIO. A carreta de transportadora
   * não é custo da EMT: o valor dela vira débito na conta corrente da transportadora.
   */
  custo: number;
  porCombustivel: TotalPorChave[];
  /** Os 10 equipamentos que mais consumiram, em litros. */
  maioresConsumidores: TotalPorChave[];
}

function agrupar(saidas: readonly SaidaPainel[], chave: (s: SaidaPainel) => string | null): TotalPorChave[] {
  const grupos = new Map<string, SaidaPainel[]>();
  for (const s of saidas) {
    const id = chave(s);
    if (id === null) continue;
    const lista = grupos.get(id) ?? [];
    lista.push(s);
    grupos.set(id, lista);
  }
  return [...grupos.entries()].map(([id, lista]) => ({
    id,
    litros: somarValoresOperacionais(lista.map((s) => s.litros)),
    valor: somarValoresOperacionais(lista.map((s) => s.valorTotal)),
    abastecimentos: lista.length,
  }));
}

/** Maior primeiro; empate pelo id, para a ordem não mudar entre recargas. */
function porLitros(a: TotalPorChave, b: TotalPorChave): number {
  return b.litros - a.litros || a.id.localeCompare(b.id);
}

export function resumirMes(saidas: readonly SaidaPainel[], topN = 10): ResumoMes {
  const proprias = saidas.filter((s) => s.tipoConsumidor === "equipamento_proprio");
  return {
    abastecimentos: saidas.length,
    litros: somarValoresOperacionais(saidas.map((s) => s.litros)),
    custo: somarValoresOperacionais(proprias.map((s) => s.valorTotal)),
    porCombustivel: agrupar(saidas, (s) => s.insumoId).sort(porLitros),
    // Soma por equipamento ANTES de cortar: cortar as maiores saídas e depois
    // agrupar deixaria de fora o equipamento de muitas saídas pequenas.
    maioresConsumidores: agrupar(proprias, (s) => s.equipamentoId).sort(porLitros).slice(0, topN),
  };
}

/** Nível em % da capacidade, 0 a 100 (acima de 100 aparece como está: é sinal de cadastro errado). Sem capacidade, null. */
export function percentualDoTanque(nivel: number, capacidade: number): number | null {
  if (!(capacidade > 0)) return null;
  return Math.round((nivel / capacidade) * 1000) / 10;
}
