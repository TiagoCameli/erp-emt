import { describe, it, expect } from "vitest";
import { ordemCompraFormSchema } from "./schemas";

// Dados exatos da OC-2026-0026 no banco (27/08/2026)
const valores = {
  fornecedorId: "00000000-0000-4000-8000-000000000001",
  condicaoPagamentoId: "00000000-0000-4000-8000-000000000002",
  cotacaoId: undefined,
  dataCompra: "2026-08-17",
  mesCompetencia: "2026-08",
  descricao: "REFERENTE CONSERTO MOTOR DA PATROL 12H - 01",
  categoriaId: "9351f74e-df06-4f84-b1ee-98b2ea770d8a",
  numeroDocumento: "",
  observacoes: "",
  frete: "",
  outrasDespesas: "",
  impostos: "",
  desconto: "",
  centrosCusto: [
    {
      centroCustoId: "057cfab1-5866-416d-8bd8-f4a474b4e4a1",
      insumos: [
        {
          insumoId: "8bdaa2c0-6949-4388-8e4a-2ff3ba2a2b17",
          quantidade: "1,0000",
          precoUnitario: "15400,0000",
        },
      ],
    },
  ],
  parcelas: [
    { dataVencimento: "2026-08-17", valor: "400,00", formaPagamentoId: "F-PIX" },
    { dataVencimento: "2026-08-28", valor: "3000,00", formaPagamentoId: "F-CC" },
    { dataVencimento: "2026-09-28", valor: "3000,00", formaPagamentoId: "F-CC" },
    { dataVencimento: "2026-10-28", valor: "3000,00", formaPagamentoId: "F-CC" },
    { dataVencimento: "2026-11-28", valor: "3000,00", formaPagamentoId: "F-CC" },
    { dataVencimento: "2026-12-28", valor: "3000,00", formaPagamentoId: "F-CC" },
  ],
  formas: [
    { formaPagamentoId: "F-PIX", valor: "400,00" },
    { formaPagamentoId: "F-CC", valor: "15.000,00" },
  ],
};

describe("repro OC-0026", () => {
  it("valida", () => {
    const r = ordemCompraFormSchema.safeParse(valores);
    if (!r.success) {
      console.log(JSON.stringify(r.error.issues, null, 2));
    }
    expect(r.success).toBe(true);
  });
});
