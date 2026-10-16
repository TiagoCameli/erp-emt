import { distanciaM, rumo } from "@/modules/mapa/geo";
import type {
  CarretaRetorno,
  EquipamentoMapa,
  FreteEmRota,
  Posicao,
} from "@/modules/mapa/tipos";

/**
 * Carretas EMT pelo Frete (pedidos do Tiago, 16/10/2026):
 * - em frete: a máquina do frete aberto aparece no traçado da rota, na posição estimada pelo tempo
 *   desde que o frete foi registrado (a saída) sobre o tempo da rota que o Frete mediu;
 * - em deslocamento: com a chegada lançada, ela volta do destino para a pedreira (a última de onde
 *   saiu, ou a escolhida na ficha), pelo mesmo relógio; passado o tempo da volta, está parada na
 *   pedreira.
 * Sem GPS, é estimativa: a ficha diz isso.
 */

/** Nunca encosta no destino: quem diz que chegou é a chegada lançada no Frete. */
export const FRACAO_MAXIMA = 0.98;
/** Rota sem tempo medido: 50 km/h de média para carreta carregada. */
const KMH_SEM_TEMPO = 50;

/** Duração da viagem em ms: o tempo medido pelo Frete ou, sem ele, 50 km/h. 0 = sem como medir. */
function duracaoMs(v: Pick<FreteEmRota, "horas" | "km" | "caminho">): number {
  const km = v.km ?? extensaoM(v.caminho) / 1000;
  const horas = v.horas && v.horas > 0 ? v.horas : km / KMH_SEM_TEMPO;
  return horas > 0 ? horas * 3_600_000 : 0;
}

/** Quanto da viagem já passou (0 a 0,98), pelo relógio. */
export function fracaoDaViagem(
  frete: Pick<FreteEmRota, "criadoEm" | "horas" | "km" | "caminho">,
  agora: number,
): number {
  const saida = Date.parse(frete.criadoEm);
  const duracao = duracaoMs(frete);
  if (!Number.isFinite(saida) || duracao === 0) return 0;
  const fracao = (agora - saida) / duracao;
  return Math.min(Math.max(fracao, 0), FRACAO_MAXIMA);
}

/** Quando a carreta chega à pedreira na volta, pelo relógio (ms); null sem como medir. */
export function chegadaNaPedreira(
  r: Pick<CarretaRetorno, "chegadaEm" | "horas" | "km" | "caminho">,
): number | null {
  const inicio = Date.parse(r.chegadaEm);
  const duracao = duracaoMs(r);
  return Number.isFinite(inicio) && duracao > 0 ? inicio + duracao : null;
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
 * A marcação da ficha feita depois da saída do frete (ou da chegada, na volta) vence o Frete
 * quando tira a carreta da estrada: parado, quebrado na obra, em conserto ou fora de
 * funcionamento. Operando NÃO vence (Tiago, 16/10/2026: "carreta operando quer dizer que está
 * rodando"). Vale a hora da última marcação (`marcadoEm`): remarcar "parado" numa carreta que
 * já estava parada também conta.
 */
const ESTADOS_QUE_TIRAM_DA_ROTA: ReadonlySet<string> = new Set([
  "parado",
  "quebrado_obra",
  "conserto",
  "fora_funcionamento",
]);

/** Sem `marcadoEm` (RPC antiga), vale a mudança de estado. */
type Marcacao = Pick<EquipamentoMapa, "estadoMarcado" | "estadoDesde"> &
  Partial<Pick<EquipamentoMapa, "marcadoEm">>;

function marcadaDepois(e: Marcacao, instante: string): boolean {
  const quando = e.marcadoEm ?? e.estadoDesde;
  if (
    !e.estadoMarcado ||
    !ESTADOS_QUE_TIRAM_DA_ROTA.has(e.estadoMarcado) ||
    !quando
  )
    return false;
  const marcada = Date.parse(quando);
  const referencia = Date.parse(instante);
  return (
    Number.isFinite(marcada) &&
    Number.isFinite(referencia) &&
    marcada > referencia
  );
}

export function marcacaoVenceFrete(
  e: Marcacao,
  f: Pick<FreteEmRota, "criadoEm">,
): boolean {
  return marcadaDepois(e, f.criadoEm);
}

export function marcacaoVenceRetorno(
  e: Marcacao,
  r: Pick<CarretaRetorno, "chegadaEm">,
): boolean {
  return marcadaDepois(e, r.chegadaEm);
}

/** A carreta posta pelo Frete: sem trecho nem km, o rumo é o da estrada. */
function peloFrete(
  e: EquipamentoMapa,
  pos: Posicao,
  heading: number,
  estado: EquipamentoMapa["estado"],
  desde: string,
  localidadeNome = "",
): EquipamentoMapa {
  return {
    ...e,
    pos,
    heading,
    rumoManual: null,
    fontePosicao: "frete",
    estado,
    estadoDesde: desde,
    trechoId: null,
    trechoNome: "",
    km: null,
    areaId: null,
    areaNome: "",
    localidadeId: null,
    localidadeNome,
  };
}

/**
 * Põe cada máquina com frete aberto no ponto estimado da rota, "Em frete", e cada carreta que já
 * chegou ao destino no caminho de volta à pedreira, "Em deslocamento" (ou parada na pedreira, se
 * a volta já deu o tempo). Máquina sem nada no Frete passa igual. Frete aberto vence a volta.
 *
 * Se a marcação da ficha venceu o Frete (`marcacaoVenceFrete`, `marcacaoVenceRetorno`), a máquina
 * fica no estado marcado; sem posição própria, aparece onde a marcação a pegou: no destino do
 * frete (ou na pedreira, se marcada depois da chegada estimada lá). O frete sai de `freteDe` e
 * entra em `fretesVencidos`; a volta sai de `retornoDe`.
 */
export function aplicarFretes(
  equipamentos: readonly EquipamentoMapa[],
  fretes: readonly FreteEmRota[],
  retornos: readonly CarretaRetorno[],
  agora: number,
): {
  equipamentos: EquipamentoMapa[];
  freteDe: ReadonlyMap<string, FreteEmRota>;
  fretesVencidos: ReadonlySet<string>;
  retornoDe: ReadonlyMap<string, CarretaRetorno>;
} {
  const freteDe = new Map<string, FreteEmRota>();
  const fretesVencidos = new Set<string>();
  const retornoDe = new Map<string, CarretaRetorno>();
  // O mais recente vale (a lista vem do banco em ordem de saída).
  for (const f of fretes) if (f.equipamentoId) freteDe.set(f.equipamentoId, f);
  for (const r of retornos)
    if (r.equipamentoId && !freteDe.has(r.equipamentoId))
      retornoDe.set(r.equipamentoId, r);
  if (freteDe.size === 0 && retornoDe.size === 0)
    return {
      equipamentos: [...equipamentos],
      freteDe,
      fretesVencidos,
      retornoDe,
    };

  const voltar = (e: EquipamentoMapa): EquipamentoMapa => {
    const r = retornoDe.get(e.id);
    if (!r || r.caminho.length === 0) return e;
    const pedreira = r.caminho[r.caminho.length - 1];
    const naPedreira = chegadaNaPedreira(r);
    if (marcacaoVenceRetorno(e, r)) {
      retornoDe.delete(e.id);
      if (e.pos || e.estado !== "sem_posicao") return e;
      // Marcada antes de dar o tempo da volta: não saiu do destino.
      const marcada = Date.parse(e.marcadoEm ?? e.estadoDesde ?? "");
      const ondeFicou =
        naPedreira !== null && marcada >= naPedreira ? pedreira : r.caminho[0];
      return { ...e, pos: ondeFicou, estado: e.estadoMarcado ?? e.estado };
    }
    if (naPedreira !== null && agora >= naPedreira)
      return peloFrete(
        e,
        pedreira,
        e.heading,
        "parado",
        new Date(naPedreira).toISOString(),
        r.pedreira,
      );
    const inicio = Date.parse(r.chegadaEm);
    const fracao =
      naPedreira !== null && Number.isFinite(inicio)
        ? (agora - inicio) / (naPedreira - inicio)
        : 0;
    const ponto = pontoNaRota(r.caminho, Math.max(fracao, 0));
    if (!ponto) return e;
    return peloFrete(
      e,
      ponto.pos,
      ponto.heading,
      "em_deslocamento",
      r.chegadaEm,
    );
  };

  const vistos = equipamentos.map((e): EquipamentoMapa => {
    const f = freteDe.get(e.id);
    if (!f) return voltar(e);
    if (marcacaoVenceFrete(e, f)) {
      // Todos os fretes abertos da máquina saíram antes da marcação: nenhum segue na estrada.
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
    return peloFrete(e, ponto.pos, ponto.heading, "em_frete", f.criadoEm);
  });
  return { equipamentos: vistos, freteDe, fretesVencidos, retornoDe };
}
