import { describe, expect, it } from "vitest";

import {
  calendarioSchema,
  excecaoSchema,
  feriadoSchema,
  payloadDoCalendario,
  payloadDoFeriado,
  servicoSchema,
} from "@/modules/execucao/modelos/schemas";

describe("calendarioSchema", () => {
  it("horas com vírgula viram número do banco; sem nenhuma hora na semana é recusado", () => {
    const base = { nome: "Padrão", horasSeg: "9", horasTer: "9", horasQua: "9", horasQui: "9", horasSex: "9", horasSab: "5", horasDom: "",
      feriadosAbrangencia: ["nacional", "AC"], municipio: "", padraoEmpresa: false };
    const ok = calendarioSchema.parse(base);
    expect(payloadDoCalendario(ok)).toMatchObject({ horas_sab: "5", horas_dom: "0", feriados_abrangencia: ["nacional", "AC"] });
    expect(calendarioSchema.safeParse({ ...base, horasSeg: "", horasTer: "", horasQua: "", horasQui: "", horasSex: "", horasSab: "" }).success).toBe(false);
  });
  it("período chuvoso: início e fim juntos", () => {
    const base = { nome: "Chuva", horasSeg: "8", feriadosAbrangencia: [], padraoEmpresa: false };
    expect(calendarioSchema.safeParse({ ...base, chuvosoInicioMes: 11 }).success).toBe(false);
    expect(calendarioSchema.safeParse({ ...base, chuvosoInicioMes: 11, chuvosoFimMes: 4 }).success).toBe(true);
  });
});

describe("excecaoSchema", () => {
  it("horas de 0 a 24 e descrição obrigatória", () => {
    expect(excecaoSchema.safeParse({ data: "2026-12-24", horas: "4", tipo: "extra", descricao: "Véspera" }).success).toBe(true);
    expect(excecaoSchema.safeParse({ data: "2026-12-24", horas: "25", tipo: "extra", descricao: "X" }).success).toBe(false);
    expect(excecaoSchema.safeParse({ data: "2026-12-24", horas: "0", tipo: "paralisacao", descricao: " " }).success).toBe(false);
  });
});

describe("servicoSchema", () => {
  it("produtividade com vírgula", () => {
    expect(servicoSchema.parse({ codigo: "EST-01", nome: "Estaca escavada", produtividadePadrao: "12,5", ceuAberto: true, ativo: true })
      .produtividadePadrao).toBe("12.5");
  });
});

describe("feriadoSchema", () => {
  it("município só é exigido em feriado municipal", () => {
    expect(feriadoSchema.safeParse({ data: "2026-06-01", nome: "Aniversário", abrangencia: "municipal" }).success).toBe(false);
    expect(feriadoSchema.safeParse({ data: "2026-06-01", nome: "Aniversário", abrangencia: "municipal", municipio: "Rio Branco" }).success).toBe(true);
    expect(feriadoSchema.safeParse({ data: "2026-12-25", nome: "Natal", abrangencia: "nacional" }).success).toBe(true);
  });
  it("payload só leva município quando municipal", () => {
    const v = feriadoSchema.parse({ data: "2026-12-25", nome: "Natal", abrangencia: "nacional", municipio: "Rio Branco" });
    expect(payloadDoFeriado(v)).toEqual({ data: "2026-12-25", nome: "Natal", abrangencia: "nacional", municipio: null });
  });
});
