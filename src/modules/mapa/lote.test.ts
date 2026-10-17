import { describe, expect, it } from "vitest";

import { distanciaM } from "@/modules/mapa/geo";
import {
  destinoDaPessoaNoLote,
  pontosDoLote,
  rotuloDoLote,
} from "@/modules/mapa/lote";
import type { Posicao } from "@/modules/mapa/tipos";

const P: Posicao = [-72.7, -7.6];

describe("pontosDoLote", () => {
  it("dá um ponto para cada item, sem dois no mesmo lugar", () => {
    const pontos = pontosDoLote(P, 5, []);
    expect(pontos).toHaveLength(5);
    expect(pontos[0]).toEqual(P);
    for (let i = 0; i < pontos.length; i++)
      for (let j = i + 1; j < pontos.length; j++)
        expect(distanciaM(pontos[i]!, pontos[j]!)).toBeGreaterThan(5);
  });

  it("desvia de quem já está no lugar", () => {
    const [p] = pontosDoLote(P, 1, [P]);
    expect(distanciaM(p!, P)).toBeGreaterThan(5);
  });
});

describe("destinoDaPessoaNoLote", () => {
  const para: Posicao = [-72.71, -7.61];

  it("local entra como localidade, com o ponto e a obra", () => {
    expect(destinoDaPessoaNoLote("local:l1", para, "o1")).toEqual({
      obra_id: "o1",
      localidade_id: "l1",
      lng: -72.71,
      lat: -7.61,
    });
  });

  it("área entra como área", () => {
    expect(destinoDaPessoaNoLote("area:a1", para, null)).toEqual({
      area_id: "a1",
      lng: -72.71,
      lat: -7.61,
    });
  });

  it("obra só dá o ponto e a obra escolhida", () => {
    expect(destinoDaPessoaNoLote("obra:o9", para, "o2")).toEqual({
      obra_id: "o2",
      lng: -72.71,
      lat: -7.61,
    });
  });
});

describe("rotuloDoLote", () => {
  it("conta máquinas e pessoas", () => {
    expect(rotuloDoLote(3, 2)).toBe("3 equipamentos e 2 pessoas");
    expect(rotuloDoLote(1, 0)).toBe("1 equipamento");
    expect(rotuloDoLote(0, 1)).toBe("1 pessoa");
  });
});
