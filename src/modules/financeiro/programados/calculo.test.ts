import { describe, expect, it } from "vitest";

import {
  bucketProgramacao,
  dataEfetivaProgramacao,
  resumoProgramados,
} from "@/modules/financeiro/programados/calculo";

describe("dataEfetivaProgramacao", () => {
  it("usa a data programada quando existe", () => {
    expect(dataEfetivaProgramacao("2026-07-25", "2026-07-30")).toBe(
      "2026-07-25",
    );
  });

  it("cai no vencimento quando não há data programada", () => {
    expect(dataEfetivaProgramacao(null, "2026-07-30")).toBe("2026-07-30");
  });

  it("null quando nenhuma das duas existe", () => {
    expect(dataEfetivaProgramacao(null, null)).toBeNull();
  });
});

describe("bucketProgramacao", () => {
  it("data efetiva antes de hoje é atrasada", () => {
    expect(bucketProgramacao("2026-07-20", "2026-07-23")).toBe("atrasada");
  });

  it("data efetiva igual a hoje é hoje", () => {
    expect(bucketProgramacao("2026-07-23", "2026-07-23")).toBe("hoje");
  });

  it("data efetiva depois de hoje é proxima", () => {
    expect(bucketProgramacao("2026-07-24", "2026-07-23")).toBe("proxima");
  });
});

describe("resumoProgramados", () => {
  const hoje = "2026-07-23";

  it("soma cada bucket separadamente", () => {
    const resumo = resumoProgramados(
      [
        { dataEfetiva: "2026-07-20", valor: 100 }, // atrasado
        { dataEfetiva: "2026-07-22", valor: 50 }, // atrasado
        { dataEfetiva: "2026-07-23", valor: 200 }, // hoje
        { dataEfetiva: "2026-07-25", valor: 300 }, // proximos7
      ],
      hoje,
    );

    expect(resumo).toEqual({ atrasado: 150, hoje: 200, proximos7: 300 });
  });

  it("hoje entra no bucket hoje, não em atrasado nem próximos7", () => {
    const resumo = resumoProgramados(
      [{ dataEfetiva: "2026-07-23", valor: 999 }],
      hoje,
    );

    expect(resumo).toEqual({ atrasado: 0, hoje: 999, proximos7: 0 });
  });

  it("hoje+7 entra em próximos7 (borda superior inclusiva)", () => {
    const resumo = resumoProgramados(
      [{ dataEfetiva: "2026-07-30", valor: 400 }],
      hoje,
    );

    expect(resumo).toEqual({ atrasado: 0, hoje: 0, proximos7: 400 });
  });

  it("hoje+8 fica fora de próximos7", () => {
    const resumo = resumoProgramados(
      [{ dataEfetiva: "2026-07-31", valor: 400 }],
      hoje,
    );

    expect(resumo).toEqual({ atrasado: 0, hoje: 0, proximos7: 0 });
  });

  it("itens sem data efetiva não entram em nenhum bucket", () => {
    const resumo = resumoProgramados(
      [{ dataEfetiva: null, valor: 500 }],
      hoje,
    );

    expect(resumo).toEqual({ atrasado: 0, hoje: 0, proximos7: 0 });
  });

  it("soma em centavos sem acumular erro de ponto flutuante", () => {
    const resumo = resumoProgramados(
      [
        { dataEfetiva: "2026-07-23", valor: 0.1 },
        { dataEfetiva: "2026-07-23", valor: 0.2 },
      ],
      hoje,
    );

    expect(resumo.hoje).toBe(0.3);
  });

  it("sem itens devolve zeros", () => {
    expect(resumoProgramados([], hoje)).toEqual({
      atrasado: 0,
      hoje: 0,
      proximos7: 0,
    });
  });
});
