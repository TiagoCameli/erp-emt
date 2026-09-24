/**
 * Números compactos da Visão Geral (o `fmtLCompact`/`fmtBRLCompact` da origem, em pt-BR).
 * Módulo puro: cartões no servidor e eixos dos gráficos no cliente.
 */

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const brlCompacto = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "12,3 mil L". */
export function litrosCompactos(valor: number): string {
  return `${compacto.format(valor)} L`;
}

/** "R$ 12,3 mil"; zero é "R$ 0" (o eixo não precisa de ",00"). */
export function brlCompactoDe(valor: number): string {
  return valor === 0 ? "R$ 0" : brlCompacto.format(valor);
}

/** "R$ 6,3947": o R$/L com as 4 casas da origem. */
export function reais4(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

/** "12,5%". */
export function porcento(valor: number, casas = 1): string {
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}
