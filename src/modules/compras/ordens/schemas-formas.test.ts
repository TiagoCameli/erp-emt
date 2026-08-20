/**
 * Divisão da ordem de compra entre várias formas de pagamento.
 *
 * O caso real: a compra de R$ 1.000 sai metade em boleto (30 dias) e metade em
 * dinheiro no ato. São dois caminhos diferentes — o boleto vai para a fila de
 * aprovação de pagamento, o dinheiro não —, então a divisão não é enfeite: é o
 * que decide por onde cada metade passa.
 *
 * Cada regra vem com a LINHA DE CONTROLE: o mesmo dado arrumado, que TEM que
 * passar. Sem ela, um schema que recusasse tudo passaria por todos os testes.
 */
import { describe, expect, it } from "vitest";

import {
  ordemCompraFormSchema,
  ordemCompraSchema,
} from "@/modules/compras/ordens/schemas";

const FORNECEDOR = "11111111-1111-4111-8111-111111111111";
const INSUMO = "22222222-2222-4222-8222-222222222222";
const CENTRO = "33333333-3333-4333-8333-333333333333";
const CONDICAO = "66666666-6666-4666-8666-666666666666";
const BOLETO = "77777777-7777-4777-8777-777777777777";
const DINHEIRO = "99999999-9999-4999-8999-999999999999";
const CATEGORIA = "88888888-8888-4888-8888-888888888888";

/** 10 x R$ 100,00 = R$ 1.000,00 de total. */
const TOTAL = 1000;

const servidor = {
  fornecedorId: FORNECEDOR,
  condicaoPagamentoId: CONDICAO,
  formaPagamentoId: BOLETO,
  dataCompra: "2026-06-18",
  mesCompetencia: "2026-06-01",
  descricao: "Brita 1 para a base do km 118",
  categoriaId: CATEGORIA,
  itens: [
    {
      insumoId: INSUMO,
      quantidade: 10,
      precoUnitario: 100,
      centroCustoId: CENTRO,
    },
  ],
  parcelas: [] as {
    dataVencimento: string;
    valor: number;
    formaPagamentoId?: string;
  }[],
  formas: [{ formaPagamentoId: BOLETO, valor: TOTAL }],
};

const formulario = {
  fornecedorId: FORNECEDOR,
  condicaoPagamentoId: CONDICAO,
  formaPagamentoId: BOLETO,
  dataCompra: "2026-06-18",
  mesCompetencia: "2026-06",
  descricao: "Brita 1 para a base do km 118",
  categoriaId: CATEGORIA,
  numeroDocumento: "",
  observacoes: "",
  centrosCusto: [
    {
      centroCustoId: CENTRO,
      insumos: [{ insumoId: INSUMO, quantidade: "10", precoUnitario: "100" }],
    },
  ],
  parcelas: [] as {
    dataVencimento: string;
    valor: string;
    formaPagamentoId: string;
  }[],
  formas: [{ formaPagamentoId: BOLETO, valor: "" }],
};

/** As reclamações de uma tentativa recusada, sem depender da ordem delas. */
function erros(resultado: {
  success: boolean;
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}) {
  return resultado.success ? [] : (resultado.error?.issues ?? []);
}

function mensagens(resultado: Parameters<typeof erros>[0]) {
  return erros(resultado).map((issue) => issue.message);
}

function caminhos(resultado: Parameters<typeof erros>[0]) {
  return erros(resultado).map((issue) => issue.path.map(String).join("."));
}

describe("uma forma só: nada muda", () => {
  it("a forma única vale o total, e a ordem passa", () => {
    expect(ordemCompraSchema.safeParse(servidor).success).toBe(true);
  });

  it("com uma forma, parcela continua opcional", () => {
    // É o caso antigo e o mais comum: OC sem parcelas, que o lançamento define.
    expect(
      ordemCompraSchema.safeParse({ ...servidor, parcelas: [] }).success,
    ).toBe(true);
  });

  it("com uma forma, parcela não precisa dizer de qual forma é", () => {
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      parcelas: [{ dataVencimento: "2026-07-18", valor: TOTAL }],
    });
    expect(r.success).toBe(true);
  });

  it("ordem sem forma nenhuma não passa", () => {
    const r = ordemCompraSchema.safeParse({ ...servidor, formas: [] });
    expect(r.success).toBe(false);
    expect(mensagens(r)).toContain("Escolha a forma de pagamento");
  });
});

describe("a soma das formas fecha com o total da ordem", () => {
  it("recusa divisão que não fecha", () => {
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: [
        { formaPagamentoId: BOLETO, valor: 500 },
        { formaPagamentoId: DINHEIRO, valor: 400 },
      ],
      parcelas: [
        { dataVencimento: "2026-07-18", valor: 500, formaPagamentoId: BOLETO },
        { dataVencimento: "2026-06-18", valor: 400, formaPagamentoId: DINHEIRO },
      ],
    });
    expect(r.success).toBe(false);
    expect(mensagens(r)).toContain(
      "A soma das formas precisa fechar com o total da ordem",
    );
  });

  it("LINHA DE CONTROLE: a mesma divisão fechando exato passa", () => {
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: [
        { formaPagamentoId: BOLETO, valor: 500 },
        { formaPagamentoId: DINHEIRO, valor: 500 },
      ],
      parcelas: [
        { dataVencimento: "2026-07-18", valor: 500, formaPagamentoId: BOLETO },
        { dataVencimento: "2026-06-18", valor: 500, formaPagamentoId: DINHEIRO },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("divisão em centavos quebrados fecha sem erro de float", () => {
    // 333,33 + 666,67: em float a soma dá 999,9999... e uma comparação ingênua
    // acusaria diferença que não existe.
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: [
        { formaPagamentoId: BOLETO, valor: 333.33 },
        { formaPagamentoId: DINHEIRO, valor: 666.67 },
      ],
      parcelas: [
        {
          dataVencimento: "2026-07-18",
          valor: 333.33,
          formaPagamentoId: BOLETO,
        },
        {
          dataVencimento: "2026-06-18",
          valor: 666.67,
          formaPagamentoId: DINHEIRO,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("a mesma forma duas vezes não passa", () => {
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: [
        { formaPagamentoId: BOLETO, valor: 500 },
        { formaPagamentoId: BOLETO, valor: 500 },
      ],
      parcelas: [
        { dataVencimento: "2026-07-18", valor: 1000, formaPagamentoId: BOLETO },
      ],
    });
    expect(r.success).toBe(false);
    expect(mensagens(r)).toContain(
      "A mesma forma aparece duas vezes: some os valores numa linha só",
    );
  });
});

describe("dividiu entre formas, então precisa de parcela", () => {
  it("duas formas e nenhuma parcela não passa", () => {
    // Sem parcela a parte em boleto não tem vencimento para entrar na fila, e
    // depois de aprovada não há mais como parcelar: o diálogo do lançamento
    // recusa lançamento de várias formas.
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: [
        { formaPagamentoId: BOLETO, valor: 500 },
        { formaPagamentoId: DINHEIRO, valor: 500 },
      ],
      parcelas: [],
    });
    expect(r.success).toBe(false);
    expect(mensagens(r).join(" ")).toContain("precisa de parcelas");
  });

  it("LINHA DE CONTROLE: UMA forma e nenhuma parcela passa", () => {
    expect(
      ordemCompraSchema.safeParse({
        ...servidor,
        formas: [{ formaPagamentoId: BOLETO, valor: TOTAL }],
        parcelas: [],
      }).success,
    ).toBe(true);
  });
});

describe("cada parcela diz de qual forma sai", () => {
  const duas = [
    { formaPagamentoId: BOLETO, valor: 600 },
    { formaPagamentoId: DINHEIRO, valor: 400 },
  ];

  it("parcela sem forma aponta o campo dela", () => {
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: duas,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: 600, formaPagamentoId: BOLETO },
        { dataVencimento: "2026-06-18", valor: 400 },
      ],
    });
    expect(r.success).toBe(false);
    expect(caminhos(r)).toContain("parcelas.1.formaPagamentoId");
  });

  it("parcela apontando forma que não foi declarada não passa", () => {
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: duas,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: 600, formaPagamentoId: BOLETO },
        {
          dataVencimento: "2026-06-18",
          valor: 400,
          formaPagamentoId: CATEGORIA,
        },
      ],
    });
    expect(r.success).toBe(false);
    expect(caminhos(r)).toContain("parcelas.1.formaPagamentoId");
  });

  it("O CASO DE DINHEIRO: o total fecha, mas cada forma não", () => {
    // R$ 1.000 de parcelas contra R$ 1.000 de formas: a soma geral bate e uma
    // conferência só do total deixaria passar. Só que o boleto ficou com R$ 400
    // onde declarou R$ 600 — na aprovação, R$ 200 iriam pelo caminho errado.
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: duas,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: 400, formaPagamentoId: BOLETO },
        { dataVencimento: "2026-06-18", valor: 600, formaPagamentoId: DINHEIRO },
      ],
    });
    expect(r.success).toBe(false);
    expect(mensagens(r)).toContain(
      "As parcelas desta forma não fecham com o valor dela",
    );
    expect(caminhos(r)).toContain("formas.0.valor");
  });

  it("LINHA DE CONTROLE: trocando os valores de lugar, fecha e passa", () => {
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: duas,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: 600, formaPagamentoId: BOLETO },
        { dataVencimento: "2026-06-18", valor: 400, formaPagamentoId: DINHEIRO },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("uma forma com duas parcelas e a outra com uma", () => {
    const r = ordemCompraSchema.safeParse({
      ...servidor,
      formas: duas,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: 300, formaPagamentoId: BOLETO },
        { dataVencimento: "2026-08-18", valor: 300, formaPagamentoId: BOLETO },
        { dataVencimento: "2026-06-18", valor: 400, formaPagamentoId: DINHEIRO },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("as mesmas regras no formulário", () => {
  it("uma forma, sem valor digitado, passa", () => {
    // Com forma única não existe coluna de valor na tela: ela vale o total.
    expect(ordemCompraFormSchema.safeParse(formulario).success).toBe(true);
  });

  it("a primeira forma em branco não passa", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formulario,
      formas: [{ formaPagamentoId: "", valor: "" }],
    });
    expect(r.success).toBe(false);
    expect(caminhos(r)).toContain("formas.0.formaPagamentoId");
  });

  it("dividiu: cada linha precisa de valor", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formulario,
      formas: [
        { formaPagamentoId: BOLETO, valor: "1000,00" },
        { formaPagamentoId: DINHEIRO, valor: "" },
      ],
    });
    expect(r.success).toBe(false);
    expect(caminhos(r)).toContain("formas.1.valor");
  });

  it("dividiu e faltou: a mensagem diz quanto falta", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formulario,
      formas: [
        { formaPagamentoId: BOLETO, valor: "500,00" },
        { formaPagamentoId: DINHEIRO, valor: "400,00" },
      ],
      parcelas: [
        {
          dataVencimento: "2026-07-18",
          valor: "500,00",
          formaPagamentoId: BOLETO,
        },
        {
          dataVencimento: "2026-06-18",
          valor: "400,00",
          formaPagamentoId: DINHEIRO,
        },
      ],
    });
    expect(r.success).toBe(false);
    // "Faltam" e não o valor formatado: formatarBRL usa espaço não separável, e
    // um literal com espaço comum nunca bate.
    expect(mensagens(r).join(" ")).toContain("Faltam");
  });

  it("dividiu e passou do total: a mensagem diz que passou", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formulario,
      formas: [
        { formaPagamentoId: BOLETO, valor: "700,00" },
        { formaPagamentoId: DINHEIRO, valor: "400,00" },
      ],
      parcelas: [
        {
          dataVencimento: "2026-07-18",
          valor: "700,00",
          formaPagamentoId: BOLETO,
        },
        {
          dataVencimento: "2026-06-18",
          valor: "400,00",
          formaPagamentoId: DINHEIRO,
        },
      ],
    });
    expect(r.success).toBe(false);
    expect(mensagens(r).join(" ")).toContain("passam");
  });

  it("dividiu sem parcela: a mensagem fala de parcela, não de soma", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formulario,
      formas: [
        { formaPagamentoId: BOLETO, valor: "500,00" },
        { formaPagamentoId: DINHEIRO, valor: "500,00" },
      ],
      parcelas: [],
    });
    expect(r.success).toBe(false);
    const texto = mensagens(r).join(" ");
    expect(texto).toContain("informe as parcelas");
    // O erro velho ("as parcelas desta forma não fecham") contra lista vazia era
    // verdade inútil: quem dividiu ainda não chegou nas parcelas.
    expect(texto).not.toContain("não fecham com o valor dela");
  });

  it("LINHA DE CONTROLE: dividiu, com as parcelas certas, passa", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formulario,
      formas: [
        { formaPagamentoId: BOLETO, valor: "500,00" },
        { formaPagamentoId: DINHEIRO, valor: "500,00" },
      ],
      parcelas: [
        {
          dataVencimento: "2026-07-18",
          valor: "500,00",
          formaPagamentoId: BOLETO,
        },
        {
          dataVencimento: "2026-06-18",
          valor: "500,00",
          formaPagamentoId: DINHEIRO,
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
