import { describe, expect, it } from "vitest";

import {
  ALTURA_MAXIMA_GRADE,
  ALTURA_MINIMA_GRADE,
  chaveLayoutGrade,
  colunasDaLargura,
  idDoTitulo,
  layoutGradeEhPadrao,
  layoutGradeVazio,
  lerLayoutGrade,
  moverNaOrdem,
  moverUmPasso,
  ordemDaGrade,
  VERSAO_LAYOUT_GRADE,
} from "@/components/canonicos/layout-grade";

const IDS = ["total", "em-aberto", "vencido", "pago"];

describe("lerLayoutGrade", () => {
  it("lixo, nulo ou versão velha viram o layout padrão", () => {
    for (const bruto of [null, "x", 3, [], { versao: 0, ordem: ["pago"] }]) {
      expect(layoutGradeEhPadrao(lerLayoutGrade(bruto, IDS))).toBe(true);
    }
  });

  it("descarta card que sumiu da tela e repetição", () => {
    const layout = lerLayoutGrade(
      {
        versao: VERSAO_LAYOUT_GRADE,
        ordem: ["pago", "sumiu", "pago", "total"],
        ocultos: ["vencido", "sumiu", 7],
        tamanhos: { sumiu: { largura: 6 }, total: { largura: 6 } },
      },
      IDS,
    );
    expect(layout.ordem).toEqual(["pago", "total"]);
    expect(layout.ocultos).toEqual(["vencido"]);
    expect(layout.tamanhos).toEqual({ total: { largura: 6 } });
  });

  it("trava largura e altura nos limites", () => {
    const layout = lerLayoutGrade(
      {
        versao: VERSAO_LAYOUT_GRADE,
        ordem: [],
        ocultos: [],
        tamanhos: {
          total: { largura: 40, altura: 5 },
          pago: { largura: 0, altura: 99999 },
          vencido: { largura: "6", altura: Number.NaN },
        },
      },
      IDS,
    );
    expect(layout.tamanhos.total).toEqual({ largura: 12, altura: ALTURA_MINIMA_GRADE });
    expect(layout.tamanhos.pago).toEqual({ largura: 2, altura: ALTURA_MAXIMA_GRADE });
    // Nada utilizável: o card volta ao padrão em vez de guardar um tamanho vazio.
    expect(layout.tamanhos.vencido).toBeUndefined();
  });
});

describe("ordemDaGrade", () => {
  it("sem nada salvo é a ordem da tela", () => {
    expect(ordemDaGrade(IDS, [])).toEqual(IDS);
  });

  it("card novo nasce depois do vizinho padrão, não no fim", () => {
    // A pessoa arrumou antes de "vencido" existir.
    expect(ordemDaGrade(IDS, ["pago", "total", "em-aberto"])).toEqual([
      "pago",
      "total",
      "em-aberto",
      "vencido",
    ]);
  });

  it("card novo que é o primeiro da tela entra no começo", () => {
    expect(ordemDaGrade(["novo", ...IDS], ["pago", "total", "em-aberto", "vencido"])[0]).toBe("novo");
  });
});

describe("mover", () => {
  it("moverNaOrdem põe antes ou depois do alvo", () => {
    expect(moverNaOrdem(IDS, "pago", "total", false)).toEqual(["pago", "total", "em-aberto", "vencido"]);
    expect(moverNaOrdem(IDS, "total", "vencido", true)).toEqual(["em-aberto", "vencido", "total", "pago"]);
    expect(moverNaOrdem(IDS, "total", "total", true)).toBe(IDS);
  });

  it("moverUmPasso pula o card que está fora da tela", () => {
    const visiveis = new Set(["total", "vencido", "pago"]);
    expect(moverUmPasso(IDS, visiveis, "vencido", -1)).toEqual(["vencido", "total", "em-aberto", "pago"]);
    // Já é o primeiro visível: devolve a MESMA lista, e o menu desabilita o item.
    expect(moverUmPasso(IDS, visiveis, "total", -1)).toBe(IDS);
  });
});

describe("colunasDaLargura", () => {
  // Grade de 1200px com vão de 12px: coluna de (1200 - 132) / 12 = 89px.
  it("converte px em colunas contando os vãos", () => {
    expect(colunasDaLargura(1200, 1200, 12)).toBe(12);
    expect(colunasDaLargura(594, 1200, 12)).toBe(6);
    expect(colunasDaLargura(291, 1200, 12)).toBe(3);
  });

  it("nunca sai de 2 a 12", () => {
    expect(colunasDaLargura(10, 1200, 12)).toBe(2);
    expect(colunasDaLargura(5000, 1200, 12)).toBe(12);
  });
});

describe("identidade", () => {
  it("id do título tira acento e espaço", () => {
    expect(idDoTitulo("Vence em até 7 dias")).toBe("vence-em-ate-7-dias");
    expect(idDoTitulo("  Saldo Areacre  ")).toBe("saldo-areacre");
  });

  it("chave passa no formato das preferências de tabela", () => {
    expect(chaveLayoutGrade("gestao.painel.kpis")).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/);
  });

  it("layout vazio é padrão", () => {
    expect(layoutGradeEhPadrao(layoutGradeVazio())).toBe(true);
  });
});
