import type { EstadoEfetivo } from "@/modules/mapa/tipos";

/**
 * Cores e classes do estado da máquina. O mapa (deck.gl escreve RGB no canvas, não lê CSS)
 * e o painel (badges com as classes de status do design system) têm que concordar: os RGB
 * abaixo são os mesmos hexes dos tokens --status-* do globals.css, no tema claro.
 */

export type Rgb = [number, number, number];

export const COR_ESTADO: Record<EstadoEfetivo, Rgb> = {
  operando: [19, 117, 55], // --status-aprovado
  parado: [95, 102, 115], // --status-rascunho
  em_frete: [42, 120, 214], // --viz-producao (azul)
  em_deslocamento: [74, 58, 167], // --viz-financiamento (roxo)
  quebrado_obra: [185, 28, 28], // --status-rejeitado
  conserto: [161, 74, 7], // --status-pendente
  sem_posicao: [140, 140, 140],
  fora_funcionamento: [69, 70, 75], // --emt-asfalto
};

/** Classes do selo no painel (texto + cor, nunca só cor). */
export const CLASSES_ESTADO: Record<EstadoEfetivo, string> = {
  operando: "bg-status-aprovado/10 text-status-aprovado",
  parado: "bg-status-rascunho/10 text-status-rascunho",
  em_frete: "bg-[#2a78d6]/10 text-[#2a78d6] dark:text-[#3987e5]",
  em_deslocamento: "bg-[#4a3aa7]/10 text-[#4a3aa7] dark:text-[#9085e9]",
  quebrado_obra: "bg-status-rejeitado/10 text-status-rejeitado",
  conserto: "bg-status-pendente/10 text-status-pendente",
  sem_posicao: "bg-muted text-muted-foreground",
  fora_funcionamento: "bg-muted text-muted-foreground",
};

/** Ordem em que os estados aparecem em filtros e contagens. */
export const ORDEM_ESTADOS: EstadoEfetivo[] = [
  "operando",
  "parado",
  "em_frete",
  "em_deslocamento",
  "quebrado_obra",
  "conserto",
  "sem_posicao",
  "fora_funcionamento",
];

export const ROTULO_TIPO_LOCALIDADE: Record<string, string> = {
  patio: "Pátio",
  oficina: "Oficina",
  usina: "Usina",
  terreno: "Terreno",
  jazida: "Jazida",
  pedreira: "Pedreira",
  porto: "Porto",
  cidade: "Cidade",
  sede: "Sede",
  deposito: "Depósito",
  canteiro: "Canteiro",
  alojamento: "Alojamento",
  pulmao: "Pulmão",
  outro: "Outro",
};

export function rotuloTipoLocalidade(tipo: string): string {
  return (
    ROTULO_TIPO_LOCALIDADE[tipo] ??
    (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "Local")
  );
}

/** Cor de preenchimento das áreas desenhadas, por tipo. */
export const COR_AREA: Record<string, Rgb> = {
  patio_obra: [95, 102, 115],
  zona_patio_central: [95, 102, 115],
  zona_oficina: [161, 74, 7],
  terreno: [62, 119, 68],
  jazida: [207, 148, 58],
  canteiro: [42, 120, 214],
  edificacao: [74, 58, 167],
};
