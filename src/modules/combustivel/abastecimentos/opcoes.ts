import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";

/**
 * Centros que a alocação oferece: só as RAÍZES de obra. A alocação diz onde o
 * equipamento trabalhou, e na origem a etapa virou texto (`etapa_legado`); o
 * centro gravado é a obra. Escritório e Manutenção não entram. Módulo puro.
 */
export function obrasParaAlocacao(centros: readonly CentroCustoOpcao[]): CentroCustoOpcao[] {
  return centros.filter((centro) => centro.paiId === null && ehLugarDeTrabalho(centro.tipo));
}

/**
 * Tipos de centro onde equipamento trabalha e frete descarrega. Até 10/10/2026
 * todos eram "obra"; a reclassificação (PR 2 do controle total) separou sócio,
 * empresa ligada e imobilizado para tirá-los do CUSTO, não da operação: o
 * caminhão continua abastecendo na Amazônia e a máquina comprada continua
 * trabalhando antes de ir para a obra.
 */
export const TIPOS_LUGAR_DE_TRABALHO = ["obra", "socio", "empresa_ligada", "imobilizado"] as const;

export function ehLugarDeTrabalho(tipo: string | null | undefined): boolean {
  return (TIPOS_LUGAR_DE_TRABALHO as readonly string[]).includes(tipo ?? "");
}
