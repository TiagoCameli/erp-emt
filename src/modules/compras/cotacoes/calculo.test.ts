import { describe, expect, it } from "vitest";

import {
  montarComparativo,
  paraNumero,
} from "@/modules/compras/cotacoes/calculo";

describe("paraNumero (cotação)", () => {
  it("converte preço pt-BR com milhar e decimal", () => {
    expect(paraNumero("1.234,56")).toBe(1234.56);
  });

  it("vazio vira 0 (célula sem preço)", () => {
    expect(paraNumero("")).toBe(0);
  });

  it("inválido vira 0", () => {
    expect(paraNumero("--")).toBe(0);
  });
});

describe("montarComparativo", () => {
  const FA = "fornecedor-a";
  const FB = "fornecedor-b";
  const I1 = "insumo-1";
  const I2 = "insumo-2";

  it("soma total por fornecedor (preço x quantidade)", () => {
    const r = montarComparativo(
      [
        { insumoId: I1, quantidade: 10, precos: { [FA]: 5, [FB]: 6 } },
        { insumoId: I2, quantidade: 2, precos: { [FA]: 100, [FB]: 90 } },
      ],
      [FA, FB],
    );
    // FA: 10*5 + 2*100 = 250 ; FB: 10*6 + 2*90 = 240
    expect(r.totalPorFornecedor.get(FA)).toBe(250);
    expect(r.totalPorFornecedor.get(FB)).toBe(240);
  });

  it("acha o menor preço por linha (só preços > 0)", () => {
    const r = montarComparativo(
      [{ insumoId: I1, quantidade: 1, precos: { [FA]: 5, [FB]: 6 } }],
      [FA, FB],
    );
    expect(r.menorPorLinha.get(I1)).toBe(5);
  });

  it("acha o menor total entre fornecedores", () => {
    const r = montarComparativo(
      [
        { insumoId: I1, quantidade: 10, precos: { [FA]: 5, [FB]: 6 } },
        { insumoId: I2, quantidade: 2, precos: { [FA]: 100, [FB]: 90 } },
      ],
      [FA, FB],
    );
    expect(r.menorTotal).toBe(240);
  });

  it("ignora célula vazia/preço zero: fornecedor que não cotou não entra no total", () => {
    const r = montarComparativo(
      [{ insumoId: I1, quantidade: 10, precos: { [FA]: 5, [FB]: 0 } }],
      [FA, FB],
    );
    expect(r.totalPorFornecedor.get(FA)).toBe(50);
    expect(r.totalPorFornecedor.has(FB)).toBe(false);
    // menor da linha desconsidera o zero do FB
    expect(r.menorPorLinha.get(I1)).toBe(5);
  });

  it("menorTotal é null quando ninguém cotou nada", () => {
    const r = montarComparativo(
      [{ insumoId: I1, quantidade: 10, precos: { [FA]: 0, [FB]: 0 } }],
      [FA, FB],
    );
    expect(r.menorTotal).toBeNull();
    expect(r.totalPorFornecedor.size).toBe(0);
    expect(r.menorPorLinha.size).toBe(0);
  });

  it("linha sem o fornecedor na lista não conta esse preço", () => {
    const r = montarComparativo(
      [{ insumoId: I1, quantidade: 1, precos: { [FA]: 5 } }],
      [FA, FB],
    );
    expect(r.totalPorFornecedor.get(FA)).toBe(5);
    expect(r.totalPorFornecedor.has(FB)).toBe(false);
  });
});
