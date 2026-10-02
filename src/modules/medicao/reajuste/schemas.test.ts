import { describe, expect, it } from "vitest";

import { configSchema, escolhasSchema, manualSchema, valorManualParaBanco } from "./schemas";

// Id de carga (md5 formatado como uuid, sem versão nem variante): z.uuid() recusaria.
const ID_CARGA = "c4109738-9af7-4ddb-8982-3b2c79fe6e43";
const ID_MD5 = "0cc175b9-c0f1-b6a8-31c3-99e269772661";

describe("escolhasSchema", () => {
  it("aceita chave grupo|código e ids de carga (md5)", () => {
    const r = escolhasSchema.safeParse({ "4,0|60112": { itens: [ID_MD5, ID_CARGA], destino: null }, "2,2|51269": { itens: [ID_MD5], destino: ID_MD5 } });
    expect(r.success).toBe(true);
  });

  it("recusa chave fora do formato", () => {
    expect(escolhasSchema.safeParse({ "4.0|60112": { itens: [], destino: null } }).success).toBe(false);
    expect(escolhasSchema.safeParse({ "4,0-60112": { itens: [], destino: null } }).success).toBe(false);
    expect(escolhasSchema.safeParse({ "4,0|60A": { itens: [], destino: null } }).success).toBe(false);
  });

  it("recusa id inválido e mais de 20 itens", () => {
    expect(escolhasSchema.safeParse({ "4,0|1": { itens: ["x"], destino: null } }).success).toBe(false);
    expect(escolhasSchema.safeParse({ "4,0|1": { itens: Array(21).fill(ID_MD5), destino: null } }).success).toBe(false);
  });
});

describe("valorManualParaBanco", () => {
  it("pt-BR com sinal pelo sentido, texto com ponto", () => {
    expect(valorManualParaBanco("1.234,56", "positivo")).toBe("1234.56");
    expect(valorManualParaBanco("1.234,56", "negativo")).toBe("-1234.56");
    expect(valorManualParaBanco("0,5", "negativo")).toBe("-0.5");
    expect(valorManualParaBanco("1234.5", "positivo")).toBe("1234.5");
  });

  it("zero vai sem sinal", () => {
    expect(valorManualParaBanco("0", "negativo")).toBe("0");
    expect(valorManualParaBanco("0,00", "positivo")).toBe("0");
  });

  it("recusa ambíguo (como no colar), vazio, texto e sinal digitado", () => {
    expect(valorManualParaBanco("1.234", "positivo")).toBeNull();
    expect(valorManualParaBanco("", "positivo")).toBeNull();
    expect(valorManualParaBanco("abc", "positivo")).toBeNull();
    expect(valorManualParaBanco("-10", "positivo")).toBeNull();
    expect(valorManualParaBanco("1,234", "positivo")).not.toBe("1.234");
  });
});

describe("manualSchema", () => {
  const base = { valor: "1.234,56", sentido: "negativo", situacao: "provisorio", observacao: "  Sem SIAC  ", arquivoId: null };

  it("valida e transforma o valor para o banco", () => {
    const r = manualSchema.safeParse(base);
    expect(r.success && r.data).toEqual({ valor: "-1234.56", sentido: "negativo", situacao: "provisorio", observacao: "Sem SIAC", arquivoId: null });
  });

  it("aceita anexo com id de carga", () => {
    expect(manualSchema.safeParse({ ...base, arquivoId: ID_MD5 }).success).toBe(true);
  });

  it("número ambíguo é recusado com a mensagem do colar", () => {
    const r = manualSchema.safeParse({ ...base, valor: "1.234" });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]?.message).toMatch(/^Número ambíguo: "1.234"/);
  });

  it("recusa sentido, situação, observação longa e anexo inválido", () => {
    expect(manualSchema.safeParse({ ...base, sentido: "x" }).success).toBe(false);
    expect(manualSchema.safeParse({ ...base, situacao: "final" }).success).toBe(false);
    expect(manualSchema.safeParse({ ...base, observacao: "a".repeat(501) }).success).toBe(false);
    expect(manualSchema.safeParse({ ...base, arquivoId: "x" }).success).toBe(false);
  });
});

describe("configSchema", () => {
  const base = { temReajuste: true, dataBase: "2025-01", periodicidadeMeses: 12, indiceDescricao: "  DNIT, índices SICRO  " };

  it("válida", () => {
    const r = configSchema.safeParse(base);
    expect(r.success && r.data).toEqual({ temReajuste: true, dataBase: "2025-01", periodicidadeMeses: 12, indiceDescricao: "DNIT, índices SICRO" });
  });

  it("data-base 2025-13 recusada", () => {
    expect(configSchema.safeParse({ ...base, dataBase: "2025-13" }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, dataBase: "01/2025" }).success).toBe(false);
  });

  it("com reajuste sem data recusada; sem reajuste a data pode ficar vazia", () => {
    const r = configSchema.safeParse({ ...base, dataBase: "" });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]?.message).toBe("Informe o mês da data-base do reajuste");
    expect(configSchema.safeParse({ ...base, temReajuste: false, dataBase: "" }).success).toBe(true);
  });

  it("periodicidade inteira de 1 a 120 e índice até 200", () => {
    expect(configSchema.safeParse({ ...base, periodicidadeMeses: 0 }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, periodicidadeMeses: 121 }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, periodicidadeMeses: 1.5 }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, periodicidadeMeses: 120 }).success).toBe(true);
    expect(configSchema.safeParse({ ...base, indiceDescricao: "a".repeat(201) }).success).toBe(false);
  });
});
