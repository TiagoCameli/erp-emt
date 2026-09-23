import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";

/**
 * Centros que a alocação oferece: só as RAÍZES de obra. A alocação diz onde o
 * equipamento trabalhou, e na origem a etapa virou texto (`etapa_legado`); o
 * centro gravado é a obra. Escritório e Manutenção não entram. Módulo puro.
 */
export function obrasParaAlocacao(centros: readonly CentroCustoOpcao[]): CentroCustoOpcao[] {
  return centros.filter((centro) => centro.paiId === null && centro.tipo === "obra");
}
