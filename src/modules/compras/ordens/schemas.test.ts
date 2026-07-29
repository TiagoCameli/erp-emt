import { describe, expect, it } from "vitest";

import {
  ocInsumoFormSchema,
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
const FORMA = "77777777-7777-4777-8777-777777777777";

const itemValido = {
  insumoId: INSUMO,
  quantidade: 5,
  precoUnitario: 12.5,
  centroCustoId: CENTRO,
};

const ocValida = {
  fornecedorId: FORNECEDOR,
  condicaoPagamentoId: CONDICAO,
  formaPagamentoId: FORMA,
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

  it("aceita quantidade com exatamente 3 casas decimais", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, quantidade: 1.235 });
    expect(r.success).toBe(true);
  });

  it("rejeita quantidade com mais de 3 casas decimais (arredondaria em silêncio no banco)", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, quantidade: 1.2345 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "A quantidade aceita no máximo 3 casas decimais",
      );
    }
  });

  it("aceita preço com exatamente 2 casas decimais", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, precoUnitario: 12.34 });
    expect(r.success).toBe(true);
  });

  it("rejeita preço com mais de 2 casas decimais (arredondaria em silêncio no banco)", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, precoUnitario: 12.345 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "O preço aceita no máximo 2 casas decimais",
      );
    }
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

  // A forma de pagamento decide o caminho do pagamento (fila de aprovação,
  // direto para Pagamentos ou já quitado no cartão), então virou obrigatória.
  it("exige forma de pagamento", () => {
    const { formaPagamentoId: _, ...semForma } = ocValida;
    const r = ordemCompraSchema.safeParse(semForma);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Escolha a forma de pagamento");
    }
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

describe("ocInsumoFormSchema (client, quantidade/preço como string)", () => {
  const insumoValido = { insumoId: INSUMO, quantidade: "5", precoUnitario: "12,5" };

  it("aceita quantidade com vírgula e 3 casas decimais", () => {
    const r = ocInsumoFormSchema.safeParse({
      ...insumoValido,
      quantidade: "1,235",
    });
    expect(r.success).toBe(true);
  });

  it("rejeita quantidade com vírgula e mais de 3 casas decimais", () => {
    const r = ocInsumoFormSchema.safeParse({
      ...insumoValido,
      quantidade: "1,2345",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "A quantidade aceita no máximo 3 casas decimais",
      );
    }
  });

  it("rejeita preço com ponto e mais de 2 casas decimais", () => {
    const r = ocInsumoFormSchema.safeParse({
      ...insumoValido,
      precoUnitario: "12.345",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "O preço aceita no máximo 2 casas decimais",
      );
    }
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
    formaPagamentoId: FORMA,
    dataEmissao: "2026-06-18",
    observacoes: "",
    centrosCusto: [grupoValido],
    // Parcelas são opcionais no produto (lista vazia = definir no lançamento),
    // mas o campo é sempre enviado pelo formulário.
    parcelas: [],
  };

  it("aceita OC com um centro de custo e um insumo", () => {
    expect(ordemCompraFormSchema.safeParse(formValido).success).toBe(true);
  });

  it("exige forma de pagamento no formulário", () => {
    const { formaPagamentoId: _, ...semForma } = formValido;
    const r = ordemCompraFormSchema.safeParse(semForma);
    expect(r.success).toBe(false);
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

describe("parcelas da OC no formulário", () => {
  const base = {
    fornecedorId: FORNECEDOR,
    condicaoPagamentoId: CONDICAO,
    formaPagamentoId: FORMA,
    dataEmissao: "2026-06-18",
    observacoes: "",
    // 10 x 100,00 = 1.000,00 de total
    centrosCusto: [
      {
        centroCustoId: CENTRO,
        insumos: [{ insumoId: INSUMO, quantidade: "10", precoUnitario: "100" }],
      },
    ],
  };

  it("lista vazia é válida: parcelas são opcionais", () => {
    expect(ordemCompraFormSchema.safeParse({ ...base, parcelas: [] }).success).toBe(
      true,
    );
  });

  it("aceita parcelas que fecham com o total", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: "333,33" },
        { dataVencimento: "2026-08-18", valor: "333,33" },
        { dataVencimento: "2026-09-18", valor: "333,34" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("recusa soma divergente e diz quanto falta", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: "500,00" },
        { dataVencimento: "2026-08-18", valor: "488,00" },
      ],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.message.includes("Faltam R$ 12,00"))).toBe(
      true,
    );
  });

  it("recusa soma que passa do total", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [{ dataVencimento: "2026-07-18", valor: "1012,00" }],
    });
    expect(r.success).toBe(false);
    expect(
      r.error?.issues.some((i) => i.message.includes("passam R$ 12,00")),
    ).toBe(true);
  });

  it("recusa vencimento antes da emissão, apontando a parcela", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [
        { dataVencimento: "2026-06-01", valor: "500,00" },
        { dataVencimento: "2026-07-18", valor: "500,00" },
      ],
    });
    expect(r.success).toBe(false);
    expect(
      r.error?.issues.some(
        (i) =>
          i.path.join(".") === "parcelas.0.dataVencimento" &&
          i.message.includes("antes da emissão"),
      ),
    ).toBe(true);
  });

  it("vencimento no dia da emissão é aceito", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [{ dataVencimento: "2026-06-18", valor: "1000,00" }],
    });
    expect(r.success).toBe(true);
  });

  it("recusa parcela com valor zero", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: "0" },
        { dataVencimento: "2026-08-18", valor: "1000,00" },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe("parcelas da OC no servidor", () => {
  const baseServidor = {
    fornecedorId: FORNECEDOR,
    condicaoPagamentoId: CONDICAO,
    formaPagamentoId: FORMA,
    dataEmissao: "2026-06-18",
    itens: [
      {
        insumoId: INSUMO,
        quantidade: 10,
        precoUnitario: 100,
        centroCustoId: CENTRO,
      },
    ],
  };

  it("sem parcelas passa e vira lista vazia", () => {
    const r = ordemCompraSchema.safeParse(baseServidor);
    expect(r.success).toBe(true);
    expect(r.data?.parcelas).toEqual([]);
  });

  it("recusa soma divergente", () => {
    const r = ordemCompraSchema.safeParse({
      ...baseServidor,
      parcelas: [{ dataVencimento: "2026-07-18", valor: 999 }],
    });
    expect(r.success).toBe(false);
  });

  it("aceita soma exata", () => {
    const r = ordemCompraSchema.safeParse({
      ...baseServidor,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: 400 },
        { dataVencimento: "2026-08-18", valor: 600 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("recusa vencimento antes da emissão", () => {
    const r = ordemCompraSchema.safeParse({
      ...baseServidor,
      parcelas: [{ dataVencimento: "2026-01-01", valor: 1000 }],
    });
    expect(r.success).toBe(false);
  });
});
