import { describe, expect, it } from "vitest";

import { chaveDoSaldo, resumoDoLocal, saldosAtuais, type MovimentoParaSaldo } from "./calculo";

function mov(parcial: Partial<MovimentoParaSaldo>): MovimentoParaSaldo {
  return {
    origem: "estoque",
    localTipo: "pilha",
    localId: "p1",
    localNome: "Brita 1 - Canteiro",
    insumoId: "brita1",
    insumoNome: "BRITA 1",
    unidade: "t",
    data: "2026-10-23",
    saldo: 0,
    ...parcial,
  };
}

describe("chaveDoSaldo", () => {
  it("separa insumos no mesmo depósito", () => {
    expect(chaveDoSaldo(mov({ insumoId: "a" }))).not.toBe(chaveDoSaldo(mov({ insumoId: "b" })));
  });

  it("junta o tanque de combustível num saldo só, qualquer que seja o combustível", () => {
    const diesel = mov({
      origem: "combustivel",
      localId: "t1",
      insumoId: "s10",
    });
    const vazio = mov({ origem: "combustivel", localId: "t1", insumoId: null });
    expect(chaveDoSaldo(diesel)).toBe(chaveDoSaldo(vazio));
  });
});

describe("saldosAtuais", () => {
  it("pega o saldo do movimento mais novo de cada local e conta os movimentos", () => {
    const linhas = saldosAtuais([
      mov({ saldo: 405.3, data: "2026-10-23" }),
      mov({ saldo: 435.3, data: "2026-10-23" }),
      mov({ saldo: 388.3, data: "2026-10-16" }),
      mov({
        localId: "p2",
        localNome: "Brita 1 - Colorado",
        saldo: 740,
        data: "2026-10-23",
      }),
    ]);
    expect(linhas).toEqual([
      expect.objectContaining({
        localId: "p1",
        saldo: 405.3,
        movimentos: 3,
        ultimoMovimento: "2026-10-23",
      }),
      expect.objectContaining({ localId: "p2", saldo: 740, movimentos: 1 }),
    ]);
  });

  it("mostra o tanque esvaziado como vazio e o com nível pelo combustível do último movimento que tem", () => {
    const linhas = saldosAtuais([
      mov({
        origem: "combustivel",
        localTipo: "tanque",
        localId: "t1",
        localNome: "Canteiro 1",
        insumoId: null,
        insumoNome: null,
        saldo: 0,
      }),
      mov({
        origem: "combustivel",
        localTipo: "tanque",
        localId: "t1",
        localNome: "Canteiro 1",
        insumoNome: "DIESEL S10",
        saldo: 300,
      }),
      mov({
        origem: "combustivel",
        localTipo: "tanque",
        localId: "t2",
        localNome: "Canteiro 2",
        insumoId: null,
        insumoNome: null,
        saldo: 120,
      }),
      mov({
        origem: "combustivel",
        localTipo: "tanque",
        localId: "t2",
        localNome: "Canteiro 2",
        insumoNome: "DIESEL S500",
        saldo: 500,
      }),
    ]);
    expect(linhas.map((l) => [l.localNome, l.insumoNome, l.saldo])).toEqual([
      ["Canteiro 1", "Vazio", 0],
      ["Canteiro 2", "DIESEL S500", 120],
    ]);
  });
});

describe("resumoDoLocal", () => {
  it("soma o que entrou e o que saiu, com a saída positiva", () => {
    expect(resumoDoLocal([{ quantidade: 47 }, { quantidade: -30 }, { quantidade: 60 }, { quantidade: -2.5 }])).toEqual({
      entrou: 107,
      saiu: 32.5,
      movimentos: 4,
    });
  });
});
