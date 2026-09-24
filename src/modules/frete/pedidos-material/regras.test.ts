// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  filtrarPedidos,
  FILTROS_PEDIDOS_VAZIOS,
  itensDoForm,
  itensValidos,
  itemVazio,
  pDadosDoPedido,
  podeRemoverItem,
  rotuloTotalPedidos,
  subtotalDoItem,
  totalDoForm,
  totalDoPedido,
} from "@/modules/frete/pedidos-material/regras";
import { pedidoFormSchema, pedidoSchema } from "@/modules/frete/pedidos-material/schemas";

const BRITA = "22222222-2222-4222-8222-222222222222";
const AREIA = "33333333-3333-4333-8333-333333333333";
const FORN = "44444444-4444-4444-8444-444444444444";

describe("itens do pedido (PedidoMaterialForm da origem)", () => {
  it("subtotal = quantidade × valor unitário, sem arredondar; total = soma", () => {
    const itens = [
      { insumoId: BRITA, quantidade: "12,345678", valorUnitario: "85,1234" },
      { insumoId: AREIA, quantidade: "10", valorUnitario: "50" },
    ];
    expect(subtotalDoItem(itens[0])).toBeCloseTo(12.345678 * 85.1234, 10);
    expect(totalDoForm(itens)).toBeCloseTo(12.345678 * 85.1234 + 500, 10);
    expect(totalDoPedido([{ quantidade: 2, valorUnitario: 3.5 }])).toBe(7);
  });

  it("válido com ao menos um item e todos com material, quantidade > 0 e valor > 0", () => {
    expect(itensValidos([])).toBe(false);
    expect(itensValidos([itemVazio()])).toBe(false);
    expect(itensValidos([{ insumoId: BRITA, quantidade: "1", valorUnitario: "1" }])).toBe(true);
    expect(itensValidos([{ insumoId: BRITA, quantidade: "0", valorUnitario: "1" }])).toBe(false);
    expect(itensValidos([{ insumoId: "", quantidade: "1", valorUnitario: "1" }])).toBe(false);
    // Quantidade aceita 6 casas; valor unitário, 4.
    expect(itensValidos([{ insumoId: BRITA, quantidade: "1,123456", valorUnitario: "1,1234" }])).toBe(true);
    expect(itensValidos([{ insumoId: BRITA, quantidade: "1,1234567", valorUnitario: "1" }])).toBe(false);
    expect(itensValidos([{ insumoId: BRITA, quantidade: "1", valorUnitario: "1,12345" }])).toBe(false);
  });

  it("remover só com mais de um item", () => {
    expect(podeRemoverItem([itemVazio()])).toBe(false);
    expect(podeRemoverItem([itemVazio(), itemVazio()])).toBe(true);
  });

  it("payload da fn_pedido_material_salvar", () => {
    const itens = itensDoForm([{ insumoId: BRITA, quantidade: "1.000,5", valorUnitario: "85,1234" }]);
    expect(pDadosDoPedido({ data: "2026-09-01", fornecedorId: FORN, observacoes: null, itens })).toEqual({
      data: "2026-09-01",
      fornecedor_id: FORN,
      observacoes: null,
      itens: [{ insumo_id: BRITA, quantidade: 1000.5, valor_unitario: 85.1234 }],
    });
  });
});

describe("schemas do pedido", () => {
  it("mensagens da origem no formulário", () => {
    const r = pedidoFormSchema.safeParse({ data: "", fornecedorId: "", observacoes: "x".repeat(501) });
    expect(r.error?.issues.map((i) => i.message)).toEqual([
      "Data do pedido obrigatória",
      "Selecione o fornecedor",
      "Máximo 500 caracteres",
    ]);
  });

  it("a action recusa pedido sem item, quantidade com 7 casas e valor com 5", () => {
    const base = { data: "2026-09-01", fornecedorId: FORN, observacoes: null };
    expect(pedidoSchema.safeParse({ ...base, itens: [] }).error?.issues[0]?.message).toBe("Adicione ao menos um material");
    expect(
      pedidoSchema.safeParse({ ...base, itens: [{ insumoId: BRITA, quantidade: 1.1234567, valorUnitario: 1 }] }).success,
    ).toBe(false);
    expect(
      pedidoSchema.safeParse({ ...base, itens: [{ insumoId: BRITA, quantidade: 1, valorUnitario: 1.12345 }] }).success,
    ).toBe(false);
    expect(
      pedidoSchema.safeParse({ ...base, itens: [{ insumoId: BRITA, quantidade: 12.345678, valorUnitario: 85.1234 }] })
        .success,
    ).toBe(true);
  });
});

describe("filtro da lista", () => {
  const pedidos = [
    { id: "a", data: "2026-08-01", fornecedorId: "f1", itens: [{ insumoId: BRITA }] },
    { id: "b", data: "2026-09-01", fornecedorId: "f2", itens: [{ insumoId: AREIA }, { insumoId: BRITA }] },
    { id: "c", data: "2026-08-15", fornecedorId: "f1", itens: [{ insumoId: AREIA }] },
  ];

  it("ordem data desc; fornecedor por igualdade; material = algum item dele; período inclusivo", () => {
    const f = FILTROS_PEDIDOS_VAZIOS;
    expect(filtrarPedidos(pedidos, f).map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(filtrarPedidos(pedidos, { ...f, fornecedorId: "f1" }).map((p) => p.id)).toEqual(["c", "a"]);
    expect(filtrarPedidos(pedidos, { ...f, materialId: BRITA }).map((p) => p.id)).toEqual(["b", "a"]);
    expect(filtrarPedidos(pedidos, { ...f, de: "2026-08-15", ate: "2026-09-01" }).map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("rótulo do rodapé", () => {
    expect(rotuloTotalPedidos(1)).toBe("Total (1 pedido)");
    expect(rotuloTotalPedidos(4)).toBe("Total (4 pedidos)");
  });
});
