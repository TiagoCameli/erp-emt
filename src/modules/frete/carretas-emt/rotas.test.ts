import { describe, expect, it } from "vitest";

import type { DadosCarretas, FreteMes } from "./calculo";
import { base } from "./fixture-carretas";
import { linkDosFretes, montarAlertas, montarRotas } from "./rotas";

const BRITAM = { id: "britam", nome: "Pedreira Britam", latitude: -9.818788, longitude: -66.216733 };
const GREGORIO = { id: "gregorio", nome: "Usina Gregorio", latitude: -7.952232, longitude: -71.491783 };
const COLORADO = { id: "colorado", nome: "Colorado", latitude: -7.620353, longitude: -72.698779 };

function frete(f: Partial<FreteMes>): FreteMes {
  return { placa: "SQS7E01", mes: "2026-09", tipo: "material", viagens: 1, toneladas: 60, km: 717, valor: 15000, comChegada: 1, dias: 2, diasMax: 2, ...f };
}

function dados(fretes: FreteMes[]): DadosCarretas {
  return {
    ...base(),
    fretes,
    localidades: [BRITAM, GREGORIO, COLORADO],
    tracados: [
      { origemId: "britam", destinoId: "gregorio", kmMapa: 696.9, horasMapa: 10.7, pontos: [[-9.8, -66.2], [-8, -70], [-7.95, -71.49]] },
      { origemId: "britam", destinoId: "colorado", kmMapa: 843.4, horasMapa: 12.9, pontos: [[-9.8, -66.2], [-7.62, -72.7]] },
    ],
  };
}

const FILTRO = { de: "2026-08", ate: "2026-09", placa: "" };

const ALERTA_KM = {
  regra: "R1" as const, freteId: "f-990a", data: "2026-08-10", mes: "2026-08", tipo: "material", placa: "SQS7E01",
  origemId: "britam", destinoId: "gregorio", km: 990, kmMapa: 696.9, dias: 2, mediana: 2,
};

describe("montarRotas", () => {
  const fretes = [
    frete({ origemId: "britam", destinoId: "gregorio", viagens: 3, toneladas: 180, km: 2130, kmMin: 710, kmMax: 710, valor: 45000, comChegada: 3, dias: 7, diasMax: 3 }),
    frete({ origemId: "britam", destinoId: "gregorio", placa: "SQU9C94", mes: "2026-08", viagens: 1, km: 990, kmMin: 990, kmMax: 990, valor: 16000.1, comChegada: 1, dias: 51, diasMax: 51 }),
    frete({ origemId: "britam", destinoId: "colorado", tipo: "transferencia", viagens: 2, km: 290, kmMin: 145, kmMax: 145, valor: 7511, comChegada: 1, dias: 0, diasMax: 0 }),
    frete({ origemId: "gregorio", destinoId: "colorado", tipo: "transferencia", mes: "2026-07", valor: 999 }),
  ];

  it("soma por rota, ordena pela produção e recorta o período", () => {
    const rotas = montarRotas(dados(fretes), FILTRO);
    expect(rotas.map((r) => r.chave)).toEqual(["britam_gregorio", "britam_colorado"]);
    const g = rotas[0]!;
    expect(g.viagens).toBe(4);
    expect(g.producao).toBe(61000.1);
    expect(g.kmMedio).toBe(780);
    expect(g.kmMin).toBe(710);
    expect(g.kmMax).toBe(990);
    expect(g.kmMapa).toBe(696.9);
    expect(g.diasMedio).toBe(58 / 4);
    expect(g.diasMax).toBe(51);
    expect(g.producaoPorViagem).toBeCloseTo(15250.025, 3);
    expect(g.tracado).toHaveLength(3);
  });

  it("conta os fretes sem chegada e marca a rota com alerta", () => {
    const comAlerta = { ...dados(fretes), alertas: [ALERTA_KM] };
    const [g, c] = montarRotas(comAlerta, FILTRO);
    expect(c!.semChegada).toBe(1);
    expect(c!.diasMedio).toBe(0);
    expect(g!.temAlerta).toBe(true);
    expect(c!.temAlerta).toBe(false);
  });

  it("segue os filtros de carreta e de tipo", () => {
    expect(montarRotas(dados(fretes), { ...FILTRO, placa: "squ 9c94" }).map((r) => [r.chave, r.viagens])).toEqual([["britam_gregorio", 1]]);
    expect(montarRotas(dados(fretes), { ...FILTRO, tipo: "transferencia" }).map((r) => r.chave)).toEqual(["britam_colorado"]);
  });

  it("rota sem traçado volta sem traçado, e local sem cadastro não derruba", () => {
    const rotas = montarRotas(dados([frete({ origemId: "gregorio", destinoId: "x" })]), FILTRO);
    expect(rotas[0]?.tracado).toBeNull();
    expect(rotas[0]?.kmMapa).toBeNull();
    expect(rotas[0]?.destino.nome).toBe("Local sem cadastro");
  });
});

describe("montarAlertas", () => {
  const alertas = [
    ALERTA_KM,
    { ...ALERTA_KM, freteId: "f-990b" },
    { ...ALERTA_KM, regra: "R2" as const, freteId: "f-51", data: "2026-09-01", mes: "2026-09", km: 710, dias: 51 },
    // Fora do período.
    { ...ALERTA_KM, freteId: "f-velho", mes: "2025-10", data: "2025-10-30" },
  ];
  const base = { ...dados([]), alertas };

  it("agrupa por rota e regra, com os fretes e a mensagem", () => {
    const lista = montarAlertas(base, FILTRO);
    expect(lista.map((a) => [a.regra, a.freteIds])).toEqual([
      ["R1", ["f-990a", "f-990b"]],
      ["R2", ["f-51"]],
    ]);
    expect(lista[0]!.mensagem).toBe("2 fretes com km lançado longe da estrada (990 km; a estrada tem 697 km), em 10/08/2026");
    expect(lista[1]!.mensagem).toContain("1 frete com viagem longa demais (51 dias");
    expect(lista[0]!.origemNome).toBe("Pedreira Britam");
  });

  it("segue a rota, a carreta e o tipo escolhidos", () => {
    expect(montarAlertas(base, { ...FILTRO, rota: "britam_colorado" })).toEqual([]);
    expect(montarAlertas(base, { ...FILTRO, rota: "britam_gregorio" })).toHaveLength(2);
    expect(montarAlertas(base, { ...FILTRO, placa: "SQU9C94" })).toEqual([]);
    expect(montarAlertas(base, { ...FILTRO, tipo: "transferencia" })).toEqual([]);
  });

  it("leva para a aba Fretes só com os fretes do alerta", () => {
    expect(linkDosFretes(["a", "b"])).toBe("/frete/fretes?fretes=a,b");
  });
});
