import { describe, expect, it } from "vitest";

import {
  calcularPeriodo,
  diasDoPeriodo,
  proximoTipoDia,
} from "@/modules/rh/diaristas/periodo";

describe("diasDoPeriodo", () => {
  it("lista os dias do início ao fim, inclusive", () => {
    expect(diasDoPeriodo("2026-10-30", "2026-10-31")).toEqual([
      "2026-10-30",
      "2026-10-31",
    ]);
  });

  it("vazio quando falta data ou o fim é antes do início", () => {
    expect(diasDoPeriodo("", "2026-10-03")).toEqual([]);
    expect(diasDoPeriodo("2026-10-05", "2026-10-03")).toEqual([]);
  });

  it("não sofre com horário de verão nem fuso: 31 dias em outubro", () => {
    expect(diasDoPeriodo("2026-10-01", "2026-10-31")).toHaveLength(31);
  });
});

describe("calcularPeriodo (mesma regra da fn_diaria_calcular)", () => {
  const base = {
    inicio: "2026-10-01",
    fim: "2026-10-10",
    meias: [] as string[],
    faltas: [] as string[],
    valorDiaria: 120,
  };

  it("10 dias, 2 meias e 1 falta = 8 diárias", () => {
    const r = calcularPeriodo({
      ...base,
      meias: ["2026-10-02", "2026-10-03"],
      faltas: ["2026-10-06"],
    });
    expect(r).toMatchObject({
      integrais: 7,
      qtdMeias: 2,
      qtdFaltas: 1,
      qtd: 8,
      total: 960,
    });
  });

  it("total arredonda no centavo", () => {
    const r = calcularPeriodo({
      ...base,
      fim: "2026-10-01",
      meias: ["2026-10-01"],
      valorDiaria: 100.33,
    });
    expect(r).toMatchObject({ qtd: 0.5, total: 50.17 });
  });

  it("RECUSA período que cruza o mês", () => {
    const r = calcularPeriodo({ ...base, fim: "2026-11-02" });
    expect(r).toEqual({ erro: expect.stringContaining("cruza o mês") });
  });

  it("RECUSA fim antes do início", () => {
    const r = calcularPeriodo({ ...base, fim: "2026-09-30" });
    expect("erro" in r).toBe(true);
  });

  it("ignora marcação fora do período (o período encolheu depois de marcar)", () => {
    const r = calcularPeriodo({
      ...base,
      fim: "2026-10-02",
      faltas: ["2026-10-09"],
    });
    expect(r).toMatchObject({ qtd: 2, qtdFaltas: 0 });
  });

  it("RECUSA nenhum dia trabalhado", () => {
    const r = calcularPeriodo({
      ...base,
      fim: "2026-10-02",
      faltas: ["2026-10-01", "2026-10-02"],
    });
    expect(r).toEqual({ erro: expect.stringContaining("Nenhum dia") });
  });
});

describe("proximoTipoDia", () => {
  it("integral → meia → falta → integral", () => {
    expect(proximoTipoDia("integral")).toBe("meia");
    expect(proximoTipoDia("meia")).toBe("falta");
    expect(proximoTipoDia("falta")).toBe("integral");
  });
});
