/**
 * Lógica pura de cobertura do período de atestado. Datas como strings
 * yyyy-MM-dd, que ordenam lexicograficamente na mesma ordem cronológica —
 * dispensa parsing de Date/timezone.
 */

/**
 * Diz se um dia está coberto pelo atestado que vai de `inicio` até `fim`
 * (inclusive). `fim` nulo significa atestado de um único dia (o próprio
 * início).
 */
export function atestadoCobre(
  inicio: string,
  fim: string | null,
  dia: string,
): boolean {
  const fimEfetivo = fim ?? inicio;
  return inicio <= dia && dia <= fimEfetivo;
}
