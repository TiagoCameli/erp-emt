import { describe, expect, it } from "vitest";

import {
  dataNoFuturo,
  editarMedicaoSchema,
  formParaMedicao,
  leituraMenorQueUltima,
  leituraParaNumero,
  leituraParaTexto,
  LEITURA_MAXIMA,
  medicaoFormSchema,
  paramData,
  paramPagina,
  paramUuid,
  registrarMedicaoSchema,
} from "@/modules/manutencao/medicoes/schemas";

const EQUIPAMENTO = "3f1c2a4e-9b7d-4c1a-8e2f-0a1b2c3d4e5f";
const FORM_VALIDO = { equipamentoId: EQUIPAMENTO, data: "2026-09-23", valor: "12.345,5", observacoes: "" };

describe("leitura digitada", () => {
  it("lê pt-BR com milhar e até 4 casas", () => {
    expect(leituraParaNumero("12.345,5")).toBe(12345.5);
    expect(leituraParaNumero("1234,5678")).toBe(1234.5678);
    expect(leituraParaNumero("0")).toBe(0);
  });

  it("ponto único com até 4 casas é decimal, não milhar", () => {
    expect(leituraParaNumero("1234.5")).toBe(1234.5);
  });

  it("recusa mais de 4 casas, vazio e texto", () => {
    expect(leituraParaNumero("1,23456")).toBeUndefined();
    expect(leituraParaNumero("")).toBeUndefined();
    expect(leituraParaNumero("mil")).toBeUndefined();
  });

  it("o número gravado volta para o campo com vírgula", () => {
    expect(leituraParaTexto(1234.5678)).toBe("1234,5678");
    expect(leituraParaNumero(leituraParaTexto(1234.5678))).toBe(1234.5678);
    expect(leituraParaTexto(800)).toBe("800");
  });
});

describe("aviso de leitura menor que a última", () => {
  it("avisa só quando é estritamente menor", () => {
    expect(leituraMenorQueUltima(99.9, 100)).toBe(true);
    expect(leituraMenorQueUltima(100, 100)).toBe(false);
    expect(leituraMenorQueUltima(100.0001, 100)).toBe(false);
  });

  it("sem leitura anterior ou sem número digitado, não avisa", () => {
    expect(leituraMenorQueUltima(5, null)).toBe(false);
    expect(leituraMenorQueUltima(5, undefined)).toBe(false);
    expect(leituraMenorQueUltima(undefined, 100)).toBe(false);
  });
});

describe("formulário de leitura", () => {
  it("aceita o válido e converte para a action", () => {
    expect(medicaoFormSchema.safeParse(FORM_VALIDO).success).toBe(true);
    const dados = formParaMedicao({ ...FORM_VALIDO, observacoes: "  painel novo " });
    expect(dados).toEqual({ equipamentoId: EQUIPAMENTO, data: "2026-09-23", valor: 12345.5, observacoes: "painel novo" });
    expect(registrarMedicaoSchema.safeParse(dados).success).toBe(true);
  });

  it("exige equipamento, data e leitura", () => {
    expect(medicaoFormSchema.safeParse({ ...FORM_VALIDO, equipamentoId: "" }).success).toBe(false);
    expect(medicaoFormSchema.safeParse({ ...FORM_VALIDO, data: "" }).success).toBe(false);
    expect(medicaoFormSchema.safeParse({ ...FORM_VALIDO, data: "23/09/2026" }).success).toBe(false);
    expect(medicaoFormSchema.safeParse({ ...FORM_VALIDO, valor: "" }).success).toBe(false);
    expect(medicaoFormSchema.safeParse({ ...FORM_VALIDO, valor: "1,23456" }).success).toBe(false);
  });

  it("recusa leitura acima da coluna NUMERIC(14,4)", () => {
    expect(medicaoFormSchema.safeParse({ ...FORM_VALIDO, valor: "99999999999" }).success).toBe(false);
  });
});

describe("schemas do servidor", () => {
  it("recusam negativo, mais de 4 casas e acima do teto", () => {
    const base = { equipamentoId: EQUIPAMENTO, data: "2026-09-23", observacoes: "" };
    expect(registrarMedicaoSchema.safeParse({ ...base, valor: -1 }).success).toBe(false);
    expect(registrarMedicaoSchema.safeParse({ ...base, valor: 1.23456 }).success).toBe(false);
    expect(registrarMedicaoSchema.safeParse({ ...base, valor: LEITURA_MAXIMA + 1 }).success).toBe(false);
    expect(registrarMedicaoSchema.safeParse({ ...base, valor: 1234.5678 }).success).toBe(true);
  });

  it("editar exige o id da leitura", () => {
    const base = { data: "2026-09-23", valor: 10, observacoes: "" };
    expect(editarMedicaoSchema.safeParse({ ...base, id: "x" }).success).toBe(false);
    expect(editarMedicaoSchema.safeParse({ ...base, id: EQUIPAMENTO }).success).toBe(true);
  });

  it("data no futuro compara o dia, sem fuso", () => {
    expect(dataNoFuturo("2026-09-24", "2026-09-23")).toBe(true);
    expect(dataNoFuturo("2026-09-23", "2026-09-23")).toBe(false);
    expect(dataNoFuturo("2025-12-31", "2026-01-01")).toBe(false);
  });
});

describe("filtros da URL", () => {
  it("uuid e data tortos não chegam ao PostgREST", () => {
    expect(paramUuid(EQUIPAMENTO)).toBe(EQUIPAMENTO);
    expect(paramUuid("abc")).toBeUndefined();
    expect(paramUuid([EQUIPAMENTO])).toBeUndefined();
    expect(paramData("2026-09-01")).toBe("2026-09-01");
    expect(paramData("01/09/2026")).toBeUndefined();
  });

  it("página da URL começa em 1; lixo cai na primeira", () => {
    expect(paramPagina("3")).toBe(2);
    expect(paramPagina("0")).toBe(0);
    expect(paramPagina("x")).toBe(0);
    expect(paramPagina(undefined)).toBe(0);
  });
});
