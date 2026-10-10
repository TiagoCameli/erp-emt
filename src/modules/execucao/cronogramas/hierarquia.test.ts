import { describe, expect, it } from "vitest";

import {
  avancar,
  moverAbaixo,
  moverAcima,
  ordenarArvore,
  proximaLinha,
  recuar,
  type LinhaArvore,
} from "@/modules/execucao/cronogramas/hierarquia";

// 1 (resumo) > 1.1, 1.2 ; 2 ; 3
const base: LinhaArvore[] = [
  { id: "r1", codigo: "1", paiId: null, tipo: "resumo", ordem: 1 },
  { id: "a11", codigo: "1.1", paiId: "r1", tipo: "atividade", ordem: 1 },
  { id: "a12", codigo: "1.2", paiId: "r1", tipo: "atividade", ordem: 2 },
  { id: "a2", codigo: "2", paiId: null, tipo: "atividade", ordem: 2 },
  { id: "a3", codigo: "3", paiId: null, tipo: "atividade", ordem: 3 },
];

describe("ordenarArvore", () => {
  it("pai antes das filhas, irmãs pela ordem, mesmo embaralhado", () => {
    const embaralhado = [base[3], base[2], base[4], base[0], base[1]];
    expect(ordenarArvore(embaralhado).map((l) => l.codigo)).toEqual(["1", "1.1", "1.2", "2", "3"]);
  });
});

describe("recuar", () => {
  it("3 vira filha de 2, e 2 vira resumo", () => {
    expect(recuar(base, "a3")).toEqual([
      { id: "a2", tipo: "resumo" },
      { id: "a3", pai_codigo: "2", ordem: 1 },
    ]);
  });
  it("primeira filha não tem irmã acima: nada muda", () => {
    expect(recuar(base, "a11")).toEqual([]);
  });
  it("recuar para dentro de quem já é resumo vai para o fim das filhas dele", () => {
    expect(recuar(base, "a2")).toEqual([{ id: "a2", pai_codigo: "1", ordem: 3 }]);
  });
});

describe("avancar", () => {
  it("1.2 sai do resumo e fica logo depois dele; as irmãs de baixo da raiz descem uma posição", () => {
    expect(avancar(base, "a12")).toEqual([
      { id: "a12", pai_codigo: "", ordem: 2 },
      { id: "a2", ordem: 3 },
      { id: "a3", ordem: 4 },
    ]);
  });
  it("linha na raiz: nada muda", () => {
    expect(avancar(base, "a2")).toEqual([]);
  });
});

describe("mover", () => {
  it("troca a ordem com a irmã de cima e de baixo", () => {
    expect(moverAcima(base, "a12")).toEqual([{ id: "a12", ordem: 1 }, { id: "a11", ordem: 2 }]);
    expect(moverAbaixo(base, "a2")).toEqual([{ id: "a2", ordem: 3 }, { id: "a3", ordem: 2 }]);
    expect(moverAcima(base, "a11")).toEqual([]);
  });
});

describe("proximaLinha", () => {
  it("abaixo de 1.1: código 1.3 (o próximo livre), dentro de 1, ordem 2, e 1.2 desce", () => {
    expect(proximaLinha(base, "a11")).toEqual({
      codigo: "1.3",
      pai_codigo: "1",
      ordem: 2,
      mudancas: [{ id: "a12", ordem: 3 }],
    });
  });
  it("sem referência: no fim da raiz", () => {
    expect(proximaLinha(base, null)).toEqual({ codigo: "4", pai_codigo: "", ordem: 4, mudancas: [] });
  });
  it("pula código já usado por qualquer linha: depois de recuar 3 para dentro de 2, a nova raiz não repete 3", () => {
    const depois: LinhaArvore[] = base.map((l) =>
      l.id === "a2" ? { ...l, tipo: "resumo" } : l.id === "a3" ? { ...l, paiId: "a2", ordem: 1 } : l,
    );
    expect(proximaLinha(depois, null)).toEqual({ codigo: "4", pai_codigo: "", ordem: 3, mudancas: [] });
  });
  it("cronograma vazio", () => {
    expect(proximaLinha([], null)).toEqual({ codigo: "1", pai_codigo: "", ordem: 1, mudancas: [] });
  });
});
