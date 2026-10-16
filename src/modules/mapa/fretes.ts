import { distanciaM, rumo } from "@/modules/mapa/geo";
import type {
  EquipamentoMapa,
  FreteEmRota,
  Posicao,
} from "@/modules/mapa/tipos";

/**
 * Carretas em rota pelo Frete (pedido do Tiago, 16/10/2026): a máquina do frete aberto aparece no
 * traçado da rota, na posição estimada pelo tempo desde que o frete foi registrado (a saída) sobre
 * o tempo da rota que o Frete mediu. Sem GPS, é estimativa: a ficha diz isso.
 */

/** Nunca encosta no destino: quem diz que chegou é a chegada lançada no Frete. */
export const FRACAO_MAXIMA = 0.98;
/** Rota sem tempo medido: 50 km/h de média para carreta carregada. */
const KMH_SEM_TEMPO = 50;

/** Quanto da viagem já passou (0 a 0,98), pelo relógio. */
export function fracaoDaViagem(
  frete: Pick<FreteEmRota, "criadoEm" | "horas" | "km" | "caminho">,
  agora: number,
): number {
  const saida = Date.parse(frete.criadoEm);
  if (!Number.isFinite(saida)) return 0;
  const km = frete.km ?? extensaoM(frete.caminho) / 1000;
  const horas =
    frete.horas && frete.horas > 0 ? frete.horas : km / KMH_SEM_TEMPO;
  if (!(horas > 0)) return 0;
  const fracao = (agora - saida) / (horas * 3_600_000);
  return Math.min(Math.max(fracao, 0), FRACAO_MAXIMA);
}

function extensaoM(caminho: readonly Posicao[]): number {
  let total = 0;
  for (let i = 1; i < caminho.length; i++)
    total += distanciaM(caminho[i - 1], caminho[i]);
  return total;
}

/** O ponto a `fracao` do comprimento do caminho e o rumo do trecho em que ele cai. */
export function pontoNaRota(
  caminho: readonly Posicao[],
  fracao: number,
): { pos: Posicao; heading: number } | null {
  if (caminho.length === 0) return null;
  if (caminho.length === 1) return { pos: caminho[0], heading: 0 };
  const alvo = extensaoM(caminho) * Math.min(Math.max(fracao, 0), 1);
  let andado = 0;
  for (let i = 1; i < caminho.length; i++) {
    const a = caminho[i - 1];
    const b = caminho[i];
    const d = distanciaM(a, b);
    if (andado + d >= alvo || i === caminho.length - 1) {
      const t = d > 0 ? Math.min(Math.max((alvo - andado) / d, 0), 1) : 0;
      return {
        pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        heading: rumo(a, b),
      };
    }
    andado += d;
  }
  return null;
}

/**
 * A marcação da ficha feita depois da saída do frete vence o frete quando tira a carreta da
 * estrada: parado, quebrado na obra, em conserto ou fora de funcionamento. Operando NÃO vence (Tiago, 16/10/2026:
 * "carreta operando quer dizer que está em rota"), e em rota é o próprio frete.
 */
const ESTADOS_QUE_TIRAM_DA_ROTA: ReadonlySet<string> = new Set([
  "parado",
  "quebrado_obra",
  "conserto",
  "fora_funcionamento",
]);

export function marcacaoVenceFrete(
  e: Pick<EquipamentoMapa, "estadoMarcado" | "estadoDesde">,
  f: Pick<FreteEmRota, "criadoEm">,
): boolean {
  if (
    !e.estadoMarcado ||
    !ESTADOS_QUE_TIRAM_DA_ROTA.has(e.estadoMarcado) ||
    !e.estadoDesde
  )
    return false;
  const marcada = Date.parse(e.estadoDesde);
  const saida = Date.parse(f.criadoEm);
  return Number.isFinite(marcada) && Number.isFinite(saida) && marcada > saida;
}

/**
 * Põe cada máquina com frete em rota no ponto estimado da rota, em "Em rota", sem trecho nem km
 * (o rumo é o da estrada). Máquina sem frete passa igual. Devolve também o frete de cada máquina.
 *
 * Se a marcação da ficha venceu o frete (`marcacaoVenceFrete`), a máquina fica no estado marcado;
 * sem posição própria, aparece no destino do frete, que é onde ela chegou. O frete sai de
 * `freteDe` e entra em `fretesVencidos` (a rota dele não é desenhada).
 */
export function aplicarFretes(
  equipamentos: readonly EquipamentoMapa[],
  fretes: readonly FreteEmRota[],
  agora: number,
): {
  equipamentos: EquipamentoMapa[];
  freteDe: ReadonlyMap<string, FreteEmRota>;
  fretesVencidos: ReadonlySet<string>;
} {
  const freteDe = new Map<string, FreteEmRota>();
  const fretesVencidos = new Set<string>();
  // O mais recente vale (a lista vem do banco em ordem de saída).
  for (const f of fretes) if (f.equipamentoId) freteDe.set(f.equipamentoId, f);
  if (freteDe.size === 0)
    return { equipamentos: [...equipamentos], freteDe, fretesVencidos };
  const vistos = equipamentos.map((e): EquipamentoMapa => {
    const f = freteDe.get(e.id);
    if (!f) return e;
    if (marcacaoVenceFrete(e, f)) {
      // Todos os fretes abertos da máquina saíram antes da marcação: nenhum segue em rota.
      for (const g of fretes)
        if (g.equipamentoId === e.id && marcacaoVenceFrete(e, g))
          fretesVencidos.add(g.id);
      freteDe.delete(e.id);
      const destino = f.caminho[f.caminho.length - 1];
      if (e.pos || !destino || e.estado !== "sem_posicao") return e;
      return { ...e, pos: destino, estado: e.estadoMarcado ?? e.estado };
    }
    const ponto = pontoNaRota(f.caminho, fracaoDaViagem(f, agora));
    if (!ponto) return e;
    return {
      ...e,
      pos: ponto.pos,
      heading: ponto.heading,
      rumoManual: null,
      fontePosicao: "frete",
      estado: "em_rota",
      estadoDesde: f.criadoEm,
      trechoId: null,
      trechoNome: "",
      km: null,
      areaId: null,
      areaNome: "",
      localidadeId: null,
      localidadeNome: "",
    };
  });
  return { equipamentos: vistos, freteDe, fretesVencidos };
}
