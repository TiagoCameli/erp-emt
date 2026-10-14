/**
 * Unidades do tanque de material (14/10/2026). O tanque tem VOLUME (capacidade_litros); o
 * material vem na unidade do insumo (L, m³, kg, t). Volume converte direto; massa converte
 * pela densidade do material (kg/L). Espelho de `fn_tanque_em_litros` no banco: a trava é
 * dele, aqui é só para mostrar e para o cadastro. Módulo puro.
 */

export const UNIDADES_CAPACIDADE = ["L", "m3", "kg", "t"] as const;
export type UnidadeCapacidade = (typeof UNIDADES_CAPACIDADE)[number];

export const ROTULO_UNIDADE_CAPACIDADE: Record<UnidadeCapacidade, string> = {
  L: "Litros (L)",
  m3: "Metros cúbicos (m³)",
  kg: "Quilos (kg)",
  t: "Toneladas (t)",
};

/** Sigla para mostrar ao lado do número. */
export function siglaVisivel(sigla: string): string {
  return sigla.toLowerCase() === "m3" ? "m³" : sigla;
}

type Familia = "volume" | "massa";

// Lista fixa, a mesma do banco. Sigla fora dela não tem conversão para litros.
const FATORES: Record<string, { familia: Familia; fator: number }> = {
  l: { familia: "volume", fator: 1 },
  lt: { familia: "volume", fator: 1 },
  litro: { familia: "volume", fator: 1 },
  litros: { familia: "volume", fator: 1 },
  m3: { familia: "volume", fator: 1000 },
  "m³": { familia: "volume", fator: 1000 },
  kg: { familia: "massa", fator: 1 },
  t: { familia: "massa", fator: 1000 },
  ton: { familia: "massa", fator: 1000 },
};

function fatorDe(sigla: string | null | undefined) {
  return FATORES[(sigla ?? "").trim().toLowerCase()] ?? null;
}

export function ehUnidadeDeMassa(sigla: string | null | undefined): boolean {
  return fatorDe(sigla)?.familia === "massa";
}

/** Litros por 1 unidade da sigla. Null = sem conversão (unidade fora da lista ou massa sem densidade). */
function litrosPorUnidade(sigla: string | null | undefined, densidade: number | null | undefined): number | null {
  const f = fatorDe(sigla);
  if (!f) return null;
  if (f.familia === "volume") return f.fator;
  return densidade && densidade > 0 ? f.fator / densidade : null;
}

/** Quantidade na unidade do material, em litros. */
export function emLitros(
  quantidade: number,
  sigla: string | null | undefined,
  densidade: number | null | undefined,
): number | null {
  const porUnidade = litrosPorUnidade(sigla, densidade);
  return porUnidade === null ? null : quantidade * porUnidade;
}

/** Litros na unidade pedida. */
export function deLitros(
  litros: number,
  sigla: string | null | undefined,
  densidade: number | null | undefined,
): number | null {
  const porUnidade = litrosPorUnidade(sigla, densidade);
  return porUnidade === null ? null : litros / porUnidade;
}
