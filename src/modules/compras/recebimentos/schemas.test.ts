import { describe, expect, it } from "vitest";

import {
  recebimentoItemSchema,
  recebimentoSchema,
} from "@/modules/compras/recebimentos/schemas";

const OC = "11111111-1111-4111-8111-111111111111";
const OC_ITEM = "22222222-2222-4222-8222-222222222222";
const OC_ITEM_2 = "33333333-3333-4333-8333-333333333333";

const base = {
  ordemCompraId: OC,
  numeroNf: "123",
  valorNf: 100,
  dataRecebimento: "2026-06-18",
  dataVencimento: "2026-07-18",
};

describe("recebimentoItemSchema", () => {
  it("aceita quantidade recebida positiva", () => {
    const r = recebimentoItemSchema.safeParse({
      ocItemId: OC_ITEM,
      quantidadeRecebida: 3,
    });
    expect(r.success).toBe(true);
  });

  it("aceita quantidade recebida zero no item (não recebeu este item)", () => {
    const r = recebimentoItemSchema.safeParse({
      ocItemId: OC_ITEM,
      quantidadeRecebida: 0,
    });
    expect(r.success).toBe(true);
  });

  it("rejeita quantidade recebida negativa", () => {
    const r = recebimentoItemSchema.safeParse({
      ocItemId: OC_ITEM,
      quantidadeRecebida: -1,
    });
    expect(r.success).toBe(false);
  });
});

describe("recebimentoSchema", () => {
  it("aceita recebimento com ao menos um item com quantidade > 0", () => {
    const r = recebimentoSchema.safeParse({
      ...base,
      itens: [
        { ocItemId: OC_ITEM, quantidadeRecebida: 0 },
        { ocItemId: OC_ITEM_2, quantidadeRecebida: 2 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejeita quando todos os itens têm quantidade recebida zero", () => {
    const r = recebimentoSchema.safeParse({
      ...base,
      itens: [
        { ocItemId: OC_ITEM, quantidadeRecebida: 0 },
        { ocItemId: OC_ITEM_2, quantidadeRecebida: 0 },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "Informe a quantidade recebida em ao menos um item",
      );
    }
  });

  it("exige ao menos um item na lista", () => {
    const r = recebimentoSchema.safeParse({ ...base, itens: [] });
    expect(r.success).toBe(false);
  });

  it("exige número da nota fiscal", () => {
    const r = recebimentoSchema.safeParse({
      ...base,
      numeroNf: "",
      itens: [{ ocItemId: OC_ITEM, quantidadeRecebida: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejeita valor da nota fiscal zero ou negativo", () => {
    const r = recebimentoSchema.safeParse({
      ...base,
      valorNf: 0,
      itens: [{ ocItemId: OC_ITEM, quantidadeRecebida: 1 }],
    });
    expect(r.success).toBe(false);
  });
});
