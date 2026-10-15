import type {
  AreaMapa,
  EquipamentoMapa,
  EstadoMaquina,
  LocalidadeMapa,
  Posicao,
  TrechoMapa,
} from "@/modules/mapa/tipos";

/**
 * Geometria do mapa no navegador: distância, rumo, km ao longo do traçado e o "cola no traçado"
 * do arraste. Puro (sem deck.gl, sem DOM) para ser testado no vitest.
 *
 * É a MESMA regra de `fn_mapa_resolver_destino` no banco (área > trecho > local > livre): a tela
 * resolve na hora para mostrar na confirmação onde a máquina vai cair; quem grava é a RPC, que
 * resolve de novo com o PostGIS. Os dois podem divergir por centímetros, nunca de zona.
 */

const RAIO_TERRA_M = 6371008.8;
const rad = (graus: number) => (graus * Math.PI) / 180;

/** Distância em metros entre dois pontos [lng, lat] (haversine). */
export function distanciaM(a: Posicao, b: Posicao): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.sqrt(s));
}

/** Rumo de a para b, em graus a partir do norte, sentido horário (0..360). */
export function rumo(a: Posicao, b: Posicao): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Projeção local em metros em torno de `ref` (boa para alguns km). */
export function paraXY(p: Posicao, ref: Posicao): [number, number] {
  const kx = 111320 * Math.cos(rad(ref[1]));
  const ky = 110574;
  return [(p[0] - ref[0]) * kx, (p[1] - ref[1]) * ky];
}

export function deXY(xy: [number, number], ref: Posicao): Posicao {
  const kx = 111320 * Math.cos(rad(ref[1]));
  const ky = 110574;
  return [ref[0] + xy[0] / kx, ref[1] + xy[1] / ky];
}

/** Desloca um ponto `metros` no rumo `graus`. */
export function deslocar(p: Posicao, graus: number, metros: number): Posicao {
  const a = rad(graus);
  return deXY([Math.sin(a) * metros, Math.cos(a) * metros], p);
}

export interface TrechoMedido {
  trecho: TrechoMapa;
  /** Distância acumulada (m) até cada ponto do traçado. */
  acumulado: number[];
  comprimento: number;
}

export function medirTrecho(trecho: TrechoMapa): TrechoMedido {
  const acumulado = [0];
  for (let i = 1; i < trecho.pontos.length; i++) {
    acumulado.push(
      acumulado[i - 1] + distanciaM(trecho.pontos[i - 1], trecho.pontos[i]),
    );
  }
  return {
    trecho,
    acumulado,
    comprimento: acumulado[acumulado.length - 1] ?? 0,
  };
}

/** Ponto e rumo do traçado num km (proporcional ao comprimento, como `fn_mapa_km_no_trecho`). */
export function pontoNoKm(
  m: TrechoMedido,
  km: number,
): { pos: Posicao; heading: number } {
  const { trecho, acumulado, comprimento } = m;
  const pts = trecho.pontos;
  const n = pts.length;
  if (n < 2 || comprimento <= 0) return { pos: pts[0] ?? [0, 0], heading: 0 };
  const extensao = trecho.kmFinal - trecho.kmInicial;
  const fracao =
    extensao === 0
      ? 0
      : Math.min(1, Math.max(0, (km - trecho.kmInicial) / extensao));
  const alvo = fracao * comprimento;
  for (let i = 1; i < n; i++) {
    if (acumulado[i] >= alvo) {
      const s =
        (alvo - acumulado[i - 1]) /
        Math.max(1e-6, acumulado[i] - acumulado[i - 1]);
      const a = pts[i - 1];
      const b = pts[i];
      return {
        pos: [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s],
        heading: rumo(a, b),
      };
    }
  }
  return { pos: pts[n - 1], heading: rumo(pts[n - 2], pts[n - 1]) };
}

/** Marcos de km (a cada `passo` km) de todos os trechos, para os rótulos. */
export function marcosKm(
  medidos: TrechoMedido[],
  passo = 10,
): { km: number; pos: Posicao; trechoId: string }[] {
  const marcos: { km: number; pos: Posicao; trechoId: string }[] = [];
  for (const m of medidos) {
    const a = Math.min(m.trecho.kmInicial, m.trecho.kmFinal);
    const b = Math.max(m.trecho.kmInicial, m.trecho.kmFinal);
    for (let km = Math.ceil(a / passo) * passo; km <= b; km += passo) {
      marcos.push({ km, pos: pontoNoKm(m, km).pos, trechoId: m.trecho.id });
    }
  }
  return marcos;
}

export interface ColagemTrecho {
  trecho: TrechoMapa;
  pos: Posicao;
  distanciaM: number;
  km: number;
  heading: number;
}

/**
 * Ponto do traçado mais perto de `p`, até `maxM` metros. Segmentos a mais de ~5 km (caixa de
 * 0,05 grau) são descartados antes da conta, que é o que mantém o arraste leve com centenas de
 * pontos por trecho.
 */
export function colarNoTrecho(
  p: Posicao,
  medidos: TrechoMedido[],
  maxM: number,
): ColagemTrecho | null {
  let melhor: ColagemTrecho | null = null;
  for (const m of medidos) {
    const t = m.trecho;
    const pts = t.pontos;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (
        Math.min(a[0], b[0]) - 0.05 > p[0] ||
        Math.max(a[0], b[0]) + 0.05 < p[0] ||
        Math.min(a[1], b[1]) - 0.05 > p[1] ||
        Math.max(a[1], b[1]) + 0.05 < p[1]
      ) {
        continue;
      }
      const A = paraXY(a, p);
      const B = paraXY(b, p);
      const AB: [number, number] = [B[0] - A[0], B[1] - A[1]];
      const l2 = AB[0] ** 2 + AB[1] ** 2;
      const u =
        l2 === 0
          ? 0
          : Math.min(1, Math.max(0, (-A[0] * AB[0] - A[1] * AB[1]) / l2));
      const Q: [number, number] = [A[0] + AB[0] * u, A[1] + AB[1] * u];
      const d = Math.hypot(Q[0], Q[1]);
      if (d <= maxM && (!melhor || d < melhor.distanciaM)) {
        const pos = deXY(Q, p);
        const percorrido = m.acumulado[i - 1] + distanciaM(a, pos);
        const km =
          m.comprimento > 0
            ? t.kmInicial +
              (t.kmFinal - t.kmInicial) * (percorrido / m.comprimento)
            : t.kmInicial;
        melhor = { trecho: t, pos, distanciaM: d, km, heading: rumo(a, b) };
      }
    }
  }
  return melhor;
}

export function colarNoLocal(
  p: Posicao,
  locais: LocalidadeMapa[],
  maxM: number,
): { local: LocalidadeMapa; distanciaM: number } | null {
  let melhor: { local: LocalidadeMapa; distanciaM: number } | null = null;
  for (const local of locais) {
    const d = distanciaM(p, local.pos);
    if (d <= maxM && (!melhor || d < melhor.distanciaM))
      melhor = { local, distanciaM: d };
  }
  return melhor;
}

/** Ponto dentro de um anel (ray casting em lng/lat; o polígono é pequeno, a projeção não importa). */
export function dentroDoAnel(p: Posicao, anel: Posicao[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    const cruza =
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** Dentro de alguma parte da área (contorno sim, buraco não). */
export function dentroDaArea(p: Posicao, area: AreaMapa): boolean {
  return area.poligonos.some(
    (aneis) =>
      dentroDoAnel(p, aneis[0]) &&
      !aneis.slice(1).some((buraco) => dentroDoAnel(p, buraco)),
  );
}

/** Área aproximada em graus² (só para escolher a menor quando há sobreposição, como no banco). */
function areaDoAnel(anel: Posicao[]): number {
  let soma = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++)
    soma += (anel[j][0] + anel[i][0]) * (anel[j][1] - anel[i][1]);
  return Math.abs(soma / 2);
}

/** Estado que a zona impõe ao soltar ali (regra do `fn_mapa_resolver_destino`). */
export function estadoDaArea(tipo: string): EstadoMaquina {
  if (tipo === "zona_oficina") return "conserto";
  if (
    tipo === "patio_obra" ||
    tipo === "zona_patio_central" ||
    tipo === "terreno"
  )
    return "parado";
  return "operando";
}

export function estadoDoLocal(tipo: string): EstadoMaquina {
  if (tipo === "oficina") return "conserto";
  if (tipo === "patio" || tipo === "terreno") return "parado";
  return "operando";
}

export type DestinoResolvido =
  | { tipo: "area"; area: AreaMapa; pos: Posicao; estado: EstadoMaquina }
  | {
      tipo: "trecho";
      trecho: TrechoMapa;
      pos: Posicao;
      km: number;
      distanciaM: number;
      heading: number;
      estado: EstadoMaquina;
    }
  | {
      tipo: "localidade";
      local: LocalidadeMapa;
      pos: Posicao;
      distanciaM: number;
      estado: EstadoMaquina;
    }
  | { tipo: "livre"; pos: Posicao; estado: null };

export interface ContextoDestino {
  trechos: TrechoMedido[];
  areas: AreaMapa[];
  localidades: LocalidadeMapa[];
  snapTracadoM: number;
  snapLocalM: number;
}

/** Onde o ponto caiu: área ativa > trecho (cola no km) > local próximo > livre. */
export function resolverDestino(
  p: Posicao,
  ctx: ContextoDestino,
): DestinoResolvido {
  const dentro = ctx.areas
    .filter((a) => dentroDaArea(p, a))
    .sort(
      (a, b) =>
        areaDoAnel(a.poligonos[0]?.[0] ?? []) -
        areaDoAnel(b.poligonos[0]?.[0] ?? []),
    );
  if (dentro.length > 0) {
    const area = dentro[0];
    return { tipo: "area", area, pos: p, estado: estadoDaArea(area.tipo) };
  }
  const colado = colarNoTrecho(p, ctx.trechos, ctx.snapTracadoM);
  if (colado) {
    return {
      tipo: "trecho",
      trecho: colado.trecho,
      pos: colado.pos,
      km: colado.km,
      distanciaM: colado.distanciaM,
      heading: colado.heading,
      estado: "operando",
    };
  }
  const local = colarNoLocal(p, ctx.localidades, ctx.snapLocalM);
  if (local) {
    return {
      tipo: "localidade",
      local: local.local,
      pos: p,
      distanciaM: local.distanciaM,
      estado: estadoDoLocal(local.local.tipo),
    };
  }
  return { tipo: "livre", pos: p, estado: null };
}

export const formatarKm = (km: number): string =>
  km.toFixed(1).replace(".", ",");
export const formatarMetros = (m: number): string => `${Math.round(m)} m`;

/** Cor "#rrggbb" em [r, g, b]; inválida vira o cinza do asfalto. */
export function hexParaRgb(
  hex: string,
  reserva: [number, number, number] = [69, 70, 75],
): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return reserva;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Máquina mais perto de um ponto (até `maxM`), para soltar uma pessoa "em cima" dela. */
export function maquinaEm(
  pos: Posicao,
  equipamentos: EquipamentoMapa[],
  maxM = 25,
): EquipamentoMapa | null {
  let melhor: EquipamentoMapa | null = null;
  let menor = maxM;
  for (const e of equipamentos) {
    if (!e.pos) continue;
    const d = distanciaM(e.pos, pos);
    if (d < menor) {
      menor = d;
      melhor = e;
    }
  }
  return melhor;
}
