import { describe, expect, it } from "vitest";

import {
  custoNoPeriodo,
  janelasDoPainel,
  maioresCustosPorEquipamento,
  type OsConcluidaResumo,
} from "@/modules/manutencao/painel/calculo";

const os = (equipamentoId: string, dataConclusao: string, custoTotal: number): OsConcluidaResumo => ({
  equipamentoId,
  dataConclusao,
  custoTotal,
});

describe("janelasDoPainel", () => {
  it("mês e ano da data, com o último dia certo (fevereiro, bissexto)", () => {
    expect(janelasDoPainel("2026-09-23")).toEqual({
      mesDe: "2026-09-01",
      mesAte: "2026-09-30",
      anoDe: "2026-01-01",
      anoAte: "2026-12-31",
    });
    expect(janelasDoPainel("2028-02-10").mesAte).toBe("2028-02-29");
    expect(janelasDoPainel("2026-02-10").mesAte).toBe("2026-02-28");
  });
});

describe("custoNoPeriodo", () => {
  it("soma só o que concluiu dentro da janela, com as pontas incluídas", () => {
    const lista = [os("a", "2026-08-31", 100), os("a", "2026-09-01", 10.1234), os("b", "2026-09-30", 0.0001)];
    expect(custoNoPeriodo(lista, "2026-09-01", "2026-09-30")).toBe(10.1235);
  });
});

describe("maioresCustosPorEquipamento", () => {
  it("soma por equipamento ANTES de cortar", () => {
    // "b" tem a OS mais cara, mas "a" soma mais em muitas OS baratas.
    const lista = [
      os("a", "2026-01-01", 40),
      os("a", "2026-01-02", 40),
      os("a", "2026-01-03", 40),
      os("b", "2026-01-01", 100),
      os("c", "2026-01-01", 5),
    ];
    expect(maioresCustosPorEquipamento(lista, 2)).toEqual([
      { equipamentoId: "a", custo: 120, quantidadeOs: 3 },
      { equipamentoId: "b", custo: 100, quantidadeOs: 1 },
    ]);
  });

  it("empate desempata pelo id; padrão é top 10", () => {
    const lista = Array.from({ length: 12 }, (_, i) => os(`e${String(i).padStart(2, "0")}`, "2026-01-01", 10));
    const top = maioresCustosPorEquipamento(lista);
    expect(top).toHaveLength(10);
    expect(top[0].equipamentoId).toBe("e00");
  });

  it("lista vazia, ranking vazio", () => {
    expect(maioresCustosPorEquipamento([])).toEqual([]);
  });
});
