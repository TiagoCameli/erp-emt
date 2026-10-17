import { describe, expect, it } from "vitest";

import {
  ALTURA_VERTICAL,
  COMPRIMENTO_HORIZONTAL,
  malhaTanqueHorizontal,
  malhaTanqueVertical,
  type MalhaTanque,
} from "@/modules/mapa/malha-tanque";
import { COR_COMBUSTIVEL, COR_MATERIAL } from "@/modules/mapa/objetos";

function caixaDe(m: MalhaTanque) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], m.positions[i + k]);
      max[k] = Math.max(max[k], m.positions[i + k]);
    }
  return { min, max };
}

function conferirMalha(m: MalhaTanque) {
  // Triângulos inteiros, e normal, cor e posição para cada vértice.
  expect(m.positions.length % 9).toBe(0);
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.colors.length).toBe(m.positions.length);
  for (let i = 0; i < m.normals.length; i += 3) {
    const n = Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]);
    expect(n).toBeCloseTo(1, 4);
  }
  for (const c of m.colors) {
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  }
  for (const p of m.positions) expect(Number.isFinite(p)).toBe(true);
}

/** Quantos vértices levam exatamente esta cor (0 a 255). */
function verticesDaCor(m: MalhaTanque, cor: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < m.colors.length; i += 3)
    if (
      Math.abs(m.colors[i] - cor[0] / 255) < 1e-6 &&
      Math.abs(m.colors[i + 1] - cor[1] / 255) < 1e-6 &&
      Math.abs(m.colors[i + 2] - cor[2] / 255) < 1e-6
    )
      n++;
  return n;
}

describe("malha do tanque deitado", () => {
  const m = malhaTanqueHorizontal(COR_COMBUSTIVEL);

  // Um expect por vértice: no runner do CI passou de 5s (17/10/2026).
  it("é uma malha válida", () => conferirMalha(m), 30_000);

  it("apoia no chão, centrada, com o eixo no X e a bomba fora da bacia", () => {
    const { min, max } = caixaDe(m);
    expect(min[2]).toBeCloseTo(0, 6);
    // o tanque tem 2,8 diâmetros; bacia e bomba passam disso, mas pouco
    expect(max[0] - min[0]).toBeGreaterThan(COMPRIMENTO_HORIZONTAL);
    expect(max[0] - min[0]).toBeLessThan(COMPRIMENTO_HORIZONTAL + 1.6);
    expect(max[1] - min[1]).toBeLessThan(2);
    // berço + diâmetro + boca de visita/respiro: o topo fica entre 1,25 e 1,8 diâmetro
    expect(max[2]).toBeGreaterThan(1.25);
    expect(max[2]).toBeLessThan(1.8);
  });

  it("o costado leva a cor do conteúdo e o resto não", () => {
    const corpo = verticesDaCor(m, COR_COMBUSTIVEL);
    expect(corpo).toBeGreaterThan(0);
    expect(corpo).toBeLessThan(m.colors.length / 3);
  });
});

describe("malha do tanque em pé", () => {
  const m = malhaTanqueVertical(COR_MATERIAL);

  // Um expect por vértice: no runner do CI passou de 5s (17/10/2026).
  it("é uma malha válida", () => conferirMalha(m), 30_000);

  it("apoia no chão, com o costado de 1,5 diâmetro e o teto por cima", () => {
    const { min, max } = caixaDe(m);
    expect(min[2]).toBeCloseTo(0, 6);
    expect(max[2]).toBeGreaterThan(ALTURA_VERTICAL + 0.1);
    expect(max[2]).toBeLessThan(ALTURA_VERTICAL + 0.35);
    // a base de concreto e a escada passam pouco do diâmetro
    expect(max[0] - min[0]).toBeLessThan(1.5);
    expect(verticesDaCor(m, COR_MATERIAL)).toBeGreaterThan(0);
  });
});
