import type {
  AlvoObjeto,
  DepositoMapa,
  PilhaMapa,
  Posicao,
  TanqueMapa,
} from "@/modules/mapa/tipos";

/**
 * Tanques, pilhas e depósitos do Estoque como objetos 3D do mapa (pedido do Tiago, 15/10/2026).
 * O 3D é gerado pelo próprio mapa (cilindro, cone, caixa), sem arquivo de modelo: o tamanho sai
 * da capacidade do tanque e a cor do que está dentro. Medidas reais, em metros; quem desenha
 * aplica a mesma escala das máquinas.
 */

export type Rgb = [number, number, number];
export type FormaObjeto = "cilindro" | "cone" | "caixa";

export interface ObjetoMapa {
  id: string;
  alvo: AlvoObjeto;
  nome: string;
  /** Linha de baixo do rótulo e da ficha ("15.000 L de Diesel S10", "pilha"). */
  detalhe: string;
  pos: Posicao | null;
  forma: FormaObjeto;
  /** Diâmetro (cilindro e cone) ou largura (caixa), em metros. */
  largura: number;
  /** Comprimento da caixa (galpão); igual à largura nas formas redondas. */
  comprimento: number;
  altura: number;
  cor: Rgb;
}

/** Tanque sem capacidade cadastrada (posto externo, por exemplo) desenha como um de 15 mil L. */
export const CAPACIDADE_PADRAO_L = 15000;

export const COR_COMBUSTIVEL: Rgb = [207, 148, 58];
export const COR_MATERIAL: Rgb = [69, 70, 75];
export const COR_EXTERNO: Rgb = [150, 150, 150];
export const COR_DEPOSITO: Rgb = [62, 119, 68];

/**
 * Tanque vertical com altura 1,5 vez o diâmetro: V = π·d²/4·1,5d, então d = ∛(4V / 1,5π).
 * 15 mil L ≈ 2,3 m × 3,5 m; 100 mil L ≈ 4,4 m × 6,6 m.
 */
export function dimensoesDoTanque(
  capacidade: number | null,
  unidade: string,
): { diametro: number; altura: number } {
  const litros =
    capacidade && capacidade > 0
      ? unidade.toLowerCase() === "m3" || unidade.toLowerCase() === "m³"
        ? capacidade * 1000
        : capacidade
      : CAPACIDADE_PADRAO_L;
  const volume = litros / 1000;
  const diametro = Math.cbrt((4 * volume) / (1.5 * Math.PI));
  return { diametro, altura: diametro * 1.5 };
}

/** Cor da pilha pelo nome do material: brita cinza, areia bege, terra/argila marrom, pó claro. */
export function corDaPilha(nome: string): Rgb {
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/areia/.test(n)) return [214, 186, 128];
  if (/terra|argila|saibro|laterita|cascalho/.test(n)) return [150, 98, 60];
  if (/\bpo\b|po de pedra|filler/.test(n)) return [200, 200, 195];
  return [140, 140, 136];
}

const litrosTexto = (n: number) =>
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n)} L`;

/** Todos os tanques, pilhas e depósitos ativos como objetos do mapa (com ou sem lugar). */
export function objetosDoEstoque(
  tanques: readonly TanqueMapa[],
  pilhas: readonly PilhaMapa[],
  depositos: readonly DepositoMapa[],
): ObjetoMapa[] {
  const objetos: ObjetoMapa[] = [];
  for (const t of tanques) {
    const { diametro, altura } = dimensoesDoTanque(t.capacidade, t.unidade);
    const capacidade =
      t.capacidade && t.capacidade > 0 ? litrosTexto(t.capacidade) : "";
    objetos.push({
      id: t.id,
      alvo: "tanque",
      nome: t.nome,
      detalhe: [
        t.ehExterno
          ? "posto externo"
          : t.uso === "material"
            ? "tanque de material"
            : "tanque",
        capacidade,
        t.insumo,
      ]
        .filter(Boolean)
        .join(" · "),
      pos: t.pos,
      forma: "cilindro",
      largura: diametro,
      comprimento: diametro,
      altura,
      cor: t.ehExterno
        ? COR_EXTERNO
        : t.uso === "material"
          ? COR_MATERIAL
          : COR_COMBUSTIVEL,
    });
  }
  for (const p of pilhas)
    objetos.push({
      id: p.id,
      alvo: "pilha",
      nome: p.nome,
      detalhe: "pilha",
      pos: p.pos,
      forma: "cone",
      largura: 10,
      comprimento: 10,
      altura: 4,
      cor: corDaPilha(p.nome),
    });
  for (const d of depositos)
    objetos.push({
      id: d.id,
      alvo: "deposito",
      nome: d.nome,
      detalhe: "depósito",
      pos: d.pos,
      forma: "caixa",
      largura: 10,
      comprimento: 15,
      altura: 5,
      cor: COR_DEPOSITO,
    });
  return objetos;
}
