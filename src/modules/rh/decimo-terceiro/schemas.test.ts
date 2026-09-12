import { describe, expect, it } from "vitest";

import {
  editarItemSchema,
  gerarLoteSchema,
  motivoSchema,
} from "@/modules/rh/decimo-terceiro/schemas";

function gerar(over: Record<string, unknown> = {}) {
  return gerarLoteSchema.safeParse({
    ano: 2026,
    parcela: 1,
    percentual: "50",
    comDesconto: false,
    ...over,
  });
}

describe("gerarLoteSchema", () => {
  it("converte o percentual digitado em fração, que é o que o banco guarda", () => {
    const r = gerar();
    expect(r.success).toBe(true);
    // 50 digitado vira 0,5. O check da coluna é `percentual <= 1`: mandar 50
    // cru faria o banco recusar com erro de constraint em vez de mensagem.
    if (r.success) expect(r.data.percentual).toBe(0.5);
  });

  it("lê a vírgula como separador decimal", () => {
    const r = gerar({ percentual: "33,33" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.percentual).toBeCloseTo(0.3333, 4);
  });

  it("recusa o ponto como decimal, que viraria dez vezes o valor", () => {
    // "0.5" em pt-BR é agrupamento de milhar inválido, não meio por cento.
    // paraNumero devolve NaN de propósito por causa disso.
    expect(gerar({ percentual: "0.5" }).success).toBe(false);
  });

  it("recusa percentual com mais de 2 casas, que a coluna arredondaria calado", () => {
    // A coluna é numeric(7,4) e o schema divide por 100: 33,333 vira 0,33333,
    // que tem 5 casas. O banco arredondaria para 0,3333 sem avisar ninguém.
    expect(gerar({ percentual: "33,333" }).success).toBe(false);
  });

  it("recusa percentual zero e acima de 100", () => {
    expect(gerar({ percentual: "0" }).success).toBe(false);
    expect(gerar({ percentual: "150" }).success).toBe(false);
  });

  it("aceita exatamente 100", () => {
    const r = gerar({ percentual: "100" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.percentual).toBe(1);
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
  it("aceita valor em pt-BR", () => {
    const r = editarItemSchema.safeParse({
      itemId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      valor: "1.234,56",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.valor).toBe(1234.56);
  });

  it("recusa valor negativo", () => {
    const r = editarItemSchema.safeParse({
      itemId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      valor: "-1",
    });
    expect(r.success).toBe(false);
  });

  it("recusa mais de 2 casas: dinheiro é numeric(14,2)", () => {
    const r = editarItemSchema.safeParse({
      itemId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      valor: "10,555",
    });
    expect(r.success).toBe(false);
  });
});

describe("motivoSchema", () => {
  it("recusa motivo feito só de espaço, tab e quebra de linha", () => {
    // Espelha o btrim com conjunto explícito da RPC: btrim(x) sem argumento
    // corta só espaço e deixaria "\t\n" passar como preenchido.
    const r = motivoSchema.safeParse({
      loteId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      motivo: "\t  \n",
    });
    expect(r.success).toBe(false);
  });

  it("aceita motivo de verdade", () => {
    const r = motivoSchema.safeParse({
      loteId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      motivo: "valor errado no salário do João",
    });
    expect(r.success).toBe(true);
  });
});
