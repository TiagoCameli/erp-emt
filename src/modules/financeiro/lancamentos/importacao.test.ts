import { describe, expect, it } from "vitest";

import {
  COLUNAS_LANCAMENTO,
  parseData,
  parseListaDatas,
  parseValor,
} from "@/modules/financeiro/lancamentos/importacao";

describe("parseData", () => {
  it("aceita dd/mm/aaaa, que é como a planilha da obra vem", () => {
    expect(parseData("07/08/2026")).toBe("2026-08-07");
    expect(parseData("7/8/2026")).toBe("2026-08-07");
  });

  it("aceita serial do Excel, que aparece quando a coluna perde o formato", () => {
    // Serial 45658 é 01/01/2025; 45811 são 153 dias depois, 03/06/2025.
    // Metade das abas do arquivo real vem com a data assim.
    expect(parseData(45811)).toBe("2025-06-03");
    expect(parseData("45811")).toBe("2025-06-03");
    expect(parseData(45658)).toBe("2025-01-01");
  });

  it("aceita célula de data de verdade", () => {
    expect(parseData(new Date(Date.UTC(2026, 7, 7)))).toBe("2026-08-07");
  });

  it("aceita ISO", () => {
    expect(parseData("2026-08-07")).toBe("2026-08-07");
  });

  it("devolve null no que não é data", () => {
    expect(parseData("")).toBeNull();
    expect(parseData("-")).toBeNull();
    expect(parseData("À Vista")).toBeNull();
    // Número fora da faixa de data não vira data por acidente.
    expect(parseData(1500)).toBeNull();
    expect(parseData(0)).toBeNull();
  });
});

describe("parseListaDatas", () => {
  it("uma data só", () => {
    expect(parseListaDatas("10/08/2026")).toEqual(["2026-08-10"]);
  });

  it("parcelado com ponto e vírgula, que é o formato do arquivo real", () => {
    expect(parseListaDatas("24/03/2026; 26/03/2026")).toEqual([
      "2026-03-24",
      "2026-03-26",
    ]);
  });

  it("aceita barra vertical e quebra de linha", () => {
    expect(parseListaDatas("10/08/2026|10/09/2026")).toHaveLength(2);
    expect(parseListaDatas("10/08/2026\n10/09/2026")).toHaveLength(2);
  });

  it("vazio e traço viram lista vazia, não erro", () => {
    expect(parseListaDatas("")).toEqual([]);
    expect(parseListaDatas("-")).toEqual([]);
    expect(parseListaDatas(null)).toEqual([]);
  });

  it("descarta pedaço que não é data em vez de quebrar a carga", () => {
    expect(parseListaDatas("10/08/2026; xxx")).toEqual(["2026-08-10"]);
  });
});

describe("parseValor", () => {
  it("formato brasileiro com milhar", () => {
    expect(parseValor("1.321,86")).toBe(1321.86);
    expect(parseValor("90.021,00")).toBe(90021);
  });

  it("ponto como decimal quando não há vírgula", () => {
    expect(parseValor("1321.86")).toBe(1321.86);
    expect(parseValor(813.15)).toBe(813.15);
  });

  it("inteiro", () => {
    expect(parseValor("60")).toBe(60);
    expect(parseValor(18)).toBe(18);
  });

  it("aguenta símbolo de moeda", () => {
    expect(parseValor("R$ 1.500,00")).toBe(1500);
  });

  it("NaN no que não é número, para a coluna acusar a linha", () => {
    expect(parseValor("abc")).toBeNaN();
    expect(parseValor("")).toBeNaN();
  });
});

describe("coluna Competência", () => {
  const coluna = COLUNAS_LANCAMENTO.find((c) => c.chave === "competencia");
  const transformar = (valor: unknown) => coluna!.transformar!(valor);

  it("aceita mm/aaaa, que é como competência costuma ser escrita", () => {
    expect(transformar("07/2026")).toBe("2026-07-01");
    expect(transformar("7/2026")).toBe("2026-07-01");
  });

  it("cai para o dia 1 quando vem data cheia", () => {
    // O banco só aceita competência no dia 1 (CHECK
    // lancamentos_mes_competencia_dia1), e 6.941 das 7.253 linhas do
    // arquivo real do Tiago vêm com a data cheia.
    expect(transformar("31/07/2025")).toBe("2025-07-01");
    expect(transformar("2026-08-07")).toBe("2026-08-01");
    expect(transformar(new Date(Date.UTC(2026, 7, 7)))).toBe("2026-08-01");
  });

  it("reclama do que não é mês nem data", () => {
    expect(() => transformar("julho")).toThrow(/competência/);
  });
});
