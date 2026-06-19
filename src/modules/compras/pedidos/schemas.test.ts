import { describe, expect, it } from "vitest";

import { pedidoItemSchema, pedidoSchema } from "@/modules/compras/pedidos/schemas";

const UUID = "11111111-1111-4111-8111-111111111111";
const OUTRO_UUID = "22222222-2222-4222-8222-222222222222";

const itemValido = {
  insumoId: UUID,
  quantidade: 10,
  centroCustoId: OUTRO_UUID,
};

describe("pedidoItemSchema", () => {
  it("aceita item com insumo, quantidade positiva e centro de custo", () => {
    const r = pedidoItemSchema.safeParse(itemValido);
    expect(r.success).toBe(true);
  });

  it("rejeita quantidade zero", () => {
    const r = pedidoItemSchema.safeParse({ ...itemValido, quantidade: 0 });
    expect(r.success).toBe(false);
  });

  it("rejeita quantidade negativa", () => {
    const r = pedidoItemSchema.safeParse({ ...itemValido, quantidade: -5 });
    expect(r.success).toBe(false);
  });

  it("rejeita insumo que não é uuid", () => {
    const r = pedidoItemSchema.safeParse({ ...itemValido, insumoId: "abc" });
    expect(r.success).toBe(false);
  });

  it("transforma observação vazia em undefined", () => {
    const r = pedidoItemSchema.safeParse({ ...itemValido, observacao: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.observacao).toBeUndefined();
  });
});

describe("pedidoSchema", () => {
  it("exige pelo menos um item", () => {
    const r = pedidoSchema.safeParse({ itens: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "Adicione pelo menos um item ao pedido",
      );
    }
  });

  it("aceita pedido com um item e justificativa opcional", () => {
    const r = pedidoSchema.safeParse({ itens: [itemValido] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.justificativa).toBeUndefined();
  });

  it("rejeita o pedido inteiro quando algum item tem quantidade <= 0", () => {
    const r = pedidoSchema.safeParse({
      itens: [itemValido, { ...itemValido, quantidade: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("transforma justificativa em branco em undefined", () => {
    const r = pedidoSchema.safeParse({ justificativa: "   ", itens: [itemValido] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.justificativa).toBeUndefined();
  });
});
