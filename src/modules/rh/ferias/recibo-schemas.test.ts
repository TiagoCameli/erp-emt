import { describe, expect, it } from "vitest";

import {
  editarReciboSchema,
  lancarFeriasSchema,
} from "@/modules/rh/ferias/recibo-schemas";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function lancar(over: Record<string, unknown> = {}) {
  return lancarFeriasSchema.safeParse({
    colaboradorId: ID,
    periodoAquisitivoInicio: "2025-01-01",
    periodoAquisitivoFim: "2025-12-31",
    dataInicio: "2026-03-02",
    dataFim: "2026-03-31",
    dias: 30,
    status: "programada",
    bruto: "1000",
    inss: "",
    irrf: "",
    ...over,
  });
}

describe("lancarFeriasSchema", () => {
  it("aceita o caso completo", () => {
    const r = lancar();
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bruto).toBe(1000);
  });

  it("campo de desconto em branco vale zero", () => {
    // A primeira parcela costuma sair sem desconto nenhum: obrigar a digitar
    // "0" seria trabalho inventado.
    const r = lancar();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.inss).toBe(0);
      expect(r.data.irrf).toBe(0);
    }
  });

  it("recusa dias zero ou negativo: não dá para pagar férias de zero dia", () => {
    expect(lancar({ dias: 0 }).success).toBe(false);
    expect(lancar({ dias: -1 }).success).toBe(false);
  });

  it("recusa fim do gozo antes do início", () => {
    expect(
      lancar({ dataInicio: "2026-03-31", dataFim: "2026-03-02" }).success,
    ).toBe(false);
  });

  it("recusa fim do aquisitivo antes do início", () => {
    expect(
      lancar({
        periodoAquisitivoInicio: "2025-12-31",
        periodoAquisitivoFim: "2025-01-01",
      }).success,
    ).toBe(false);
  });

  it("recusa desconto que passa do bruto", () => {
    // Espelha a trava da RPC: o líquido ficaria negativo.
    expect(lancar({ bruto: "100", inss: "90", irrf: "90" }).success).toBe(false);
  });

  it("aceita desconto igual ao bruto, que zera o líquido", () => {
    expect(lancar({ bruto: "100", inss: "60", irrf: "40" }).success).toBe(true);
  });

  it("lê dinheiro em pt-BR", () => {
    const r = lancar({ bruto: "1.234,56" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bruto).toBe(1234.56);
  });

  it("recusa o ponto como decimal, que viraria mil vezes o valor", () => {
    // "1.5" em pt-BR é agrupamento de milhar inválido, não um e meio.
    expect(lancar({ bruto: "1.5" }).success).toBe(false);
  });

  it("recusa mais de 2 casas: dinheiro é numeric(14,2)", () => {
    expect(lancar({ bruto: "10,555" }).success).toBe(false);
  });

  it("recusa status de gozo fora do catálogo", () => {
    expect(lancar({ status: "ferias" }).success).toBe(false);
  });

  it("exige as datas de gozo: o recibo é de férias que têm início e fim", () => {
    expect(lancar({ dataInicio: "" }).success).toBe(false);
    expect(lancar({ dataFim: "" }).success).toBe(false);
  });
});

describe("editarReciboSchema", () => {
  it("aceita bruto zero: é assim que o recibo volta a não ser pago", () => {
    const r = editarReciboSchema.safeParse({
      feriasId: ID,
      bruto: "0",
      inss: "",
      irrf: "",
    });
    expect(r.success).toBe(true);
  });

  it("recusa desconto maior que o bruto", () => {
    const r = editarReciboSchema.safeParse({
      feriasId: ID,
      bruto: "100",
      inss: "60",
      irrf: "60",
    });
    expect(r.success).toBe(false);
  });

  it("recusa valor negativo", () => {
    const r = editarReciboSchema.safeParse({
      feriasId: ID,
      bruto: "-1",
      inss: "",
      irrf: "",
    });
    expect(r.success).toBe(false);
  });
});
