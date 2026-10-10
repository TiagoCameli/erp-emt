import { describe, expect, it } from "vitest";

import { configurarObraSchema, localSchema, novoCronogramaSchema, payloadDoNovoCronograma } from "@/modules/execucao/obras/schemas";

const OBRA = "11111111-1111-4111-8111-111111111111";

describe("novoCronogramaSchema", () => {
  it("põe o código em maiúsculas e monta o payload do banco", () => {
    const r = novoCronogramaSchema.parse({ obraId: OBRA, tipoObra: "edificacao", codigo: " fund ", nome: "Fundação",
      dataInicio: "2026-03-02", criterioPeso: "duracao" });
    expect(payloadDoNovoCronograma(r)).toEqual({ obra_id: OBRA, tipo_obra: "edificacao", codigo: "FUND", nome: "Fundação",
      data_inicio: "2026-03-02", calendario_modelo_id: null, criterio_peso: "duracao", observacoes: null });
  });
  it("recusa código com espaço", () => {
    const r = novoCronogramaSchema.safeParse({ obraId: OBRA, codigo: "A B", nome: "X1", dataInicio: "2026-03-02", criterioPeso: "duracao" });
    expect(r.success).toBe(false);
  });
});

describe("configurarObraSchema", () => {
  it("km só em rodovia", () => {
    expect(configurarObraSchema.safeParse({ tipoObra: "edificacao", kmInicial: "100", kmFinal: "120",
      metrosPorEstaca: "20", ppcLimite: "80" }).success).toBe(false);
    expect(configurarObraSchema.safeParse({ tipoObra: "rodovia", kmInicial: "100", kmFinal: "120",
      metrosPorEstaca: "20", ppcLimite: "80" }).success).toBe(true);
  });
});

describe("localSchema", () => {
  it("km inicial e final andam juntos", () => {
    expect(localSchema.safeParse({ tipo: "segmento", codigo: "T1", nome: "Trecho 1", ordem: 0, kmInicial: "100", kmFinal: "" }).success).toBe(false);
  });
});
