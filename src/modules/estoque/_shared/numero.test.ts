import { describe, expect, it } from "vitest";

import {
  ateCasas,
  custoUnitarioValido,
  numeroNaoNegativo,
  numeroPositivo,
  paraNumero,
  quantidadeValida,
} from "@/modules/estoque/_shared/numero";

describe("paraNumero", () => {
  it("converte string pt-BR com milhar e decimal", () => {
    expect(paraNumero("1.234,567")).toBe(1234.567);
  });

  it("converte inteiro simples", () => {
    expect(paraNumero("42")).toBe(42);
  });

  it("converte decimal sem milhar", () => {
    expect(paraNumero("0,5")).toBe(0.5);
  });

  it("retorna NaN para string vazia", () => {
    expect(Number.isNaN(paraNumero(""))).toBe(true);
    expect(Number.isNaN(paraNumero("   "))).toBe(true);
  });

  it("retorna NaN para texto não numérico", () => {
    expect(Number.isNaN(paraNumero("abc"))).toBe(true);
  });
});

describe("numeroPositivo", () => {
  it("aceita maior que zero", () => {
    expect(numeroPositivo("10")).toBe(true);
    expect(numeroPositivo("0,001")).toBe(true);
  });

  it("recusa zero, negativo e vazio", () => {
    expect(numeroPositivo("0")).toBe(false);
    expect(numeroPositivo("-5")).toBe(false);
    expect(numeroPositivo("")).toBe(false);
  });
});

describe("numeroNaoNegativo", () => {
  it("aceita zero e positivo", () => {
    expect(numeroNaoNegativo("0")).toBe(true);
    expect(numeroNaoNegativo("3,5")).toBe(true);
  });

  it("recusa negativo e vazio", () => {
    expect(numeroNaoNegativo("-0,01")).toBe(false);
    expect(numeroNaoNegativo("")).toBe(false);
  });
});

describe("ateCasas", () => {
  it("valida número dentro do limite de casas", () => {
    expect(ateCasas(1.234, 3)).toBe(true);
    expect(ateCasas(1.2, 3)).toBe(true);
    expect(ateCasas(5, 3)).toBe(true);
  });

  it("recusa número com casas a mais", () => {
    expect(ateCasas(1.2345, 3)).toBe(false);
  });
});

describe("quantidadeValida (NUMERIC 14,3)", () => {
  it("aceita até 3 casas e dentro do teto", () => {
    expect(quantidadeValida(123.456)).toBe(true);
    expect(quantidadeValida(0)).toBe(true);
  });

  it("recusa 4 casas, negativo e acima do teto", () => {
    expect(quantidadeValida(1.2345)).toBe(false);
    expect(quantidadeValida(-1)).toBe(false);
    expect(quantidadeValida(1e12)).toBe(false);
  });
});

describe("custoUnitarioValido (NUMERIC 14,4)", () => {
  it("aceita até 4 casas", () => {
    expect(custoUnitarioValido(12.3456)).toBe(true);
    expect(custoUnitarioValido(0)).toBe(true);
  });

  it("recusa 5 casas, negativo e acima do teto", () => {
    expect(custoUnitarioValido(1.23456)).toBe(false);
    expect(custoUnitarioValido(-0.01)).toBe(false);
    expect(custoUnitarioValido(1e11)).toBe(false);
  });
});
