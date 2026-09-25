import { describe, expect, it } from "vitest";

import { calcularCaixaReal } from "./caixa-real";

describe("calcularCaixaReal", () => {
  it("soma conta corrente e subconta com liquidez diária, no centavo", () => {
    const r = calcularCaixaReal(
      [
        { contaId: "caixa", tipo: "corrente", ativo: true, saldo: 718814.96 },
        { contaId: "sub", tipo: "investimento", ativo: true, saldo: 6017484.75 },
        { contaId: "bb", tipo: "corrente", ativo: true, saldo: 0.1 },
      ],
      [],
      3,
    );
    expect(r.total).toBe(6736299.81);
    expect(r.aplicacoesDiarias).toBe(6017484.75);
    expect(r.contasOcultas).toBe(0);
  });

  it("tira a aplicação em carência da subconta", () => {
    const r = calcularCaixaReal(
      [
        { contaId: "caixa", tipo: "corrente", ativo: true, saldo: 1000 },
        { contaId: "sub", tipo: "investimento", ativo: true, saldo: 5000 },
      ],
      [{ contaId: "sub", posicao: 3000 }],
      2,
    );
    expect(r.total).toBe(3000);
  });

  it("conta sem permissão de saldo fica fora e é contada, não vira zero", () => {
    const r = calcularCaixaReal([{ contaId: "caixa", tipo: "corrente", ativo: true, saldo: 1000 }], [], 3);
    expect(r.total).toBe(1000);
    expect(r.contasOcultas).toBe(2);
  });

  it("conta inativa não entra", () => {
    const r = calcularCaixaReal([{ contaId: "velha", tipo: "corrente", ativo: false, saldo: -854793.45 }], [], 0);
    expect(r.total).toBe(0);
  });
});
