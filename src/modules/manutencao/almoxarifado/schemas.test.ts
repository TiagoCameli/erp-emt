import { describe, expect, it } from "vitest";

import {
  depositoSchema,
  edicaoEntradaDoForm,
  edicaoEntradaFormSchema,
  edicaoEntradaSchema,
  entradaDoForm,
  entradaFormSchema,
  entradaSchema,
  itensParaRpc,
  pecaDoForm,
  pecaFormSchema,
  pecaSchema,
  type EntradaFormInput,
  type PecaFormInput,
} from "@/modules/manutencao/almoxarifado/schemas";

const DEPOSITO = "11111111-1111-4111-8111-111111111111";
const FORNECEDOR = "22222222-2222-4222-8222-222222222222";
const INSUMO_A = "33333333-3333-4333-8333-333333333333";
const INSUMO_B = "44444444-4444-4444-8444-444444444444";
const TIPO_OLEO = "55555555-5555-4555-8555-555555555555";
const EQUIPAMENTO = "66666666-6666-4666-8666-666666666666";

function entradaValida(): EntradaFormInput {
  return {
    depositoId: DEPOSITO,
    fornecedorId: FORNECEDOR,
    notaFiscal: " 12345 ",
    data: "2026-09-23",
    observacoes: "",
    itens: [
      { insumoId: INSUMO_A, quantidade: "10", valorUnitario: "6,3947" },
      { insumoId: INSUMO_B, quantidade: "1.234,5", valorUnitario: "0" },
    ],
  };
}

function pecaValida(): PecaFormInput {
  return {
    insumoId: INSUMO_A,
    tipoOleoId: "",
    estoqueMinimo: "",
    estoqueMaximo: "",
    equipamentoIds: [],
    observacoes: "",
    ativo: true,
  };
}

describe("entradaFormSchema", () => {
  it("aceita a NF com várias peças", () => {
    expect(entradaFormSchema.safeParse(entradaValida()).success).toBe(true);
  });

  it("exige depósito, fornecedor e data", () => {
    const resultado = entradaFormSchema.safeParse({
      ...entradaValida(),
      depositoId: "",
      fornecedorId: "",
      data: "",
    });
    expect(resultado.success).toBe(false);
    const caminhos = resultado.success ? [] : resultado.error.issues.map((i) => i.path.join("."));
    expect(caminhos).toEqual(expect.arrayContaining(["depositoId", "fornecedorId", "data"]));
  });

  it("exige ao menos uma peça", () => {
    const resultado = entradaFormSchema.safeParse({ ...entradaValida(), itens: [] });
    expect(resultado.success).toBe(false);
  });

  it("recusa quantidade zero, vazia ou com 5 casas", () => {
    for (const quantidade of ["0", "", "1,23456", "abc"]) {
      const dados = entradaValida();
      dados.itens[0].quantidade = quantidade;
      const resultado = entradaFormSchema.safeParse(dados);
      expect(resultado.success, `quantidade "${quantidade}"`).toBe(false);
    }
  });

  it("aceita valor unitário zero (doação, garantia) mas não vazio", () => {
    const dados = entradaValida();
    dados.itens[0].valorUnitario = "0";
    expect(entradaFormSchema.safeParse(dados).success).toBe(true);
    dados.itens[0].valorUnitario = "";
    expect(entradaFormSchema.safeParse(dados).success).toBe(false);
  });

  it("recusa valor unitário com 5 casas", () => {
    const dados = entradaValida();
    dados.itens[0].valorUnitario = "6,39471";
    expect(entradaFormSchema.safeParse(dados).success).toBe(false);
  });
});

describe("entradaDoForm e itensParaRpc", () => {
  it("converte o texto pt-BR em número e o servidor aceita", () => {
    const form = entradaFormSchema.parse(entradaValida());
    const entrada = entradaDoForm(form);
    expect(entrada.notaFiscal).toBe("12345");
    expect(entrada.itens).toEqual([
      { insumoId: INSUMO_A, quantidade: 10, valorUnitario: 6.3947 },
      { insumoId: INSUMO_B, quantidade: 1234.5, valorUnitario: 0 },
    ]);
    expect(entradaSchema.safeParse(entrada).success).toBe(true);
  });

  it("monta o p_itens com os nomes que a RPC lê", () => {
    const entrada = entradaDoForm(entradaFormSchema.parse(entradaValida()));
    expect(itensParaRpc(entrada.itens)).toEqual([
      { insumo_id: INSUMO_A, quantidade: 10, valor_unitario: 6.3947 },
      { insumo_id: INSUMO_B, quantidade: 1234.5, valor_unitario: 0 },
    ]);
  });
});

describe("entradaSchema (servidor)", () => {
  it("recusa número com mais de 4 casas mesmo que a tela deixe passar", () => {
    const entrada = entradaDoForm(entradaFormSchema.parse(entradaValida()));
    entrada.itens[0].valorUnitario = 6.39471;
    expect(entradaSchema.safeParse(entrada).success).toBe(false);
  });

  it("recusa quantidade negativa ou NaN", () => {
    const entrada = entradaDoForm(entradaFormSchema.parse(entradaValida()));
    entrada.itens[0].quantidade = -1;
    expect(entradaSchema.safeParse(entrada).success).toBe(false);
    entrada.itens[0].quantidade = Number.NaN;
    expect(entradaSchema.safeParse(entrada).success).toBe(false);
  });
});

describe("edição de entrada", () => {
  it("converte e valida os cinco campos que a RPC deixa mudar", () => {
    const form = edicaoEntradaFormSchema.parse({
      fornecedorId: FORNECEDOR,
      notaFiscal: "",
      data: "2026-09-01",
      quantidade: "2,5",
      valorUnitario: "12.5",
    });
    const dados = edicaoEntradaDoForm(form);
    expect(dados).toEqual({
      fornecedorId: FORNECEDOR,
      notaFiscal: "",
      data: "2026-09-01",
      quantidade: 2.5,
      valorUnitario: 12.5,
    });
    expect(edicaoEntradaSchema.safeParse(dados).success).toBe(true);
  });

  it("recusa quantidade zero", () => {
    const resultado = edicaoEntradaFormSchema.safeParse({
      fornecedorId: FORNECEDOR,
      notaFiscal: "",
      data: "2026-09-01",
      quantidade: "0",
      valorUnitario: "1",
    });
    expect(resultado.success).toBe(false);
  });
});

describe("pecaFormSchema e pecaDoForm", () => {
  it("vazio vira null: sem tipo de óleo, sem mínimo, sem máximo, sem observação", () => {
    const peca = pecaDoForm(pecaFormSchema.parse(pecaValida()));
    expect(peca).toEqual({
      insumoId: INSUMO_A,
      tipoOleoId: null,
      estoqueMinimo: null,
      estoqueMaximo: null,
      equipamentoIds: [],
      observacoes: null,
      ativo: true,
    });
    expect(pecaSchema.safeParse(peca).success).toBe(true);
  });

  it("converte mínimo e máximo e tira equipamento repetido", () => {
    const peca = pecaDoForm(
      pecaFormSchema.parse({
        ...pecaValida(),
        tipoOleoId: TIPO_OLEO,
        estoqueMinimo: "2,5",
        estoqueMaximo: "10",
        equipamentoIds: [EQUIPAMENTO, EQUIPAMENTO],
        observacoes: " filtro ",
      }),
    );
    expect(peca.tipoOleoId).toBe(TIPO_OLEO);
    expect(peca.estoqueMinimo).toBe(2.5);
    expect(peca.estoqueMaximo).toBe(10);
    expect(peca.equipamentoIds).toEqual([EQUIPAMENTO]);
    expect(peca.observacoes).toBe("filtro");
  });

  it("recusa máximo menor que o mínimo, apontando o máximo", () => {
    const resultado = pecaFormSchema.safeParse({
      ...pecaValida(),
      estoqueMinimo: "10",
      estoqueMaximo: "5",
    });
    expect(resultado.success).toBe(false);
    expect(resultado.success ? [] : resultado.error.issues.map((i) => i.path.join("."))).toContain(
      "estoqueMaximo",
    );
  });

  it("recusa estoque com texto ou 5 casas", () => {
    expect(pecaFormSchema.safeParse({ ...pecaValida(), estoqueMinimo: "dez" }).success).toBe(false);
    expect(pecaFormSchema.safeParse({ ...pecaValida(), estoqueMaximo: "1,23456" }).success).toBe(false);
  });

  it("aceita estoque zero", () => {
    expect(pecaFormSchema.safeParse({ ...pecaValida(), estoqueMinimo: "0" }).success).toBe(true);
  });

  it("exige o insumo", () => {
    expect(pecaFormSchema.safeParse({ ...pecaValida(), insumoId: "" }).success).toBe(false);
  });

  it("recusa tipo de óleo que não é id", () => {
    expect(pecaFormSchema.safeParse({ ...pecaValida(), tipoOleoId: "motor" }).success).toBe(false);
  });

  it("o servidor recusa máximo menor que o mínimo", () => {
    const peca = pecaDoForm(pecaFormSchema.parse(pecaValida()));
    expect(pecaSchema.safeParse({ ...peca, estoqueMinimo: 5, estoqueMaximo: 1 }).success).toBe(false);
  });
});

describe("depositoSchema", () => {
  it("exige nome com 2 caracteres ou mais", () => {
    expect(depositoSchema.safeParse({ nome: " A ", endereco: "", ativo: true }).success).toBe(false);
    expect(
      depositoSchema.safeParse({ nome: "Almoxarifado Central", endereco: "", ativo: true }).success,
    ).toBe(true);
  });
});
