import { deslocar, distanciaM, type DestinoResolvido } from "@/modules/mapa/geo";
import type { Posicao } from "@/modules/mapa/tipos";

/**
 * Obra de destino da transferência. Antes a obra vinha só do ponto onde a máquina caía: soltar
 * fora de área, trecho ou local de obra gravava `obra_id` nulo, e a máquina perdia a obra sem
 * aviso (Tiago, 16/10/2026). Agora a confirmação mostra a obra, deixa trocar e, quando o ponto
 * não é de obra nenhuma, obriga a escolher: uma obra ou "Sem obra" de propósito. O banco cobra o
 * mesmo (`fn_mapa_mover_equipamentos`, v1.21).
 */

/** "Sem obra" escolhido de propósito (pátio central, oficina, em trânsito). */
export const SEM_OBRA = "__sem_obra__";
/** Vários pontos de obras diferentes: cada máquina fica com a obra de onde caiu. */
export const PELA_ZONA = "__pela_zona__";

/** A obra da zona onde o ponto caiu (área, trecho ou local); null = ponto sem obra. */
export function obraDoDestino(d: DestinoResolvido): string | null {
  switch (d.tipo) {
    case "area":
      return d.area.obraId;
    case "trecho":
      return d.trecho.obraId || null;
    case "localidade":
      return d.local.obraId;
    default:
      return null;
  }
}

/**
 * O que o campo "Obra de destino" mostra ao abrir: a obra do ponto quando todas caem na mesma;
 * "pela zona" quando caem em obras diferentes (todas com obra); vazio (obrigatório escolher)
 * quando algum ponto não é de obra nenhuma.
 */
export function escolhaInicialObra(destinos: DestinoResolvido[]): string {
  const obras = new Set(destinos.map(obraDoDestino));
  if (obras.has(null)) return "";
  if (obras.size === 1) return [...obras][0] ?? "";
  return obras.size > 1 ? PELA_ZONA : "";
}

/** A obra com que a máquina fica, dada a escolha do campo e o ponto dela. */
export function obraEfetiva(
  escolha: string,
  destino: DestinoResolvido,
): string | null {
  if (escolha === SEM_OBRA || escolha === "") return null;
  if (escolha === PELA_ZONA) return obraDoDestino(destino);
  return escolha;
}

export type DecisaoObra =
  | { tipo: "pela_zona" }
  | { tipo: "obra"; obraId: string }
  | { tipo: "sem_obra" };

/** O que vai para o servidor; null = a pessoa ainda não escolheu (não pode confirmar). */
export function decisaoObra(escolha: string): DecisaoObra | null {
  if (escolha === "") return null;
  if (escolha === PELA_ZONA) return { tipo: "pela_zona" };
  if (escolha === SEM_OBRA) return { tipo: "sem_obra" };
  return { tipo: "obra", obraId: escolha };
}

/** Distância em que outra máquina já "ocupa" o ponto da obra. */
const RAIO_OCUPADO_M = 10;

/**
 * Onde a máquina transferida pela ficha (sem arraste) aparece: no ponto da obra no mapa; se já
 * houver máquina ali, num anel em volta (a cada 60°, 15 m e mais 10 m a cada volta) para uma
 * não esconder a outra. Depois a pessoa arrasta para o lugar exato (ajuste de localização).
 */
export function pontoNaObra(
  base: Posicao,
  ocupados: readonly Posicao[],
): Posicao {
  const livre = (p: Posicao) =>
    ocupados.every((o) => distanciaM(o, p) >= RAIO_OCUPADO_M);
  if (livre(base)) return base;
  for (let k = 0; k < 36; k++) {
    const volta = Math.floor(k / 6);
    const p = deslocar(base, (k % 6) * 60 + volta * 30, 15 + volta * 10);
    if (livre(p)) return p;
  }
  return base;
}
