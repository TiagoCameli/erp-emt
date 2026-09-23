import { describe, expect, it } from "vitest";

import { linhaDoTempo, percentualDoNivel, type MovimentoTanque } from "@/modules/combustivel/tanques/calculo";

describe("percentualDoNivel", () => {
  it("sem capacidade não tem régua", () => {
    expect(percentualDoNivel(100, 0)).toBeNull();
  });

  it("proporção da capacidade, travada em 100", () => {
    expect(percentualDoNivel(2500, 10000)).toBe(25);
    expect(percentualDoNivel(12000, 10000)).toBe(100);
    expect(percentualDoNivel(-1, 10000)).toBe(0);
  });
});

function mov(troca: Partial<MovimentoTanque> & Pick<MovimentoTanque, "id" | "tipo">): MovimentoTanque {
  return {
    dataHora: "2026-09-20T12:00:00Z",
    criadoEm: "2026-09-20T12:00:00Z",
    litros: 100,
    descricao: "",
    ...troca,
  };
}

describe("linhaDoTempo", () => {
  it("ordena por data e corre o nível com o sinal de cada tipo", () => {
    const linha = linhaDoTempo([
      mov({ id: "3", tipo: "esvaziamento", dataHora: "2026-09-22T12:00:00Z", litros: 50 }),
      mov({ id: "1", tipo: "entrada", dataHora: "2026-09-20T12:00:00Z", litros: 1000 }),
      mov({ id: "2", tipo: "abastecimento", dataHora: "2026-09-21T12:00:00Z", litros: 200.25 }),
      mov({ id: "4", tipo: "transferencia_enviada", dataHora: "2026-09-23T12:00:00Z", litros: 100 }),
      mov({ id: "5", tipo: "transferencia_recebida", dataHora: "2026-09-24T12:00:00Z", litros: 10.1 }),
    ]);
    expect(linha.map((m) => m.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(linha.map((m) => m.nivelDepois)).toEqual([1000, 799.75, 749.75, 649.75, 659.85]);
    expect(linha[1]!.delta).toBe(-200.25);
  });

  it("no mesmo instante a saída vem antes da entrada, como na trava do banco", () => {
    // Linha de controle: a entrada foi inserida ANTES, e mesmo assim fica depois.
    const linha = linhaDoTempo([
      mov({ id: "e", tipo: "entrada", criadoEm: "2026-09-20T11:00:00Z", litros: 500 }),
      mov({ id: "s", tipo: "abastecimento", criadoEm: "2026-09-20T11:30:00Z", litros: 100 }),
    ]);
    expect(linha.map((m) => m.id)).toEqual(["s", "e"]);
    expect(linha.map((m) => m.nivelDepois)).toEqual([-100, 400]);
  });

  it("soma sem lixo de ponto flutuante", () => {
    const linha = linhaDoTempo([
      mov({ id: "a", tipo: "entrada", dataHora: "2026-09-20T10:00:00Z", litros: 0.1 }),
      mov({ id: "b", tipo: "entrada", dataHora: "2026-09-20T11:00:00Z", litros: 0.2 }),
    ]);
    expect(linha[1]!.nivelDepois).toBe(0.3);
  });
});
