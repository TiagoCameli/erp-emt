/**
 * Os 4 grupos de insumo: o primeiro nível da classificação.
 *
 * Grupo é fixo (semeado no banco, não criável nem deletável); a subcategoria é
 * livre dentro do grupo. O insumo aponta só para a subcategoria, e o grupo vem
 * por join: uma fonte de verdade só.
 *
 * A cor vem do banco como TOKEN (ambar, verde, grafite, neutro), não como hex.
 * A tradução para classe do design system fica aqui, para o badge do grupo ser
 * igual em toda tela.
 *
 * Sem 'use server': é só dado, importável por Server e Client Components.
 */

export const SLUGS_GRUPO = [
  "material",
  "mao_de_obra",
  "equipamentos",
  "outros",
] as const;

export type SlugGrupo = (typeof SLUGS_GRUPO)[number];

export const CORES_GRUPO = ["ambar", "verde", "grafite", "neutro"] as const;

export type CorGrupo = (typeof CORES_GRUPO)[number];

/** Nome da subcategoria que recebe o que a classificação não cobriu. */
export const SUBCATEGORIA_A_CLASSIFICAR = "A classificar";

/** Classe do badge por token de cor. Só tokens do design system. */
export const CLASSE_COR_GRUPO: Record<CorGrupo, string> = {
  ambar: "bg-accent/10 text-accent-foreground ring-1 ring-accent/30",
  verde: "bg-status-efeito/10 text-status-efeito ring-1 ring-status-efeito/30",
  grafite: "bg-foreground/10 text-foreground ring-1 ring-foreground/20",
  neutro: "bg-muted text-muted-foreground ring-1 ring-border",
};

export function ehSlugGrupo(valor: unknown): valor is SlugGrupo {
  return (
    typeof valor === "string" && (SLUGS_GRUPO as readonly string[]).includes(valor)
  );
}

/** Normaliza a cor vinda do banco. Desconhecida cai em neutro. */
export function corGrupo(valor: unknown): CorGrupo {
  return typeof valor === "string" && (CORES_GRUPO as readonly string[]).includes(valor)
    ? (valor as CorGrupo)
    : "neutro";
}
