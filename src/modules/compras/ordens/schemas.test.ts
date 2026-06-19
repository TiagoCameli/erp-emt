import { describe, expect, it } from "vitest";

import {
  ocItemSchema,
  ordemCompraSchema,
} from "@/modules/compras/ordens/schemas";

const FORNECEDOR = "11111111-1111-4111-8111-111111111111";
const INSUMO = "22222222-2222-4222-8222-222222222222";
const CENTRO = "33333333-3333-4333-8333-333333333333";

const itemValido = {
  insumoId: INSUMO,
  quantidade: 5,
  precoUnitario: 12.5,
  centroCustoId: CENTRO,
};

const ocValida = {
  fornecedorId: FORNECEDOR,
  dataEmissao: "2026-06-18",
  itens: [itemValido],
};

describe("ocItemSchema", () => {
  it("aceita item com quantidade e preço válidos", () => {
    const r = ocItemSchema.safeParse(itemValido);
    expect(r.success).toBe(true);
  });

  it("aceita preço zero (item brinde/bonificação)", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, precoUnitario: 0 });
    expect(r.success).toBe(true);
  });

  it("rejeita preço negativo", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, precoUnitario: -1 });
    expect(r.success).toBe(false);
  });

  it("rejeita quantidade zero", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, quantidade: 0 });
    expect(r.success).toBe(false);
  });
});

describe("ordemCompraSchema", () => {
  it("aceita OC com fornecedor, data e ao menos um item", () => {
    const r = ordemCompraSchema.safeParse(ocValida);
    expect(r.success).toBe(true);
  });

  it("exige fornecedor", () => {
    const r = ordemCompraSchema.safeParse({ ...ocValida, fornecedorId: "x" });
    expect(r.success).toBe(false);
  });

  it("exige ao menos um item", () => {
    const r = ordemCompraSchema.safeParse({ ...ocValida, itens: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "Adicione ao menos um item à ordem de compra",
      );
    }
  });

  it("rejeita data de emissão em formato inválido", () => {
    const r = ordemCompraSchema.safeParse({
      ...ocValida,
      dataEmissao: "18/06/2026",
    });
    expect(r.success).toBe(false);
  });

  it("transforma condição de pagamento vazia em undefined", () => {
    const r = ordemCompraSchema.safeParse({
      ...ocValida,
      condicaoPagamento: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.condicaoPagamento).toBeUndefined();
  });
});
