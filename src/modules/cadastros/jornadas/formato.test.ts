import { describe, expect, it } from "vitest";

import { resumoHoras } from "@/modules/cadastros/jornadas/formato";

describe("resumoHoras", () => {
  it("agrupa Padrão EMT: seg-sex 8h, sábado 5h, domingo folga", () => {
    const resumo = resumoHoras({
      horasSegunda: 8,
      horasTerca: 8,
      horasQuarta: 8,
      horasQuinta: 8,
      horasSexta: 8,
      horasSabado: 5,
      horasDomingo: 0,
    });
    expect(resumo).toBe("Seg-Sex 8h · Sáb 5h · Dom 0h");
  });

  it("agrupa a semana inteira quando todos os dias são iguais", () => {
    const resumo = resumoHoras({
      horasSegunda: 6,
      horasTerca: 6,
      horasQuarta: 6,
      horasQuinta: 6,
      horasSexta: 6,
      horasSabado: 6,
      horasDomingo: 6,
    });
    expect(resumo).toBe("Seg-Dom 6h");
  });

  it("não agrupa dias com carga diferente entre si", () => {
    const resumo = resumoHoras({
      horasSegunda: 8,
      horasTerca: 4,
      horasQuarta: 8,
      horasQuinta: 4,
      horasSexta: 8,
      horasSabado: 0,
      horasDomingo: 0,
    });
    expect(resumo).toBe("Seg 8h · Ter 4h · Qua 8h · Qui 4h · Sex 8h · Sáb-Dom 0h");
  });

  it("formata hora com meia hora usando vírgula pt-BR", () => {
    const resumo = resumoHoras({
      horasSegunda: 8.5,
      horasTerca: 8.5,
      horasQuarta: 8.5,
      horasQuinta: 8.5,
      horasSexta: 4,
      horasSabado: 0,
      horasDomingo: 0,
    });
    expect(resumo).toBe("Seg-Qui 8,5h · Sex 4h · Sáb-Dom 0h");
  });
});
