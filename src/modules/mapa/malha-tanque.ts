import type { Rgb } from "@/modules/mapa/objetos";

/**
 * Malhas 3D dos tanques do mapa, montadas em código (pedido do Tiago, 16/10/2026: "mais
 * realista"). Dois modelos, os que existem nas obras da EMT:
 *
 * - **horizontal**: tanque aéreo de diesel/ARLA (4 a 30 mil L) deitado em dois berços de aço,
 *   dentro da bacia de contenção de concreto, com boca de visita, respiro, escada e a bomba
 *   abastecedora do lado de fora da bacia;
 * - **vertical**: tanque de usina (CAP, emulsão, imprimação e os grandes) sobre base de
 *   concreto, com anéis do costado, teto cônico, guarda-corpo, escada com gaiola e bocais.
 *
 * Tudo é medido em diâmetros (diâmetro do tanque = 1), com Z para cima e o chão em z = 0: quem
 * desenha escala pelo diâmetro real do tanque. As cores vão no vértice (0 a 1); a camada desenha
 * com cor branca, então a cor do conteúdo já vem pintada no costado.
 */

export type FormaTanque = "tanque_horizontal" | "tanque_vertical";

/** Comprimento total do tanque horizontal (de tampo a tampo), em diâmetros. */
export const COMPRIMENTO_HORIZONTAL = 2.8;
/** Profundidade do tampo elíptico 2:1 (um quarto do diâmetro). */
export const PROFUNDIDADE_TAMPO = 0.25;
/** Altura do costado do tanque vertical, em diâmetros (a mesma de `dimensoesDoTanque`). */
export const ALTURA_VERTICAL = 1.5;

export interface MalhaTanque {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
}

type V3 = readonly [number, number, number];
type Cor = readonly [number, number, number];

const CONCRETO: Rgb = [178, 174, 165];
const PISO_BACIA: Rgb = [150, 147, 139];
const ACO_ESCURO: Rgb = [62, 64, 68];
const GALVANIZADO: Rgb = [172, 176, 180];
const BRANCO_BOMBA: Rgb = [234, 234, 228];
const VISOR: Rgb = [38, 42, 48];

const cor = (c: Rgb): Cor => [c[0] / 255, c[1] / 255, c[2] / 255];
/** Tom da mesma cor: f < 1 escurece (solda, tampa), f > 1 clareia (teto ao sol). */
const tom = (c: Rgb, f: number): Cor => [
  Math.min(1, (c[0] * f) / 255),
  Math.min(1, (c[1] * f) / 255),
  Math.min(1, (c[2] * f) / 255),
];

const soma = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vezes = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const menos = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function unit(a: V3): V3 {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

/** Eixo de um sólido de revolução: origem, direção do eixo e os dois raios da seção. */
interface Eixo {
  origem: V3;
  eixo: V3;
  u: V3;
  v: V3;
}

function eixoEntre(a: V3, b: V3): { eixo: Eixo; comprimento: number } {
  const d = menos(b, a);
  const comprimento = Math.hypot(d[0], d[1], d[2]);
  const e = unit(d);
  const apoio: V3 = Math.abs(e[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = unit(cruz(e, apoio));
  const v = cruz(e, u);
  return { eixo: { origem: a, eixo: e, u, v }, comprimento };
}

class Construtor {
  private readonly p: number[] = [];
  private readonly n: number[] = [];
  private readonly c: number[] = [];

  triangulo(a: V3, b: V3, d: V3, na: V3, nb: V3, nd: V3, k: Cor) {
    this.p.push(...a, ...b, ...d);
    this.n.push(...na, ...nb, ...nd);
    this.c.push(...k, ...k, ...k);
  }

  /** Quadrilátero a-b-c-d (em ordem) com uma normal por vértice. */
  quad(q: readonly V3[], nq: readonly V3[], k: Cor) {
    this.triangulo(q[0], q[1], q[2], nq[0], nq[1], nq[2], k);
    this.triangulo(q[0], q[2], q[3], nq[0], nq[2], nq[3], k);
  }

  /** Face plana (quatro cantos, uma normal só). */
  plano(q: readonly V3[], normal: V3, k: Cor) {
    this.quad(q, [normal, normal, normal, normal], k);
  }

  /**
   * Sólido de revolução: o perfil é uma lista de [raio, posição no eixo], de baixo para cima
   * (assim a normal sai para fora). `suave` alisa a normal nos vértices do meio do perfil
   * (tampo elíptico, domo); sem ele cada trecho fica com aresta viva (costado, flange).
   */
  torno(
    e: Eixo,
    perfil: readonly (readonly [number, number])[],
    lados: number,
    k: Cor,
    suave = false,
  ) {
    const ponto = (r: number, s: number, t: number): V3 =>
      soma(
        soma(e.origem, vezes(e.eixo, s)),
        soma(vezes(e.u, Math.cos(t) * r), vezes(e.v, Math.sin(t) * r)),
      );
    // Normal de cada trecho no plano do meridiano: [componente radial, componente axial].
    const trechos = perfil.slice(1).map((b, i) => {
      const a = perfil[i];
      const dr = b[0] - a[0];
      const ds = b[1] - a[1];
      const m = Math.hypot(dr, ds) || 1;
      return [ds / m, -dr / m] as const;
    });
    const normalNoVertice = (i: number, trecho: number) => {
      if (!suave) return trechos[trecho];
      const antes = trechos[Math.max(0, i - 1)];
      const depois = trechos[Math.min(trechos.length - 1, i)];
      const r = antes[0] + depois[0];
      const s = antes[1] + depois[1];
      const m = Math.hypot(r, s) || 1;
      return [r / m, s / m] as const;
    };
    const normal = (nm: readonly [number, number], t: number): V3 =>
      unit(
        soma(
          vezes(e.eixo, nm[1]),
          soma(vezes(e.u, Math.cos(t) * nm[0]), vezes(e.v, Math.sin(t) * nm[0])),
        ),
      );
    for (let i = 0; i < trechos.length; i++) {
      const [ra, sa] = perfil[i];
      const [rb, sb] = perfil[i + 1];
      const na = normalNoVertice(i, i);
      const nb = normalNoVertice(i + 1, i);
      for (let j = 0; j < lados; j++) {
        const t0 = (j / lados) * Math.PI * 2;
        const t1 = ((j + 1) / lados) * Math.PI * 2;
        this.quad(
          [ponto(ra, sa, t0), ponto(ra, sa, t1), ponto(rb, sb, t1), ponto(rb, sb, t0)],
          [normal(na, t0), normal(na, t1), normal(nb, t1), normal(nb, t0)],
          k,
        );
      }
    }
  }

  /** Cano, barra ou degrau: cilindro fechado de `a` até `b`. */
  tubo(a: V3, b: V3, raio: number, k: Cor, lados = 8) {
    const { eixo, comprimento } = eixoEntre(a, b);
    this.torno(
      eixo,
      [
        [0, 0],
        [raio, 0],
        [raio, comprimento],
        [0, comprimento],
      ],
      lados,
      k,
    );
  }

  /** Disco ou flange em pé no chão (eixo Z) de z0 até z1. */
  cilindroZ(x: number, y: number, z0: number, z1: number, raio: number, k: Cor, lados = 24) {
    this.tubo([x, y, z0], [x, y, z1], raio, k, lados);
  }

  /** Caixa alinhada aos eixos, de `min` a `max`. */
  caixa(min: V3, max: V3, k: Cor) {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    this.plano([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], k);
    this.plano([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], k);
    this.plano([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], k);
    this.plano([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], k);
    this.plano([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], k);
    this.plano([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], k);
  }

  /** Corrimão em arco: tubos ligando os pontos em sequência. */
  polilinha(pontos: readonly V3[], raio: number, k: Cor) {
    for (let i = 1; i < pontos.length; i++) this.tubo(pontos[i - 1], pontos[i], raio, k, 6);
  }

  montar(): MalhaTanque {
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      colors: new Float32Array(this.c),
    };
  }
}

/**
 * Tanque aéreo horizontal (diâmetro 1), com o eixo no X, centrado na origem: tampos elípticos,
 * chapas soldadas, dois berços, bacia de contenção, boca de visita, respiro, escada e a bomba.
 */
export function malhaTanqueHorizontal(corpo: Rgb): MalhaTanque {
  const m = new Construtor();
  const R = 0.5;
  const h = PROFUNDIDADE_TAMPO;
  const costado = COMPRIMENTO_HORIZONTAL - 2 * h;
  const piso = 0.03;
  const zc = piso + 0.22 + R;
  const corpoCor = cor(corpo);
  const solda = tom(corpo, 0.72);
  const eixo: Eixo = {
    origem: [-costado / 2, 0, zc],
    eixo: [1, 0, 0],
    u: [0, 1, 0],
    v: [0, 0, 1],
  };

  // Tampos elípticos 2:1 e o costado (um trecho só: a luz corre lisa ao longo dele).
  const passos = 10;
  const tampoEsq: [number, number][] = [];
  const tampoDir: [number, number][] = [];
  for (let i = 0; i <= passos; i++) {
    const f = (i / passos) * (Math.PI / 2);
    tampoEsq.push([R * Math.sin(f), -h * Math.cos(f)]);
    tampoDir.push([R * Math.cos(f), costado + h * Math.sin(f)]);
  }
  m.torno(eixo, tampoEsq, 48, corpoCor, true);
  m.torno(eixo, [[R, 0], [R, costado]], 48, corpoCor);
  m.torno(eixo, tampoDir, 48, corpoCor, true);

  // Cordões de solda: emenda dos tampos e das três chapas do costado.
  for (const s of [0, costado / 3, (2 * costado) / 3, costado]) {
    const r = R * 1.008;
    m.torno(eixo, [[R, s - 0.007], [r, s - 0.007], [r, s + 0.007], [R, s + 0.007]], 48, solda);
  }

  // Berços de aço: chapa em pé recortada no raio do tanque, sobre a chapa de base.
  const meiaLargura = 0.42;
  for (const xs of [-costado * 0.32, costado * 0.32]) {
    const x0 = xs - 0.045;
    const x1 = xs + 0.045;
    const k = cor(ACO_ESCURO);
    const colunas = 12;
    for (let i = 0; i < colunas; i++) {
      const ya = -meiaLargura + (2 * meiaLargura * i) / colunas;
      const yb = -meiaLargura + (2 * meiaLargura * (i + 1)) / colunas;
      const za = zc - Math.sqrt(R * R - ya * ya);
      const zb = zc - Math.sqrt(R * R - yb * yb);
      m.plano([[x0, ya, piso], [x0, yb, piso], [x0, yb, zb], [x0, ya, za]], [-1, 0, 0], k);
      m.plano([[x1, ya, piso], [x1, ya, za], [x1, yb, zb], [x1, yb, piso]], [1, 0, 0], k);
      const nm = unit([0, -(ya + yb) / 2, zc - (za + zb) / 2]);
      m.plano([[x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za]], nm, k);
    }
    const zLado = zc - Math.sqrt(R * R - meiaLargura * meiaLargura);
    m.plano([[x0, -meiaLargura, piso], [x0, -meiaLargura, zLado], [x1, -meiaLargura, zLado], [x1, -meiaLargura, piso]], [0, -1, 0], k);
    m.plano([[x0, meiaLargura, piso], [x1, meiaLargura, piso], [x1, meiaLargura, zLado], [x0, meiaLargura, zLado]], [0, 1, 0], k);
    m.caixa([xs - 0.09, -meiaLargura - 0.04, piso], [xs + 0.09, meiaLargura + 0.04, piso + 0.02], k);
  }

  // Bacia de contenção: piso e mureta de concreto em volta.
  const bx = COMPRIMENTO_HORIZONTAL / 2 + 0.35;
  const by = R + 0.38;
  const parede = 0.06;
  const alturaMureta = 0.28;
  m.caixa([-bx - parede, -by - parede, 0], [bx + parede, by + parede, piso], cor(PISO_BACIA));
  const concreto = cor(CONCRETO);
  m.caixa([-bx - parede, -by - parede, 0], [bx + parede, -by, alturaMureta], concreto);
  m.caixa([-bx - parede, by, 0], [bx + parede, by + parede, alturaMureta], concreto);
  m.caixa([-bx - parede, -by, 0], [-bx, by, alturaMureta], concreto);
  m.caixa([bx, -by, 0], [bx + parede, by, alturaMureta], concreto);

  // Em cima: boca de visita com tampa, bocal de enchimento e respiro com pescoço de ganso.
  const topo = zc + R;
  const xVisita = -costado * 0.22;
  m.cilindroZ(xVisita, 0, topo - 0.03, topo + 0.07, 0.13, tom(corpo, 0.88), 28);
  m.cilindroZ(xVisita, 0, topo + 0.07, topo + 0.09, 0.155, cor(ACO_ESCURO), 28);
  m.cilindroZ(0.12, 0, topo - 0.02, topo + 0.08, 0.04, cor(ACO_ESCURO), 12);
  m.cilindroZ(0.12, 0, topo + 0.08, topo + 0.1, 0.055, cor(ACO_ESCURO), 12);
  const galv = cor(GALVANIZADO);
  const xRespiro = costado * 0.3;
  m.polilinha(
    [
      [xRespiro, 0, topo - 0.02],
      [xRespiro, 0, topo + 0.36],
      [xRespiro + 0.06, 0, topo + 0.4],
      [xRespiro + 0.12, 0, topo + 0.36],
      [xRespiro + 0.12, 0, topo + 0.3],
    ],
    0.022,
    galv,
  );

  // Escada de marinheiro encostada no costado, subindo até a boca de visita.
  const yEscada = -(R + 0.12);
  const zTopoEscada = topo + 0.22;
  for (const dx of [-0.13, 0.13]) {
    const x = xVisita + dx;
    m.tubo([x, yEscada, piso], [x, yEscada, zTopoEscada], 0.014, galv);
    m.tubo([x, yEscada, zTopoEscada], [x, -0.22, zTopoEscada], 0.014, galv);
    m.tubo([x, -0.22, zTopoEscada], [x, -0.22, zc + Math.sqrt(R * R - 0.22 * 0.22)], 0.014, galv);
    m.tubo([x, yEscada, zc - 0.05], [x, -R * 0.98, zc - 0.05], 0.01, galv);
  }
  for (let z = piso + 0.1; z < topo + 0.02; z += 0.085)
    m.tubo([xVisita - 0.13, yEscada, z], [xVisita + 0.13, yEscada, z], 0.009, galv);

  // Bomba abastecedora fora da bacia, na ilha de concreto, e o cano que sai do fundo do tanque.
  const xBomba = bx + parede + 0.3;
  m.caixa([xBomba - 0.2, -0.27, 0], [xBomba + 0.2, 0.27, 0.04], concreto);
  m.caixa([xBomba - 0.12, -0.16, 0.04], [xBomba + 0.12, 0.16, 0.58], cor(BRANCO_BOMBA));
  m.caixa([xBomba - 0.13, -0.17, 0.58], [xBomba + 0.13, 0.17, 0.63], corpoCor);
  m.caixa([xBomba + 0.12, -0.1, 0.36], [xBomba + 0.13, 0.1, 0.5], cor(VISOR));
  m.caixa([xBomba - 0.13, -0.1, 0.36], [xBomba - 0.12, 0.1, 0.5], cor(VISOR));
  m.polilinha(
    [
      [xBomba + 0.02, 0.16, 0.42],
      [xBomba + 0.02, 0.22, 0.34],
      [xBomba + 0.02, 0.22, 0.14],
      [xBomba + 0.02, 0.17, 0.1],
    ],
    0.014,
    cor(VISOR),
  );
  const xSaida = costado / 2 - 0.12;
  const zFundo = zc - R;
  m.polilinha(
    [
      [xSaida, 0.1, zFundo + 0.02],
      [xSaida, 0.1, 0.12],
      [xBomba - 0.12, 0.1, 0.12],
    ],
    0.02,
    cor(ACO_ESCURO),
  );
  m.cilindroZ(xSaida, 0.1, 0.16, 0.2, 0.04, cor(ACO_ESCURO), 12);

  return m.montar();
}

/**
 * Tanque vertical de usina (diâmetro 1), centrado na origem: base de concreto, costado em anéis,
 * cantoneira, teto cônico com respiro, guarda-corpo, escada com gaiola, boca de visita e bocal.
 */
export function malhaTanqueVertical(corpo: Rgb): MalhaTanque {
  const m = new Construtor();
  const R = 0.5;
  const base = 0.04;
  const topo = base + ALTURA_VERTICAL;
  const flecha = 0.11;
  const corpoCor = cor(corpo);
  const solda = tom(corpo, 0.72);
  const galv = cor(GALVANIZADO);
  const vertical: Eixo = {
    origem: [0, 0, 0],
    eixo: [0, 0, 1],
    u: [1, 0, 0],
    v: [0, 1, 0],
  };

  m.torno(vertical, [[0, 0], [R + 0.08, 0], [R + 0.08, base], [0, base]], 48, cor(CONCRETO));
  m.torno(vertical, [[R, base], [R, topo]], 56, corpoCor);
  const aneis = 5;
  for (let i = 1; i < aneis; i++) {
    const z = base + (ALTURA_VERTICAL * i) / aneis;
    const r = R * 1.006;
    m.torno(vertical, [[R, z - 0.006], [r, z - 0.006], [r, z + 0.006], [R, z + 0.006]], 56, solda);
  }
  // Cantoneira do topo e o teto cônico, um pouco mais claro (pega mais sol).
  const rc = R * 1.025;
  m.torno(vertical, [[R, topo - 0.025], [rc, topo - 0.025], [rc, topo + 0.01], [R, topo + 0.01]], 56, solda);
  m.torno(
    vertical,
    [
      [0, topo + 0.01],
      [rc, topo + 0.01],
      [0.07, topo + 0.01 + flecha],
      [0, topo + 0.012 + flecha],
    ],
    56,
    tom(corpo, 1.12),
  );
  const zPico = topo + 0.012 + flecha;
  m.cilindroZ(0, 0, zPico - 0.01, zPico + 0.07, 0.045, cor(ACO_ESCURO), 16);
  m.cilindroZ(0, 0, zPico + 0.07, zPico + 0.085, 0.075, cor(ACO_ESCURO), 16);

  // Guarda-corpo na borda do teto: montantes e dois corrimãos.
  const postes = 20;
  const rp = R - 0.02;
  const zTeto = (r: number) => topo + 0.01 + flecha * (1 - (r - 0.07) / (rc - 0.07));
  const z0 = zTeto(rp);
  const alto: V3[] = [];
  const meio: V3[] = [];
  for (let i = 0; i <= postes; i++) {
    const t = (i / postes) * Math.PI * 2;
    const x = Math.cos(t) * rp;
    const y = Math.sin(t) * rp;
    alto.push([x, y, z0 + 0.1]);
    meio.push([x, y, z0 + 0.05]);
    if (i < postes) m.tubo([x, y, z0], [x, y, z0 + 0.1], 0.007, galv, 6);
  }
  m.polilinha(alto, 0.008, galv);
  m.polilinha(meio, 0.006, galv);

  // Escada de marinheiro com gaiola, no lado sul (o que a câmera vê primeiro).
  const yEscada = -(R + 0.075);
  for (const x of [-0.06, 0.06]) {
    m.tubo([x, yEscada, base], [x, yEscada, z0 + 0.1], 0.01, galv);
    m.tubo([x, yEscada, z0 + 0.1], [x, -rp, z0 + 0.1], 0.01, galv);
    for (const z of [0.35, 0.9, topo - 0.05])
      m.tubo([x, yEscada, z], [x, -R, z], 0.007, galv, 6);
  }
  for (let z = base + 0.06; z < topo; z += 0.05)
    m.tubo([-0.06, yEscada, z], [0.06, yEscada, z], 0.006, galv, 6);
  const raioGaiola = 0.085;
  const arco = (z: number): V3[] => {
    const pontos: V3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = Math.PI + (i / 8) * Math.PI;
      pontos.push([Math.cos(t) * raioGaiola, yEscada + Math.sin(t) * raioGaiola, z]);
    }
    return pontos;
  };
  const zGaiola = 0.5;
  for (let z = zGaiola; z <= z0 + 0.1; z += 0.13) m.polilinha(arco(z), 0.006, galv);
  for (const t of [Math.PI * 1.15, Math.PI * 1.5, Math.PI * 1.85]) {
    const x = Math.cos(t) * raioGaiola;
    const y = yEscada + Math.sin(t) * raioGaiola;
    m.tubo([x, y, zGaiola], [x, y, z0 + 0.1], 0.005, galv, 6);
  }

  // Boca de visita no costado e o bocal de saída com flange e registro.
  const radial = (t: number, r: number, z: number): V3 => [Math.cos(t) * r, Math.sin(t) * r, z];
  const tVisita = Math.PI * 0.8;
  m.tubo(radial(tVisita, R - 0.02, 0.22), radial(tVisita, R + 0.05, 0.22), 0.08, tom(corpo, 0.88), 24);
  m.tubo(radial(tVisita, R + 0.05, 0.22), radial(tVisita, R + 0.07, 0.22), 0.1, cor(ACO_ESCURO), 24);
  const tSaida = -Math.PI * 0.2;
  m.tubo(radial(tSaida, R - 0.02, 0.13), radial(tSaida, R + 0.22, 0.13), 0.035, cor(ACO_ESCURO), 12);
  m.tubo(radial(tSaida, R + 0.08, 0.13), radial(tSaida, R + 0.1, 0.13), 0.06, cor(ACO_ESCURO), 16);
  m.tubo(radial(tSaida, R + 0.14, 0.13), radial(tSaida, R + 0.14, 0.26), 0.012, cor(ACO_ESCURO), 6);
  m.tubo(radial(tSaida, R + 0.22, 0.13), radial(tSaida, R + 0.22, base), 0.035, cor(ACO_ESCURO), 12);

  return m.montar();
}
