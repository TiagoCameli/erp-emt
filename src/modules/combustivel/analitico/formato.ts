import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import type { chipDeContagem } from "@/modules/combustivel/analitico/calculo";

/**
 * Formatação das abas analíticas. Módulo puro.
 *
 * Litros sempre com 2 casas (`formatarLitros`, nunca inteiro: 155,6 L virando 156 já
 * enganou conferência). R$/L com 4 casas, como o preço do litro é guardado.
 */

export { formatarLitros };

function numero(valor: number, casas: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** "R$ 6,3947"; sem preço (0), travessão, como a origem. */
export function formatarRPorL(valor: number | null): string {
  return valor !== null && valor > 0 ? `R$ ${numero(valor, 4)}` : "—";
}

/** "12,5%". */
export function formatarPct(valor: number, casas = 1): string {
  return `${numero(valor, casas)}%`;
}

export function formatarContagem(valor: number): string {
  return numero(valor, 0);
}

/** "+3" / "−2", o override da origem quando a base anterior é pequena. */
export function textoDiferenca(chip: ReturnType<typeof chipDeContagem>): string | undefined {
  if (chip.tipo !== "absoluto") return undefined;
  return `${chip.valor > 0 ? "+" : "−"}${Math.abs(chip.valor)}`;
}

/** Plural simples: "1 saída" / "2 saídas". */
export function plural(qtd: number, singular: string, pluralTexto: string): string {
  return `${qtd} ${qtd === 1 ? singular : pluralTexto}`;
}

/**
 * O chip de tendência da origem (KpiCard): ±5 pontos é ruído (fica neutro, traço), acima
 * de 200% vira "+200%+" porque engana mais do que ajuda.
 */
export function leituraDaTendencia(delta: number): { direcao: "alta" | "queda" | "estavel"; texto: string } {
  const direcao = delta > 5 ? "alta" : delta < -5 ? "queda" : "estavel";
  let texto: string;
  if (delta > 200) texto = "+200%+";
  else if (delta < -200) texto = "−200%+";
  else texto = `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${numero(Math.abs(delta), 1)}%`;
  return { direcao, texto };
}
