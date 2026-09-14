import { describe, expect, it } from "vitest";

import {
  adicionarAoLoteSchema,
  editarItemSchema,
  gerarLoteSchema,
  motivoSchema,
} from "@/modules/rh/decimo-terceiro/schemas";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OUTRO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";

function gerar(over: Record<string, unknown> = {}) {
  return gerarLoteSchema.safeParse({ ano: 2026, parcela: 1, ...over });
}

function editar(over: Record<string, unknown> = {}) {
  return editarItemSchema.safeParse({
    itemId: ID,
    bruto: "1000",
    inss: "",
    irrf: "",
    ...over,
  });
}

describe("gerarLoteSchema", () => {
  it("aceita ano e parcela, sem percentual nem chave de desconto", () => {
    // O app não calcula 13º desde 14/09/2026: gerar só identifica o lote.
    const r = gerar();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ ano: 2026, parcela: 1, dataVencimento: null });
    }
  });

  it("recusa parcela fora de 1 e 2", () => {
    expect(gerar({ parcela: 3 }).success).toBe(false);
    expect(gerar({ parcela: 0 }).success).toBe(false);
  });

  it("aceita vencimento vazio como não informado", () => {
    const r = gerar({ dataVencimento: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dataVencimento).toBeNull();
  });

  it("recusa vencimento que não é data", () => {
    expect(gerar({ dataVencimento: "20/12/2026" }).success).toBe(false);
  });
});

describe("editarItemSchema", () => {
  it("lê dinheiro em pt-BR", () => {
    const r = editar({ bruto: "1.234,56" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bruto).toBe(1234.56);
  });

  it("campo de desconto em branco vale zero", () => {
    // A maioria das linhas sai sem desconto nenhum: obrigar a digitar "0" em
    // 60 linhas seria trabalho inventado.
    const r = editar();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.inss).toBe(0);
      expect(r.data.irrf).toBe(0);
    }
  });

  it("aceita bruto zero: é assim que a linha volta a não ser paga", () => {
    const r = editar({ bruto: "0" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bruto).toBe(0);
  });

  it("recusa desconto que passa do bruto", () => {
    // Espelha a trava da RPC: o líquido ficaria negativo.
    const r = editar({ bruto: "100", inss: "90", irrf: "90" });
    expect(r.success).toBe(false);
  });

  it("aceita desconto igual ao bruto, que zera o líquido", () => {
    const r = editar({ bruto: "100", inss: "60", irrf: "40" });
    expect(r.success).toBe(true);
  });

  it("recusa valor negativo", () => {
    expect(editar({ bruto: "-1" }).success).toBe(false);
    expect(editar({ inss: "-1" }).success).toBe(false);
  });

  it("recusa mais de 2 casas: dinheiro é numeric(14,2)", () => {
    expect(editar({ bruto: "10,555" }).success).toBe(false);
  });

  it("recusa o ponto como decimal, que viraria mil vezes o valor", () => {
    // "1.5" em pt-BR é agrupamento de milhar inválido, não um e meio.
    expect(editar({ bruto: "1.5" }).success).toBe(false);
  });
});

describe("adicionarAoLoteSchema", () => {
  it("exige lote e colaborador", () => {
    expect(
      adicionarAoLoteSchema.safeParse({ loteId: ID, colaboradorId: OUTRO_ID })
        .success,
    ).toBe(true);
    expect(
      adicionarAoLoteSchema.safeParse({ loteId: ID, colaboradorId: "" }).success,
    ).toBe(false);
  });
});

describe("motivoSchema", () => {
  it("recusa motivo feito só de espaço, tab e quebra de linha", () => {
    const r = motivoSchema.safeParse({ loteId: ID, motivo: "\t  \n" });
    expect(r.success).toBe(false);
  });

  it("aceita motivo de verdade", () => {
    const r = motivoSchema.safeParse({ loteId: ID, motivo: "valor errado" });
    expect(r.success).toBe(true);
  });
});
