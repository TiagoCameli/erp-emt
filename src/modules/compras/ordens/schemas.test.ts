import { describe, expect, it } from "vitest";

import {
  ocItemSchema,
  ordemCompraFormSchema,
  ordemCompraSchema,
} from "@/modules/compras/ordens/schemas";

const FORNECEDOR = "11111111-1111-4111-8111-111111111111";
const INSUMO = "22222222-2222-4222-8222-222222222222";
const CENTRO = "33333333-3333-4333-8333-333333333333";
const INSUMO2 = "44444444-4444-4444-8444-444444444444";
const CENTRO2 = "55555555-5555-4555-8555-555555555555";
const CONDICAO = "66666666-6666-4666-8666-666666666666";

const itemValido = {
  insumoId: INSUMO,
  quantidade: 5,
  precoUnitario: 12.5,
  centroCustoId: CENTRO,
};

const ocValida = {
  fornecedorId: FORNECEDOR,
  condicaoPagamentoId: CONDICAO,
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

  it("exige condição de pagamento", () => {
    const r = ordemCompraSchema.safeParse({
      fornecedorId: FORNECEDOR,
      dataEmissao: "2026-06-18",
      itens: [itemValido],
    });
    expect(r.success).toBe(false);
  });

  it("rejeita condição de pagamento inválida", () => {
    const r = ordemCompraSchema.safeParse({
      ...ocValida,
      condicaoPagamentoId: "não-é-uuid",
    });
    expect(r.success).toBe(false);
  });
});

describe("ordemCompraFormSchema (grupos por centro de custo)", () => {
  const grupoValido = {
    centroCustoId: CENTRO,
    insumos: [{ insumoId: INSUMO, quantidade: "5", precoUnitario: "12,5" }],
  };
  const formValido = {
    fornecedorId: FORNECEDOR,
    condicaoPagamentoId: CONDICAO,
    dataEmissao: "2026-06-18",
    observacoes: "",
    centrosCusto: [grupoValido],
  };

  it("aceita OC com um centro de custo e um insumo", () => {
    expect(ordemCompraFormSchema.safeParse(formValido).success).toBe(true);
  });

  it("exige condição de pagamento no formulário", () => {
    const r = ordemCompraFormSchema.safeParse({
      fornecedorId: FORNECEDOR,
      dataEmissao: "2026-06-18",
      observacoes: "",
      centrosCusto: [grupoValido],
    });
    expect(r.success).toBe(false);
  });

  it("aceita vários centros de custo distintos", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formValido,
      centrosCusto: [
        grupoValido,
        {
          centroCustoId: CENTRO2,
          insumos: [{ insumoId: INSUMO2, quantidade: "1", precoUnitario: "1" }],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("exige ao menos um centro de custo", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formValido,
      centrosCusto: [],
    });
    expect(r.success).toBe(false);
  });

  it("exige ao menos um insumo por centro de custo", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formValido,
      centrosCusto: [{ centroCustoId: CENTRO, insumos: [] }],
    });
    expect(r.success).toBe(false);
  });

  it("rejeita centro de custo repetido entre grupos", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formValido,
      centrosCusto: [
        grupoValido,
        {
          centroCustoId: CENTRO,
          insumos: [{ insumoId: INSUMO2, quantidade: "1", precoUnitario: "1" }],
        },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("centrosCusto.1.centroCustoId");
    }
  });

  it("rejeita insumo repetido dentro do mesmo centro de custo", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formValido,
      centrosCusto: [
        {
          centroCustoId: CENTRO,
          insumos: [
            { insumoId: INSUMO, quantidade: "1", precoUnitario: "1" },
            { insumoId: INSUMO, quantidade: "2", precoUnitario: "2" },
          ],
        },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("centrosCusto.0.insumos.1.insumoId");
    }
  });
});
