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
const CATEGORIA = "88888888-8888-4888-8888-888888888888";
const DESCRICAO = "Brita 1 para a base do km 118";

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
  dataCompra: "2026-06-18",
  mesCompetencia: "2026-06-01",
  descricao: DESCRICAO,
  categoriaId: CATEGORIA,
  itens: [itemValido],
  // 5 x 12,50 = 62,50, tudo por uma forma so: e o que o formulario manda quando
  // ninguem dividiu (a linha unica assume o total dos itens).
  formas: [{ formaPagamentoId: FORMA, valor: 62.5 }],
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

  it("aceita quantidade com exatamente 4 casas decimais", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, quantidade: 1.2345 });
    expect(r.success).toBe(true);
  });

  it("rejeita quantidade com mais de 4 casas decimais (arredondaria em silêncio no banco)", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, quantidade: 1.23456 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "A quantidade aceita no máximo 4 casas decimais",
      );
    }
  });

  // O caso que motivou as 4 casas: diesel S500 a R$ 6,3947 o litro, recusado na
  // tela de editar OC em 19/08/2026 com "no máximo 2 casas decimais".
  it("aceita preço de combustível com 4 casas (6,3947)", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, precoUnitario: 6.3947 });
    expect(r.success).toBe(true);
  });

  it("rejeita preço com mais de 4 casas decimais (arredondaria em silêncio no banco)", () => {
    const r = ocItemSchema.safeParse({ ...itemValido, precoUnitario: 12.34567 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "O preço aceita no máximo 4 casas decimais",
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

  it("rejeita data da compra em formato inválido", () => {
    const r = ordemCompraSchema.safeParse({
      ...ocValida,
      dataCompra: "18/06/2026",
    });
    expect(r.success).toBe(false);
  });

  // O mês de referência é DATE no dia 1 no banco, com check. Mês solto ou dia
  // diferente de 1 não pode passar do app para lá.
  it("exige mês de referência normalizado no dia 1", () => {
    expect(
      ordemCompraSchema.safeParse({ ...ocValida, mesCompetencia: "2026-06" })
        .success,
    ).toBe(false);
    expect(
      ordemCompraSchema.safeParse({
        ...ocValida,
        mesCompetencia: "2026-06-18",
      }).success,
    ).toBe(false);
  });

  it("exige mês de referência", () => {
    const { mesCompetencia: _, ...semMes } = ocValida;
    const r = ordemCompraSchema.safeParse(semMes);
    expect(r.success).toBe(false);
  });

  it("exige condição de pagamento", () => {
    const r = ordemCompraSchema.safeParse({
      fornecedorId: FORNECEDOR,
      dataCompra: "2026-06-18",
      mesCompetencia: "2026-06-01",
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

  // Descrição e categoria são o que classifica a compra no DRE: sem elas o
  // lançamento gerado na aprovação nasce sem significado contábil.
  it("exige descrição com ao menos 3 caracteres", () => {
    expect(
      ordemCompraSchema.safeParse({ ...ocValida, descricao: "  " }).success,
    ).toBe(false);
    const r = ordemCompraSchema.safeParse({ ...ocValida, descricao: "ab" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "Descreva a compra em pelo menos 3 caracteres",
      );
    }
  });

  it("recusa descrição acima de 500 caracteres", () => {
    const r = ordemCompraSchema.safeParse({
      ...ocValida,
      descricao: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("exige categoria do custo", () => {
    const { categoriaId: _, ...semCategoria } = ocValida;
    const r = ordemCompraSchema.safeParse(semCategoria);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Escolha a categoria do custo");
    }
  });
});

describe("ocInsumoFormSchema (client, quantidade/preço como string)", () => {
  const insumoValido = { insumoId: INSUMO, quantidade: "5", precoUnitario: "12,5" };

  it("aceita quantidade com vírgula e 4 casas decimais", () => {
    const r = ocInsumoFormSchema.safeParse({
      ...insumoValido,
      quantidade: "1,2345",
    });
    expect(r.success).toBe(true);
  });

  it("aceita preço de combustível com vírgula e 4 casas (6,3947)", () => {
    const r = ocInsumoFormSchema.safeParse({
      ...insumoValido,
      precoUnitario: "6,3947",
    });
    expect(r.success).toBe(true);
  });

  it("rejeita quantidade com vírgula e mais de 4 casas decimais", () => {
    const r = ocInsumoFormSchema.safeParse({
      ...insumoValido,
      quantidade: "1,23456",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "A quantidade aceita no máximo 4 casas decimais",
      );
    }
  });

  it("rejeita preço com ponto e mais de 4 casas decimais", () => {
    const r = ocInsumoFormSchema.safeParse({
      ...insumoValido,
      precoUnitario: "12.34567",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "O preço aceita no máximo 4 casas decimais",
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
    dataCompra: "2026-06-18",
    mesCompetencia: "2026-06",
    descricao: DESCRICAO,
    categoriaId: CATEGORIA,
    numeroDocumento: "",
    observacoes: "",
    // Os quatro ajustes do rodapé: vazio vale zero, que é o caso da maioria das
    // ordens. O formulário sempre envia os quatro (ver valoresIniciais).
    frete: "",
    outrasDespesas: "",
    impostos: "",
    desconto: "",
    centrosCusto: [grupoValido],
    // Parcelas são opcionais no produto (lista vazia = definir no lançamento),
    // mas o campo é sempre enviado pelo formulário.
    parcelas: [],
    // Uma forma, sem valor: com forma única o valor não é digitado (vale o total
    // dos itens), e é o `aoEnviar` do drawer que o preenche.
    formas: [{ formaPagamentoId: FORMA, valor: "" }],
  };

  it("aceita OC com um centro de custo e um insumo", () => {
    expect(ordemCompraFormSchema.safeParse(formValido).success).toBe(true);
  });

  it("recusa data da compra no futuro", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...formValido,
      dataCompra: "2099-01-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "A data da compra não pode ser no futuro",
      );
    }
  });

  it("exige o mês de referência no formulário, no formato do input month", () => {
    const { mesCompetencia: _, ...semMes } = formValido;
    expect(ordemCompraFormSchema.safeParse(semMes).success).toBe(false);
    expect(
      ordemCompraFormSchema.safeParse({
        ...formValido,
        mesCompetencia: "2026-06-01",
      }).success,
    ).toBe(false);
  });

  it("exige forma de pagamento no formulário, no campo que a tela mostra", () => {
    // A forma é escolhida em `formas[0]`, que é o Combobox da tela. O cabeçalho
    // da OC é DERIVADO dela no submit e não é campo do formulário: enquanto era,
    // toda OC nova era recusada por um campo invisível e o clique em "Criar
    // ordem" não fazia nada, sem aviso.
    const r = ordemCompraFormSchema.safeParse({ ...formValido, formas: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some(
          (issue) => issue.path.join(".") === "formas.0.formaPagamentoId",
        ),
      ).toBe(true);
    }
  });

  it("LINHA DE CONTROLE: sem a forma do cabeçalho, o formulário passa", () => {
    // O que a tela manda de verdade numa OC nova. Sem esta linha, voltar a
    // exigir o cabeçalho passaria por todos os outros testes deste arquivo.
    const { formaPagamentoId: _cabecalho, ...comoATelaManda } = formValido;
    expect(ordemCompraFormSchema.safeParse(comoATelaManda).success).toBe(true);
  });

  it("exige descrição e categoria no formulário", () => {
    expect(
      ordemCompraFormSchema.safeParse({ ...formValido, descricao: "" }).success,
    ).toBe(false);
    const r = ordemCompraFormSchema.safeParse({
      ...formValido,
      categoriaId: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some(
          (issue) => issue.message === "Selecione a categoria do custo",
        ),
      ).toBe(true);
    }
  });

  it("exige condição de pagamento no formulário", () => {
    const r = ordemCompraFormSchema.safeParse({
      fornecedorId: FORNECEDOR,
      dataCompra: "2026-06-18",
      mesCompetencia: "2026-06",
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
    dataCompra: "2026-06-18",
    mesCompetencia: "2026-06",
    descricao: DESCRICAO,
    categoriaId: CATEGORIA,
    numeroDocumento: "",
    observacoes: "",
    frete: "",
    outrasDespesas: "",
    impostos: "",
    desconto: "",
    // 10 x 100,00 = 1.000,00 de total
    centrosCusto: [
      {
        centroCustoId: CENTRO,
        insumos: [{ insumoId: INSUMO, quantidade: "10", precoUnitario: "100" }],
      },
    ],
    formas: [{ formaPagamentoId: FORMA, valor: "" }],
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
        { dataVencimento: "2026-07-18", valor: "333,33", formaPagamentoId: "" },
        { dataVencimento: "2026-08-18", valor: "333,33", formaPagamentoId: "" },
        { dataVencimento: "2026-09-18", valor: "333,34", formaPagamentoId: "" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("recusa soma divergente e diz quanto falta", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: "500,00", formaPagamentoId: "" },
        { dataVencimento: "2026-08-18", valor: "488,00", formaPagamentoId: "" },
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
      parcelas: [{ dataVencimento: "2026-07-18", valor: "1012,00", formaPagamentoId: "" }],
    });
    expect(r.success).toBe(false);
    expect(
      r.error?.issues.some((i) => i.message.includes("passam R$ 12,00")),
    ).toBe(true);
  });

  it("recusa vencimento antes da data da compra, apontando a parcela", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [
        { dataVencimento: "2026-06-01", valor: "500,00", formaPagamentoId: "" },
        { dataVencimento: "2026-07-18", valor: "500,00", formaPagamentoId: "" },
      ],
    });
    expect(r.success).toBe(false);
    expect(
      r.error?.issues.some(
        (i) =>
          i.path.join(".") === "parcelas.0.dataVencimento" &&
          i.message.includes("antes da data da compra"),
      ),
    ).toBe(true);
  });

  it("vencimento no dia da compra é aceito", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [{ dataVencimento: "2026-06-18", valor: "1000,00", formaPagamentoId: "" }],
    });
    expect(r.success).toBe(true);
  });

  it("recusa parcela com valor zero", () => {
    const r = ordemCompraFormSchema.safeParse({
      ...base,
      parcelas: [
        { dataVencimento: "2026-07-18", valor: "0", formaPagamentoId: "" },
        { dataVencimento: "2026-08-18", valor: "1000,00", formaPagamentoId: "" },
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
    dataCompra: "2026-06-18",
    mesCompetencia: "2026-06-01",
    descricao: DESCRICAO,
    categoriaId: CATEGORIA,
    itens: [
      {
        insumoId: INSUMO,
        quantidade: 10,
        precoUnitario: 100,
        centroCustoId: CENTRO,
      },
    ],
    formas: [{ formaPagamentoId: FORMA, valor: 1000 }],
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

describe("ordemCompraSchema: número do documento", () => {
  it("aceita OC sem número do documento", () => {
    const r = ordemCompraSchema.safeParse(ocValida);
    expect(r.success).toBe(true);
    expect(r.success && r.data.numeroDocumento).toBeUndefined();
  });

  it("tira o espaço das pontas", () => {
    const r = ordemCompraSchema.safeParse({
      ...ocValida,
      numeroDocumento: "  NF 12345  ",
    });
    expect(r.success && r.data.numeroDocumento).toBe("NF 12345");
  });

  /**
   * Só espaço tem que virar ausente, não string em branco: o banco grava null e
   * a coluna da lista não fica com uma célula "preenchida" com nada.
   */
  it("só espaço vira ausente", () => {
    const r = ordemCompraSchema.safeParse({
      ...ocValida,
      numeroDocumento: "   ",
    });
    expect(r.success && r.data.numeroDocumento).toBeUndefined();
  });

  it("recusa acima de 60 caracteres", () => {
    const r = ordemCompraSchema.safeParse({
      ...ocValida,
      numeroDocumento: "9".repeat(61),
    });
    expect(r.success).toBe(false);
  });

  it("aceita exatamente 60 caracteres", () => {
    const r = ordemCompraSchema.safeParse({
      ...ocValida,
      numeroDocumento: "9".repeat(60),
    });
    expect(r.success).toBe(true);
  });
});
