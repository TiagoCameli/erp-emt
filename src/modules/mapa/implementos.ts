import type { ImplementoMapa } from "@/modules/mapa/tipos";

/**
 * Implementos no card do equipamento (Tiago, 16/10/2026: "a IMP-005 plataforma roll on está
 * acoplada ao CS-006 ... só marcar no card"). Os acoplados nele e as opções para acoplar: os
 * soltos e os que estão em outro equipamento (acoplar aqui tira de lá, um por vez).
 */
export function implementosDoCard(
  implementos: readonly ImplementoMapa[],
  equipamentoId: string,
): {
  acoplados: ImplementoMapa[];
  opcoes: { valor: string; rotulo: string }[];
} {
  const acoplados = implementos.filter((i) => i.acopladoEm === equipamentoId);
  const opcoes = implementos
    .filter((i) => i.acopladoEm !== equipamentoId)
    .map((i) => ({
      valor: i.id,
      rotulo: `${i.codigo} · ${i.descricao}${i.acopladoEm ? " (em outro equipamento)" : ""}`,
    }));
  return { acoplados, opcoes };
}
