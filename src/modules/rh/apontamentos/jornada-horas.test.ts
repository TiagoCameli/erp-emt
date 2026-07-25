import { describe, expect, it } from "vitest";

import {
  jornadaDoDia,
  separaHoras,
  sugereFalta,
} from "@/modules/rh/apontamentos/jornada-horas";

/** Padrão EMT: seg-sex 8h, sábado 5h, domingo 0h (folga). */
const JORNADA_PADRAO_EMT = {
  horasSegunda: 8,
  horasTerca: 8,
  horasQuarta: 8,
  horasQuinta: 8,
  horasSexta: 8,
  horasSabado: 5,
  horasDomingo: 0,
};

describe("jornadaDoDia", () => {
  it("segunda-feira (2026-07-20) pega horasSegunda", () => {
    expect(
      jornadaDoDia({ ...JORNADA_PADRAO_EMT, horasSegunda: 8 }, "2026-07-20"),
    ).toBe(8);
  });

  it("terça-feira (2026-07-21) pega horasTerca", () => {
    expect(
      jornadaDoDia({ ...JORNADA_PADRAO_EMT, horasTerca: 7.5 }, "2026-07-21"),
    ).toBe(7.5);
  });

  it("quarta-feira (2026-07-22) pega horasQuarta", () => {
    expect(
      jornadaDoDia({ ...JORNADA_PADRAO_EMT, horasQuarta: 6 }, "2026-07-22"),
    ).toBe(6);
  });

  it("quinta-feira (2026-07-23) pega horasQuinta", () => {
    expect(
      jornadaDoDia({ ...JORNADA_PADRAO_EMT, horasQuinta: 9 }, "2026-07-23"),
    ).toBe(9);
  });

  it("sexta-feira (2026-07-24) pega horasSexta", () => {
    expect(
      jornadaDoDia({ ...JORNADA_PADRAO_EMT, horasSexta: 8 }, "2026-07-24"),
    ).toBe(8);
  });

  it("sábado (2026-07-25) pega horasSabado", () => {
    expect(jornadaDoDia(JORNADA_PADRAO_EMT, "2026-07-25")).toBe(5);
  });

  it("domingo (2026-07-26) pega horasDomingo", () => {
    expect(jornadaDoDia(JORNADA_PADRAO_EMT, "2026-07-26")).toBe(0);
  });

  it("não sofre TZ shift: vira de ano também é determinístico (2026-01-01, quinta)", () => {
    // 2026-01-01 é quinta-feira.
    expect(
      jornadaDoDia({ ...JORNADA_PADRAO_EMT, horasQuinta: 8 }, "2026-01-01"),
    ).toBe(8);
  });
});

describe("separaHoras", () => {
  it("dia útil: 10h com jornada 8h -> 8 normais + 2 extras", () => {
    expect(separaHoras(10, 8)).toEqual({ horasNormais: 8, horasExtras: 2 });
  });

  it("sábado: 6h com jornada 5h -> 5 normais + 1 extra", () => {
    expect(separaHoras(6, 5)).toEqual({ horasNormais: 5, horasExtras: 1 });
  });

  it("domingo: 4h com jornada 0h -> 0 normais + 4 extras", () => {
    expect(separaHoras(4, 0)).toEqual({ horasNormais: 0, horasExtras: 4 });
  });

  it("total abaixo da jornada: 6h com jornada 8h -> 6 normais + 0 extras", () => {
    expect(separaHoras(6, 8)).toEqual({ horasNormais: 6, horasExtras: 0 });
  });

  it("total igual à jornada: 8h com jornada 8h -> 8 normais + 0 extras", () => {
    expect(separaHoras(8, 8)).toEqual({ horasNormais: 8, horasExtras: 0 });
  });

  it("arredonda em 2 casas", () => {
    expect(separaHoras(8.333, 8)).toEqual({
      horasNormais: 8,
      horasExtras: 0.33,
    });
  });
});

describe("sugereFalta", () => {
  it("0h num dia com jornada 8h -> true", () => {
    expect(sugereFalta(0, 8)).toBe(true);
  });

  it("0h num dia com jornada 0h (folga/domingo) -> false", () => {
    expect(sugereFalta(0, 0)).toBe(false);
  });

  it("3h num dia com jornada 8h -> false (não é falta)", () => {
    expect(sugereFalta(3, 8)).toBe(false);
  });
});
