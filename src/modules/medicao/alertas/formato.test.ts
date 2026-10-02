import { describe, expect, it } from "vitest";

import { ROTULO_TIPO_ALERTA, dataPtBr, dinheiroTexto, fraseAlerta } from "./formato";

const base = { itemCodigo: null, unidade: null, valor: null, referencia: null, data: null, comMotivo: false };

describe("fraseAlerta", () => {
  it("acumulado acima do previsto, com e sem motivo", () => {
    const a = { ...base, tipo: "acumulado_acima_previsto", itemCodigo: "01.01", unidade: "m", valor: "35.0000", referencia: "30" };
    expect(fraseAlerta({ ...a, comMotivo: true })).toBe("01.01 acumulado 35 m, acima do previsto de 30 m (motivo informado, ainda precisa de aditivo)");
    expect(fraseAlerta(a)).toBe("01.01 acumulado 35 m, acima do previsto de 30 m (sem motivo informado, precisa de aditivo)");
  });

  it("prazo: faltando, um dia, hoje e vencido", () => {
    const p = (valor: string) => fraseAlerta({ ...base, tipo: "prazo_perto_do_fim", valor, referencia: "90", data: "2026-12-01" });
    expect(p("61")).toBe("Prazo termina em 01/12/2026, em 61 dias");
    expect(p("1")).toBe("Prazo termina em 01/12/2026, em 1 dia");
    expect(p("0")).toBe("Prazo termina hoje, em 01/12/2026");
    expect(p("-5")).toBe("Prazo terminou em 01/12/2026, há 5 dias");
  });

  it("valor perto do previsto", () => {
    expect(fraseAlerta({ ...base, tipo: "valor_perto_do_previsto", valor: "102.78", referencia: "90" })).toBe(
      "Executado 102,78% do previsto (limite 90%)",
    );
  });

  it("valor do contrato diferente, com a diferença exata", () => {
    expect(
      fraseAlerta({ ...base, tipo: "valor_contrato_diferente", valor: "121590621.00", referencia: "121573053.78" }),
    ).toBe("Valor do contrato R$ 121.590.621,00 e planilha v0 R$ 121.573.053,78: diferença R$ 17.567,22");
    expect(
      fraseAlerta({ ...base, tipo: "valor_contrato_diferente", valor: "243927498.02", referencia: "243927483.49" }),
    ).toContain("diferença R$ 14,53");
  });

  it("medição aprovada sem reajuste: Nª, início do período e aniversário da data-base", () => {
    expect(
      fraseAlerta({ ...base, tipo: "medicao_sem_reajuste", valor: "3", referencia: "2026-01-01", data: "2026-01-01" }),
    ).toBe("3ª medição (início 01/01/2026) aprovada sem reajuste; aniversário da data-base em 01/01/2026");
  });

  it("reajuste provisório: Nª e o total do relatório que vale", () => {
    expect(fraseAlerta({ ...base, tipo: "reajuste_provisorio", valor: "1", referencia: "1234.56", data: "2026-01-01" })).toBe(
      "O reajuste da 1ª medição está com índices provisórios: R$ 1.234,56",
    );
  });

  it("rótulos dos dois tipos da Fase 6", () => {
    expect(ROTULO_TIPO_ALERTA.medicao_sem_reajuste).toBe("Medição aprovada sem reajuste");
    expect(ROTULO_TIPO_ALERTA.reajuste_provisorio).toBe("Reajuste provisório");
  });

  it("tipo desconhecido vira texto vazio", () => {
    expect(fraseAlerta({ ...base, tipo: "novo" })).toBe("");
  });
});

describe("formatos", () => {
  it("data sem deslocamento de fuso", () => {
    expect(dataPtBr("2026-01-01")).toBe("01/01/2026");
    expect(dataPtBr(null)).toBe("");
  });
  it("dinheiro de texto, 2 casas, sem Number", () => {
    expect(dinheiroTexto("999")).toBe("R$ 999,00");
    expect(dinheiroTexto("9007199254740993.10")).toBe("R$ 9.007.199.254.740.993,10");
    expect(dinheiroTexto("-5.5")).toBe("R$ -5,50");
  });
});
