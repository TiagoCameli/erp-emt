import { describe, expect, it } from "vitest";

import {
  chaveSaldo,
  concluirFormSchema,
  lerChaveSaldo,
  oleoFormParaEntrada,
  oleoSchema,
  osFormParaEntrada,
  osFormSchema,
  osSalvarSchema,
  pecaFormParaEntrada,
  pecaFormSchema,
  pecaSchema,
  terceiroFormParaEntrada,
  terceiroFormSchema,
  terceiroSchema,
  validarConclusao,
  type OsFormInput,
} from "@/modules/manutencao/servicos/schemas";

const EQUIP = "11111111-1111-4111-8111-111111111111";
const CENTRO = "22222222-2222-4222-8222-222222222222";
const OS = "33333333-3333-4333-8333-333333333333";
const DEP = "44444444-4444-4444-8444-444444444444";
const INSUMO = "55555555-5555-4555-8555-555555555555";
const TIPO_OLEO = "66666666-6666-4666-8666-666666666666";
const FORNECEDOR = "77777777-7777-4777-8777-777777777777";

function formOs(troca: Partial<OsFormInput> = {}): OsFormInput {
  return {
    equipamentoId: EQUIP,
    exigeCentroCusto: false,
    centroCustoId: "",
    tipo: "corretiva",
    prioridade: "media",
    descricao: "Troca da bomba",
    defeitoReportado: "",
    causaRaiz: "",
    observacoes: "",
    dataAbertura: "2026-09-23",
    medicaoAbertura: "",
    ...troca,
  };
}

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return resultado.success ? [] : (resultado.error?.issues.map((issue) => issue.message) ?? []);
}

describe("osFormSchema", () => {
  it("aceita o formulário mínimo", () => {
    expect(osFormSchema.safeParse(formOs()).success).toBe(true);
  });

  it("descrição é obrigatória", () => {
    expect(mensagens(osFormSchema.safeParse(formOs({ descricao: "   " })))).toContain("Descreva o serviço");
  });

  it("alugado sem obra é recusado no campo do centro de custo", () => {
    const resultado = osFormSchema.safeParse(formOs({ exigeCentroCusto: true, centroCustoId: "" }));
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.path).toEqual(["centroCustoId"]);
  });

  it("medição: vazia passa, número pt-BR passa, lixo e 5 casas não", () => {
    expect(osFormSchema.safeParse(formOs({ medicaoAbertura: "1.234,5" })).success).toBe(true);
    expect(osFormSchema.safeParse(formOs({ medicaoAbertura: "abc" })).success).toBe(false);
    expect(osFormSchema.safeParse(formOs({ medicaoAbertura: "1,23456" })).success).toBe(false);
  });
});

describe("osFormParaEntrada", () => {
  it("próprio/Colorado: o centro NÃO vai, mesmo se algo sobrou no campo", () => {
    const entrada = osFormParaEntrada(formOs({ exigeCentroCusto: false, centroCustoId: CENTRO }));
    expect(entrada.centroCustoId).toBeNull();
  });

  it("alugado: o centro escolhido vai", () => {
    expect(osFormParaEntrada(formOs({ exigeCentroCusto: true, centroCustoId: CENTRO })).centroCustoId).toBe(CENTRO);
  });

  it("texto vazio vira nulo; medição vira número; data vai como texto, sem fuso", () => {
    const entrada = osFormParaEntrada(formOs({ defeitoReportado: "  ", medicaoAbertura: "1.234,5" }));
    expect(entrada.defeitoReportado).toBeNull();
    expect(entrada.medicaoAbertura).toBe(1234.5);
    expect(entrada.dataAbertura).toBe("2026-09-23");
    expect(osSalvarSchema.safeParse(entrada).success).toBe(true);
  });

  it("a entrada não carrega custo nenhum", () => {
    const chaves = Object.keys(osFormParaEntrada(formOs()));
    expect(chaves.some((chave) => chave.toLowerCase().includes("custo") && chave !== "centroCustoId")).toBe(false);
  });
});

describe("osSalvarSchema", () => {
  it("medição com mais de 4 casas é recusada no servidor", () => {
    const entrada = { ...osFormParaEntrada(formOs()), medicaoAbertura: 1.23456 };
    expect(osSalvarSchema.safeParse(entrada).success).toBe(false);
  });

  it("medição negativa é recusada", () => {
    const entrada = { ...osFormParaEntrada(formOs()), medicaoAbertura: -1 };
    expect(osSalvarSchema.safeParse(entrada).success).toBe(false);
  });
});

describe("conclusão", () => {
  it("data obrigatória, medição opcional", () => {
    expect(concluirFormSchema.safeParse({ dataConclusao: "2026-09-23", medicaoConclusao: "" }).success).toBe(true);
    expect(concluirFormSchema.safeParse({ dataConclusao: "", medicaoConclusao: "" }).success).toBe(false);
  });

  it("validarConclusao converte a medição e aponta o erro", () => {
    expect(validarConclusao("2026-09-23", "")).toEqual({
      ok: true,
      dados: { dataConclusao: "2026-09-23", medicaoConclusao: null },
    });
    expect(validarConclusao("2026-09-23", "1.500,25")).toEqual({
      ok: true,
      dados: { dataConclusao: "2026-09-23", medicaoConclusao: 1500.25 },
    });
    expect(validarConclusao("2026-09-23", "x").ok).toBe(false);
    expect(validarConclusao("23/09/2026", "").ok).toBe(false);
  });
});

describe("linhas", () => {
  it("chave do saldo vai e volta; lixo não", () => {
    expect(lerChaveSaldo(chaveSaldo(DEP, INSUMO))).toEqual({ depositoId: DEP, insumoId: INSUMO });
    expect(lerChaveSaldo("x:y")).toBeNull();
    expect(lerChaveSaldo(`${DEP}:${INSUMO}:extra`)).toBeNull();
  });

  it("peça: quantidade zero é recusada no form; 4 casas passa", () => {
    const base = { saldo: chaveSaldo(DEP, INSUMO), observacoes: "" };
    expect(pecaFormSchema.safeParse({ ...base, quantidade: "0" }).success).toBe(false);
    expect(pecaFormSchema.safeParse({ ...base, quantidade: "2,5" }).success).toBe(true);
    const entrada = pecaFormParaEntrada(OS, { ...base, quantidade: "0,1234" });
    expect(entrada).toEqual({ osId: OS, depositoId: DEP, insumoId: INSUMO, quantidade: 0.1234, observacoes: null });
    expect(pecaSchema.safeParse(entrada).success).toBe(true);
  });

  it("óleo: o tipo vem do item do almoxarifado, a unidade do form", () => {
    const form = { saldo: chaveSaldo(DEP, INSUMO), quantidade: "15", unidade: "L" as const };
    expect(oleoFormParaEntrada(OS, TIPO_OLEO, form)).toEqual({
      osId: OS,
      tipoOleoId: TIPO_OLEO,
      depositoId: DEP,
      insumoId: INSUMO,
      quantidade: 15,
      unidade: "L",
    });
    expect(oleoSchema.safeParse(oleoFormParaEntrada(OS, TIPO_OLEO, form)).success).toBe(true);
  });

  it("terceiro: fornecedor obrigatório; valor com 4 casas; NF vazia vira nulo", () => {
    const base = { descricao: "Retífica", valor: "1.250,4567", notaFiscal: "" };
    expect(mensagens(terceiroFormSchema.safeParse({ ...base, fornecedorId: "" }))).toContain(
      "Escolha o fornecedor do serviço",
    );
    const entrada = terceiroFormParaEntrada(OS, { ...base, fornecedorId: FORNECEDOR });
    expect(entrada).toEqual({
      osId: OS,
      fornecedorId: FORNECEDOR,
      descricao: "Retífica",
      valor: 1250.4567,
      notaFiscal: null,
    });
    expect(terceiroSchema.safeParse(entrada).success).toBe(true);
    expect(terceiroSchema.safeParse({ ...entrada, fornecedorId: null }).success).toBe(false);
  });

  it("terceiro: valor com 5 casas é recusado nos dois lados", () => {
    expect(
      terceiroFormSchema.safeParse({ fornecedorId: FORNECEDOR, descricao: "x", valor: "1,23456", notaFiscal: "" })
        .success,
    ).toBe(false);
    expect(
      terceiroSchema.safeParse({ osId: OS, fornecedorId: FORNECEDOR, descricao: "x", valor: 1.23456, notaFiscal: null })
        .success,
    ).toBe(false);
  });
});
