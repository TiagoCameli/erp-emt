import { describe, expect, it } from "vitest";

import {
  paraNumero,
  subtotalItem,
  totalOrdemCompra,
} from "@/modules/compras/ordens/calculo";

describe("paraNumero (OC)", () => {
  it("converte decimal com vírgula", () => {
    expect(paraNumero("12,5")).toBe(12.5);
  });

  it("trata ponto como separador de milhar", () => {
    expect(paraNumero("1.234,56")).toBe(1234.56);
  });

  it("aceita ponto como decimal quando não há vírgula", () => {
    expect(paraNumero("1234.56")).toBe(123456);
  });

  it("vazio vira 0", () => {
    expect(paraNumero("")).toBe(0);
    expect(paraNumero("   ")).toBe(0);
  });

  it("inválido vira 0, nunca NaN", () => {
    expect(paraNumero("abc")).toBe(0);
  });
});

describe("subtotalItem", () => {
  it("multiplica quantidade por preço", () => {
    expect(subtotalItem(5, 12.5)).toBe(62.5);
  });

  it("subtotal de quantidade zero é zero", () => {
    expect(subtotalItem(0, 99)).toBe(0);
  });
});

describe("totalOrdemCompra", () => {
  it("soma os subtotais dos itens", () => {
    const total = totalOrdemCompra([
      { quantidade: 5, precoUnitario: 12.5 },
      { quantidade: 2, precoUnitario: 100 },
    ]);
    expect(total).toBe(262.5);
  });

  it("lista vazia soma zero", () => {
    expect(totalOrdemCompra([])).toBe(0);
  });

  it("ignora item com preço zero sem quebrar o total", () => {
    const total = totalOrdemCompra([
      { quantidade: 3, precoUnitario: 0 },
      { quantidade: 4, precoUnitario: 10 },
    ]);
    expect(total).toBe(40);
  });
});
