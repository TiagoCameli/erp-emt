import { describe, expect, it } from "vitest";

import { chaveNomeUnidade, haRepetido, padraoIlikeCandidatos } from "./duplicidade";

const T = "unidade-t";
const M3 = "unidade-m3";
const existentes = [
  { id: "a", nome: "BRITA 0", unidade_id: T },
  { id: "b", nome: "BRITA 0", unidade_id: M3 },
];

describe("haRepetido", () => {
  it("mesmo nome em unidade diferente não é repetido", () => {
    expect(haRepetido([existentes[0]!], "BRITA 0", M3)).toBe(false);
  });

  it("mesmo nome e mesma unidade é repetido, sem caixa e sem espaço sobrando", () => {
    expect(haRepetido(existentes, "brita  0 ", T)).toBe(true);
  });

  it("editar o próprio insumo sem trocar nome nem unidade não acusa", () => {
    expect(haRepetido(existentes, "BRITA 0", T, "a")).toBe(false);
  });

  it("editar outro insumo para o nome e a unidade de um existente acusa", () => {
    expect(haRepetido(existentes, "BRITA 0", T, "b")).toBe(true);
  });
});

describe("chaveNomeUnidade", () => {
  it("separa por unidade", () => {
    expect(chaveNomeUnidade("BRITA 0", T)).not.toBe(chaveNomeUnidade("BRITA 0", M3));
  });
});

describe("padraoIlikeCandidatos", () => {
  it("escapa os curingas e troca espaço por %", () => {
    expect(padraoIlikeCandidatos(" 50%  _x\\ ")).toBe("50\\%%\\_x\\\\");
    expect(padraoIlikeCandidatos("BRITA  0")).toBe("BRITA%0");
  });
});
