import { describe, expect, it } from "vitest";

import {
  finalizarCotacaoSchema,
  fornecedorCotacaoSchema,
  precoCotacaoSchema,
} from "@/modules/compras/cotacoes/schemas";

const FORNECEDOR = "11111111-1111-4111-8111-111111111111";
const COTACAO_FORNECEDOR = "22222222-2222-4222-8222-222222222222";
const INSUMO = "33333333-3333-4333-8333-333333333333";

describe("fornecedorCotacaoSchema", () => {
  it("aceita fornecedor com prazo opcional ausente", () => {
    const r = fornecedorCotacaoSchema.safeParse({ fornecedorId: FORNECEDOR });
    expect(r.success).toBe(true);
  });

  it("rejeita prazo negativo", () => {
    const r = fornecedorCotacaoSchema.safeParse({
      fornecedorId: FORNECEDOR,
      prazoEntregaDias: -1,
    });
    expect(r.success).toBe(false);
  });

  it("rejeita prazo não inteiro", () => {
    const r = fornecedorCotacaoSchema.safeParse({
      fornecedorId: FORNECEDOR,
      prazoEntregaDias: 7.5,
    });
    expect(r.success).toBe(false);
  });
});

describe("precoCotacaoSchema", () => {
  const base = {
    cotacaoFornecedorId: COTACAO_FORNECEDOR,
    insumoId: INSUMO,
    quantidade: 10,
    precoUnitario: 25.5,
  };

  it("aceita preço lançado válido", () => {
    expect(precoCotacaoSchema.safeParse(base).success).toBe(true);
  });

  it("aceita preço zero", () => {
    expect(precoCotacaoSchema.safeParse({ ...base, precoUnitario: 0 }).success).toBe(
      true,
    );
  });

  it("rejeita quantidade zero", () => {
    expect(precoCotacaoSchema.safeParse({ ...base, quantidade: 0 }).success).toBe(
      false,
    );
  });

  it("rejeita preço negativo", () => {
    expect(
      precoCotacaoSchema.safeParse({ ...base, precoUnitario: -1 }).success,
    ).toBe(false);
  });
});

describe("finalizarCotacaoSchema", () => {
  it("exige fornecedor vencedor", () => {
    const r = finalizarCotacaoSchema.safeParse({ vencedorFornecedorId: "x" });
    expect(r.success).toBe(false);
  });

  it("aceita vencedor com motivo opcional vazio (vira undefined)", () => {
    const r = finalizarCotacaoSchema.safeParse({
      vencedorFornecedorId: FORNECEDOR,
      motivoSelecao: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.motivoSelecao).toBeUndefined();
  });
});
