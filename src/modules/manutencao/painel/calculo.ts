import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";

/**
 * Contas do painel da Manutenção sobre as OS concluídas do ano. Módulo puro,
 * testado em calculo.test.ts.
 */

export interface OsConcluidaResumo {
  equipamentoId: string;
  dataConclusao: string;
  custoTotal: number;
}

export interface CustoPorEquipamento {
  equipamentoId: string;
  custo: number;
  quantidadeOs: number;
}

/** Janela do mês e do ano de uma data yyyy-mm-dd (coluna `date`, sem fuso). */
export function janelasDoPainel(hoje: string): {
  mesDe: string;
  mesAte: string;
  anoDe: string;
  anoAte: string;
} {
  const [ano, mes] = hoje.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, "0");
  return {
    mesDe: `${ano}-${mm}-01`,
    mesAte: `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`,
    anoDe: `${ano}-01-01`,
    anoAte: `${ano}-12-31`,
  };
}

/** Custo das OS concluídas entre `de` e `ate` (inclusive), com 4 casas. */
export function custoNoPeriodo(os: readonly OsConcluidaResumo[], de: string, ate: string): number {
  return somarValoresOperacionais(
    os.filter((item) => item.dataConclusao >= de && item.dataConclusao <= ate).map((item) => item.custoTotal),
  );
}

/**
 * Os `n` equipamentos de maior custo. Soma por equipamento ANTES de cortar: cortar
 * as OS mais caras e depois agrupar deixaria de fora o equipamento de muitas OS
 * baratas. Empate desempata pelo id, para a ordem não mudar entre recargas.
 */
export function maioresCustosPorEquipamento(
  os: readonly OsConcluidaResumo[],
  n = 10,
): CustoPorEquipamento[] {
  const porEquipamento = new Map<string, { valores: number[]; quantidade: number }>();
  for (const item of os) {
    const atual = porEquipamento.get(item.equipamentoId) ?? { valores: [], quantidade: 0 };
    atual.valores.push(item.custoTotal);
    atual.quantidade += 1;
    porEquipamento.set(item.equipamentoId, atual);
  }
  return [...porEquipamento.entries()]
    .map(([equipamentoId, { valores, quantidade }]) => ({
      equipamentoId,
      custo: somarValoresOperacionais(valores),
      quantidadeOs: quantidade,
    }))
    .sort((a, b) => b.custo - a.custo || a.equipamentoId.localeCompare(b.equipamentoId))
    .slice(0, n);
}
