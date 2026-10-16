// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  formatarDistancia,
  lerRotasOsm,
  menorRota,
} from "@/modules/mapa/components/rota-estrada";
import type { Posicao } from "@/modules/mapa/tipos";

const linha: Posicao[] = [
  [-72.7, -7.6],
  [-72.6, -7.6],
];

describe("ferramenta Rota: a menor distância pela estrada", () => {
  it("fica com a mais curta, não com a primeira (o roteador põe a mais rápida antes)", () => {
    const rapida = { caminho: linha, metros: 132_400 };
    const curta = { caminho: linha, metros: 118_900 };
    expect(menorRota([rapida, curta])).toBe(curta);
    // Controle: com uma só, é ela.
    expect(menorRota([rapida])).toBe(rapida);
  });

  it("ignora alternativa sem caminho ou sem metros; nada válido dá null", () => {
    const boa = { caminho: linha, metros: 5000 };
    expect(
      menorRota([
        { caminho: [], metros: 10 },
        { caminho: linha, metros: 0 },
        { caminho: linha, metros: Number.NaN },
        boa,
      ]),
    ).toBe(boa);
    expect(menorRota([{ caminho: [linha[0]], metros: 10 }])).toBeNull();
    expect(menorRota([])).toBeNull();
  });

  it("formata em km pt-BR: duas casas abaixo de 10 km, uma acima", () => {
    expect(formatarDistancia(118_940)).toBe("118,9 km");
    expect(formatarDistancia(1_234_560)).toBe("1.234,6 km");
    expect(formatarDistancia(3_456)).toBe("3,46 km");
  });

  it("lê as alternativas do OSRM (distance em metros, linha em GeoJSON)", () => {
    const rotas = lerRotasOsm({
      code: "Ok",
      routes: [
        { distance: 2100.5, geometry: { coordinates: [[-72.7, -7.6], [-72.69, -7.6]] } },
        { distance: 1900, geometry: { coordinates: [[-72.7, -7.6], "lixo", [-72.68, -7.61]] } },
      ],
    });
    expect(rotas).toHaveLength(2);
    expect(rotas[1].caminho).toEqual([
      [-72.7, -7.6],
      [-72.68, -7.61],
    ]);
    expect(menorRota(rotas)?.metros).toBe(1900);
    expect(lerRotasOsm({ code: "NoRoute", routes: [] })).toEqual([]);
    expect(lerRotasOsm(null)).toEqual([]);
  });
});
