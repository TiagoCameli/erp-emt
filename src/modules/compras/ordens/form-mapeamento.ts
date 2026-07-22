import { paraNumero } from "@/modules/compras/ordens/calculo";
import type { OrdemCompraFormInput } from "@/modules/compras/ordens/schemas";

/** Grupo de centro de custo do formulário (centro de custo > insumos). */
export type GrupoForm = OrdemCompraFormInput["centrosCusto"][number];

/** Item plano da OC: como vem do banco e como a action grava. */
export interface ItemPlano {
  insumoId: string;
  quantidade: number;
  precoUnitario: number;
  centroCustoId: string;
}

/**
 * Agrupa itens planos por centro de custo, na ordem de primeira aparição,
 * convertendo quantidade/preço para string com vírgula (formato do form).
 * Usado ao carregar uma OC para edição.
 */
export function agruparItensPorCentroCusto(itens: ItemPlano[]): GrupoForm[] {
  const ordem: string[] = [];
  const porCentro = new Map<string, GrupoForm["insumos"]>();
  for (const item of itens) {
    if (!porCentro.has(item.centroCustoId)) {
      porCentro.set(item.centroCustoId, []);
      ordem.push(item.centroCustoId);
    }
    porCentro.get(item.centroCustoId)!.push({
      insumoId: item.insumoId,
      quantidade: String(item.quantidade).replace(".", ","),
      precoUnitario: String(item.precoUnitario).replace(".", ","),
    });
  }
  return ordem.map((centroCustoId) => ({
    centroCustoId,
    insumos: porCentro.get(centroCustoId)!,
  }));
}

/**
 * Achata os grupos do formulário na lista plana de itens que a action grava.
 * Cada insumo herda o centro de custo do seu grupo; qtd/preço são coeridos.
 */
export function achatarGruposEmItens(grupos: GrupoForm[]): ItemPlano[] {
  return grupos.flatMap((grupo) =>
    grupo.insumos.map((insumo) => ({
      insumoId: insumo.insumoId,
      quantidade: paraNumero(insumo.quantidade),
      precoUnitario: paraNumero(insumo.precoUnitario),
      centroCustoId: grupo.centroCustoId,
    })),
  );
}
