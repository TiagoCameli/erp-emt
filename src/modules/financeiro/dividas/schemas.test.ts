import { describe, expect, it } from "vitest";

import {
  contemplacaoSchema,
  contratoFormSchema,
  contratoSchema,
  cotaSchema,
  eventoSchema,
  linhasCronogramaSchema,
  rotulo,
  ROTULO_TIPO_CONTRATO,
} from "@/modules/financeiro/dividas/schemas";

// Id de md5 (variante fora do RFC), como os da carga: o schema tem que aceitar.
const ID = "c4e0f922-3aec-8c72-7089-225523e04557";

function contrato(parcial: Record<string, unknown> = {}) {
  return {
    credor: "Banco do Brasil",
    numero: "123/2026",
    tipo: "emprestimo",
    centroCustoId: ID,
    lancamentoId: "",
    lancamentoLiberacaoId: ID,
    valorContratado: 100000,
    valorLiberado: 98000,
    dataLiberacao: "2026-01-15",
    taxaAm: 2,
    indexador: "pre",
    sistema: "price",
    carenciaMeses: 0,
    parcelas: 12,
    primeiroVencimento: "2026-02-15",
    ...parcial,
  };
}

function primeiraMensagem(r: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return r.success ? undefined : r.error?.issues[0]?.message;
}

describe("contratoSchema", () => {
  it("aceita o contrato com id de md5 e lançamento vazio", () => {
    expect(contratoSchema.safeParse(contrato()).success).toBe(true);
  });

  it("primeiro vencimento antes ou no dia da liberação é recusado", () => {
    const r = contratoSchema.safeParse(contrato({ primeiroVencimento: "2026-01-15" }));
    expect(primeiraMensagem(r)).toBe("O primeiro vencimento precisa ser depois da liberação");
  });

  it("carência igual às parcelas é recusada", () => {
    const r = contratoSchema.safeParse(contrato({ carenciaMeses: 12 }));
    expect(primeiraMensagem(r)).toBe("A carência precisa ser menor que o número de parcelas");
  });

  it("valor liberado zero e tipo desconhecido são recusados", () => {
    expect(primeiraMensagem(contratoSchema.safeParse(contrato({ valorLiberado: 0 })))).toBe(
      "Valor liberado precisa ser maior que zero",
    );
    expect(contratoSchema.safeParse(contrato({ tipo: "agiota" })).success).toBe(false);
  });

  it("etapa que não é id é recusada com a mensagem do campo", () => {
    expect(primeiraMensagem(contratoSchema.safeParse(contrato({ centroCustoId: "x" })))).toBe(
      "Escolha a etapa do contrato",
    );
  });
});

describe("contratoFormSchema", () => {
  const form = {
    credor: "BB",
    numero: "1",
    tipo: "emprestimo",
    centroCustoId: ID,
    lancamentoId: "",
    lancamentoLiberacaoId: "",
    valorContratado: "100.000,00",
    valorLiberado: "100.000,00",
    dataLiberacao: "2026-01-15",
    taxaAm: "2",
    indexador: "pre",
    sistema: "price",
    carenciaMeses: "",
    parcelas: "12",
    primeiroVencimento: "2026-02-15",
    garantia: "",
    status: "ativo",
    observacoes: "",
  };

  it("carência vazia vale zero", () => {
    expect(contratoFormSchema.safeParse(form).success).toBe(true);
  });

  it("parcelas em branco e carência maior recusam", () => {
    expect(primeiraMensagem(contratoFormSchema.safeParse({ ...form, parcelas: "" }))).toBe("Informe as parcelas");
    expect(primeiraMensagem(contratoFormSchema.safeParse({ ...form, carenciaMeses: "12" }))).toBe(
      "A carência precisa ser menor que o número de parcelas",
    );
  });
});

describe("cronograma e eventos", () => {
  it("linha com mais de duas casas e vencimento repetido são recusados", () => {
    const linha = { vencimento: "2026-02-15", principal: 100, juros: 1.005, encargos: 0 };
    expect(primeiraMensagem(linhasCronogramaSchema.safeParse([linha]))).toBe("Juros com mais de duas casas");
    const ok = { ...linha, juros: 1.01 };
    expect(primeiraMensagem(linhasCronogramaSchema.safeParse([ok, ok]))).toBe("Duas parcelas com o mesmo vencimento");
    expect(linhasCronogramaSchema.safeParse([ok]).success).toBe(true);
  });

  it("evento exige motivo; renegociação exige o cronograma novo e dispensa o valor", () => {
    const base = { contratoId: ID, tipo: "amortizacao", data: "2026-06-15", valor: 1000, motivo: "Sobra de caixa" };
    expect(eventoSchema.safeParse(base).success).toBe(true);
    expect(primeiraMensagem(eventoSchema.safeParse({ ...base, motivo: "  " }))).toBe("Informe o motivo do evento");
    expect(primeiraMensagem(eventoSchema.safeParse({ ...base, valor: undefined }))).toBe("Informe o valor do evento");
    expect(primeiraMensagem(eventoSchema.safeParse({ ...base, tipo: "renegociacao", valor: undefined }))).toBe(
      "Informe o cronograma renegociado",
    );
    expect(
      eventoSchema.safeParse({
        ...base,
        tipo: "renegociacao",
        valor: undefined,
        linhas: [{ vencimento: "2026-07-15", principal: 500, juros: 0, encargos: 0 }],
      }).success,
    ).toBe(true);
  });
});

describe("consórcio", () => {
  it("cota sem centro e sem lançamento é válida", () => {
    const cota = {
      administradora: "Porto",
      grupo: "1234",
      cota: "56",
      bem: "Caminhão",
      centroCustoId: "",
      lancamentoId: "",
      valorCredito: 300000,
      prazo: 72,
      taxaAdmPct: 16,
      fundoReservaPct: 2,
      primeiroVencimento: "2026-02-10",
    };
    expect(cotaSchema.safeParse(cota).success).toBe(true);
    expect(cotaSchema.safeParse({ ...cota, prazo: 0 }).success).toBe(false);
  });

  it("contemplação por lance exige o lance; por sorteio não", () => {
    const base = { cotaId: ID, data: "2026-09-10", forma: "sorteio", valorCarta: 300000, bemCentroId: "" };
    expect(contemplacaoSchema.safeParse(base).success).toBe(true);
    expect(primeiraMensagem(contemplacaoSchema.safeParse({ ...base, forma: "lance" }))).toBe("Informe o valor do lance");
    expect(contemplacaoSchema.safeParse({ ...base, forma: "lance", valorLance: 50000 }).success).toBe(true);
  });
});

describe("rotulo", () => {
  it("devolve o rótulo, ou o próprio código quando a lista não conhece", () => {
    expect(rotulo(ROTULO_TIPO_CONTRATO, "finame")).toBe("FINAME");
    expect(rotulo(ROTULO_TIPO_CONTRATO, "novo")).toBe("novo");
  });
});
