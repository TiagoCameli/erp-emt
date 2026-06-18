import { describe, expect, it } from "vitest";

import {
  formatarBRL,
  formatarData,
  formatarDataHora,
  formatarPercentual,
  formatarQuantidade,
} from "@/lib/formatadores";

/**
 * Intl em pt-BR usa espaço não separável (U+00A0) entre "R$" e o número.
 * Normaliza para espaço comum para os expects ficarem legíveis.
 */
function normalizar(texto: string): string {
  return texto.replace(/ /g, " ");
}

describe("formatarBRL", () => {
  it("formata número no padrão brasileiro", () => {
    expect(normalizar(formatarBRL(1234.56))).toBe("R$ 1.234,56");
  });

  it("formata milhões com separador de milhar", () => {
    expect(normalizar(formatarBRL(1234567.89))).toBe("R$ 1.234.567,89");
  });

  it("sempre exibe duas casas decimais", () => {
    expect(normalizar(formatarBRL(10))).toBe("R$ 10,00");
    expect(normalizar(formatarBRL(0.5))).toBe("R$ 0,50");
  });

  it("arredonda para duas casas", () => {
    expect(normalizar(formatarBRL(1.005))).toBe("R$ 1,01");
    expect(normalizar(formatarBRL(2.344))).toBe("R$ 2,34");
  });

  it("aceita string numérica", () => {
    expect(normalizar(formatarBRL("1234.56"))).toBe("R$ 1.234,56");
  });

  it("formata valor negativo com sinal", () => {
    expect(normalizar(formatarBRL(-1234.56))).toBe("-R$ 1.234,56");
  });

  it("retorna R$ 0,00 para null, undefined, NaN e string vazia", () => {
    expect(normalizar(formatarBRL(null))).toBe("R$ 0,00");
    expect(normalizar(formatarBRL(undefined))).toBe("R$ 0,00");
    expect(normalizar(formatarBRL(Number.NaN))).toBe("R$ 0,00");
    expect(normalizar(formatarBRL(""))).toBe("R$ 0,00");
    expect(normalizar(formatarBRL("abc"))).toBe("R$ 0,00");
  });

  it("formata zero como R$ 0,00", () => {
    expect(normalizar(formatarBRL(0))).toBe("R$ 0,00");
  });
});

describe("formatarQuantidade", () => {
  it("usa até 3 casas decimais e milhar pt-BR", () => {
    expect(formatarQuantidade(1234567.8915)).toBe("1.234.567,892");
  });

  it("não força casas decimais em inteiros", () => {
    expect(formatarQuantidade(1000)).toBe("1.000");
    expect(formatarQuantidade(3)).toBe("3");
  });

  it("mantém casas decimais existentes sem completar com zeros", () => {
    expect(formatarQuantidade(0.5)).toBe("0,5");
    expect(formatarQuantidade(12.25)).toBe("12,25");
  });

  it("aceita string numérica", () => {
    expect(formatarQuantidade("1234.5")).toBe("1.234,5");
  });

  it("retorna 0 para null, undefined, NaN e string vazia", () => {
    expect(formatarQuantidade(null)).toBe("0");
    expect(formatarQuantidade(undefined)).toBe("0");
    expect(formatarQuantidade(Number.NaN)).toBe("0");
    expect(formatarQuantidade("")).toBe("0");
  });
});

describe("formatarPercentual", () => {
  it("formata com vírgula e sufixo %", () => {
    expect(formatarPercentual(12.5)).toBe("12,5%");
  });

  it("usa até 2 casas decimais com arredondamento", () => {
    expect(formatarPercentual(12.345)).toBe("12,35%");
  });

  it("não força casas decimais em inteiros", () => {
    expect(formatarPercentual(100)).toBe("100%");
  });

  it("aceita string numérica", () => {
    expect(formatarPercentual("33.33")).toBe("33,33%");
  });

  it("retorna 0% para null, undefined, NaN e string vazia", () => {
    expect(formatarPercentual(null)).toBe("0%");
    expect(formatarPercentual(undefined)).toBe("0%");
    expect(formatarPercentual(Number.NaN)).toBe("0%");
    expect(formatarPercentual("")).toBe("0%");
  });
});

describe("formatarData", () => {
  it("converte UTC para America/Rio_Branco (UTC-5)", () => {
    expect(formatarData("2026-06-11T12:00:00Z")).toBe("11/06/2026");
  });

  it("muda o dia quando o horário UTC cruza a meia-noite local", () => {
    // 03:00 UTC = 22:00 do dia anterior em Rio Branco
    expect(formatarData("2026-06-11T03:00:00Z")).toBe("10/06/2026");
  });

  it("aceita objeto Date", () => {
    expect(formatarData(new Date("2026-06-11T12:00:00Z"))).toBe("11/06/2026");
  });

  it("preserva o dia em string date-only (coluna `date`), sem deslocar", () => {
    // Sem o ajuste, new Date('2026-06-12') seria UTC meia-noite e cairia em
    // 11/06/2026 ao exibir em Rio Branco (UTC-5).
    expect(formatarData("2026-06-12")).toBe("12/06/2026");
    expect(formatarData("2026-01-01")).toBe("01/01/2026");
    expect(formatarData("2026-12-31")).toBe("31/12/2026");
  });

  it("retorna vazio para null, undefined e data inválida", () => {
    expect(formatarData(null)).toBe("");
    expect(formatarData(undefined)).toBe("");
    expect(formatarData("nao-e-data")).toBe("");
  });
});

describe("formatarDataHora", () => {
  it("converte 12:00 UTC para 07:00 em Rio Branco", () => {
    expect(formatarDataHora("2026-06-11T12:00:00Z")).toBe("11/06/2026 07:00");
  });

  it("muda dia e hora quando cruza a meia-noite local", () => {
    expect(formatarDataHora("2026-06-11T03:30:00Z")).toBe("10/06/2026 22:30");
  });

  it("aceita objeto Date", () => {
    expect(formatarDataHora(new Date("2026-06-11T12:00:00Z"))).toBe(
      "11/06/2026 07:00",
    );
  });

  it("ancora string date-only na meia-noite local, sem deslocar o dia", () => {
    expect(formatarDataHora("2026-06-12")).toBe("12/06/2026 00:00");
  });

  it("retorna vazio para null, undefined e data inválida", () => {
    expect(formatarDataHora(null)).toBe("");
    expect(formatarDataHora(undefined)).toBe("");
    expect(formatarDataHora("nao-e-data")).toBe("");
  });
});
