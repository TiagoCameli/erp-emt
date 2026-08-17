import { describe, expect, it } from "vitest";

import {
  SEM_AJUSTES,
  paraNumero,
  subtotalItem,
  temAjuste,
  totalComAjustes,
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

describe("temAjuste", () => {
  it("ordem sem ajuste nenhum", () => {
    expect(temAjuste(SEM_AJUSTES)).toBe(false);
  });

  it("um frete de centavos já conta", () => {
    expect(temAjuste({ ...SEM_AJUSTES, frete: 0.01 })).toBe(true);
  });

  it("desconto sozinho conta", () => {
    expect(temAjuste({ ...SEM_AJUSTES, desconto: 3835.95 })).toBe(true);
  });
});

describe("totalComAjustes", () => {
  it("sem ajuste, é a soma dos itens", () => {
    const itens = [{ quantidade: 5, precoUnitario: 12.5 }];
    expect(totalComAjustes(itens, SEM_AJUSTES)).toBe(62.5);
  });

  it("frete e imposto somam, desconto subtrai", () => {
    const itens = [{ quantidade: 1, precoUnitario: 1000 }];
    const total = totalComAjustes(itens, {
      frete: 50,
      outrasDespesas: 10,
      impostos: 5,
      desconto: 100,
    });
    expect(total).toBe(965);
  });

  // Os três casos abaixo são ordens reais do Mais Controle, e cada um pega um
  // jeito diferente de a conta sair errada.

  it("ordem 2592: sem o desconto, a prévia mentiria R$ 3.835,95", () => {
    const itens = [
      { quantidade: 466.2, precoUnitario: 101.65 },
      { quantidade: 421.1, precoUnitario: 106.73 },
      { quantidade: 94.3, precoUnitario: 121.98 },
    ];
    expect(totalOrdemCompra(itens)).toBeCloseTo(103835.95, 2);
    expect(
      totalComAjustes(itens, { ...SEM_AJUSTES, desconto: 3835.95 }),
    ).toBe(100000);
  });

  it("ordem 2607: arredonda uma vez só, no fim", () => {
    // 1140,34 x 6,5770 = 7.500,01618 e 390,95 x 6,3947 = 2.500,0079650.
    // Arredondando item a item daria 7.500,02 + 2.500,01 - 0,02 = 10.000,01.
    const itens = [
      { quantidade: 1140.34, precoUnitario: 6.577 },
      { quantidade: 390.95, precoUnitario: 6.3947 },
    ];
    expect(totalComAjustes(itens, { ...SEM_AJUSTES, desconto: 0.02 })).toBe(
      10000,
    );
  });

  it("ordem 2601: frete de R$ 5,99 entra no total", () => {
    const itens = [{ quantidade: 1, precoUnitario: 2194.56 }];
    expect(totalComAjustes(itens, { ...SEM_AJUSTES, frete: 5.99 })).toBe(
      2200.55,
    );
  });

  it("ordem sem item nenhum ainda soma o frete", () => {
    expect(totalComAjustes([], { ...SEM_AJUSTES, frete: 30 })).toBe(30);
  });
});
