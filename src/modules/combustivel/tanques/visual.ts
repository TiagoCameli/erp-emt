/**
 * Apresentação do tanque (a cápsula da origem): cor por combustível e formato da
 * capacidade. Módulo puro, sem "use client" e sem server-only.
 */

/** Cinza do tanque vazio ou de combustível fora do catálogo. */
export const COR_SEM_COMBUSTIVEL = "#94A3B8";

/**
 * A cor segue o COMBUSTÍVEL, nunca a posição do card: o mesmo diesel é da mesma
 * cor em todo tanque, filtrado ou não. Paleta da origem (TanqueVisual do Gestão
 * Obras). A origem casa o nome exato ("Diesel S10"); aqui o insumo vem do
 * catálogo de Compras ("OLEO DIESEL B S10", "ARLA 32 - LITRO"), então casa por
 * pedaço do nome. S500 antes de S10 por clareza, embora um não contenha o outro.
 */
const REGRAS_COR: ReadonlyArray<{ padrao: RegExp; cor: string }> = [
  { padrao: /\barla\b/, cor: "#14B8A6" }, // verde-azulado
  { padrao: /\bs[\s-]?500\b/, cor: "#F59E0B" }, // laranja
  { padrao: /\bs[\s-]?10\b/, cor: "#3B82F6" }, // azul
  { padrao: /\bgasolina\b/, cor: "#EF4444" }, // vermelho
  { padrao: /\betanol\b/, cor: "#10B981" }, // verde (reserva, fora do catálogo)
];

export function corDoCombustivel(nome: string | null | undefined): string {
  if (!nome) return COR_SEM_COMBUSTIVEL;
  const normalizado = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return REGRAS_COR.find((regra) => regra.padrao.test(normalizado))?.cor ?? COR_SEM_COMBUSTIVEL;
}

/**
 * Capacidade é cadastro, não medição: até 2 casas, sem forçar zeros
 * (15000 -> "15.000"). O NÍVEL usa `formatarLitros`, sempre com 2 casas.
 */
export function formatarCapacidade(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
