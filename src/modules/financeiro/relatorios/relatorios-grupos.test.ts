import { describe, expect, it } from "vitest";

import { agregarPrazoAVencer, aVencerEm30Dias } from "@/modules/financeiro/relatorios/calculo";
import {
  GRUPOS_RELATORIOS,
  PERGUNTA_DO_RELATORIO,
  RELATORIOS,
} from "@/modules/financeiro/relatorios/relatorios";

describe("grupos de relatórios", () => {
  it("cobrem todos os relatórios, uma vez cada, na ordem da barra", () => {
    expect(GRUPOS_RELATORIOS.flatMap((g) => g.relatorios)).toEqual([...RELATORIOS]);
  });

  it("todo relatório tem a pergunta que responde", () => {
    for (const id of RELATORIOS) {
      expect(PERGUNTA_DO_RELATORIO[id]).toMatch(/\?$/);
    }
  });
});


describe("a vencer por prazo", () => {
  // Recorte de fn_rel_aging em 15/10/2026 (a pagar).
  const prazos = agregarPrazoAVencer([
    { prazo: "acima_60", valor: "11659686.60" },
    { prazo: "ate_7", valor: "304420.14" },
    { prazo: "d_16_30", valor: "186178.44" },
    { prazo: "d_31_60", valor: "411728.78" },
    { prazo: "d_8_15", valor: "166050.88" },
  ]);

  it("sai na ordem do prazo, com os cinco sempre presentes", () => {
    expect(prazos.map((p) => p.prazo)).toEqual(["ate_7", "d_8_15", "d_16_30", "d_31_60", "acima_60"]);
    expect(agregarPrazoAVencer([]).every((p) => p.valor === 0)).toBe(true);
  });

  it("próximos 30 dias somam só até 30, ao centavo", () => {
    expect(aVencerEm30Dias(prazos)).toBe(656649.46);
  });

  it("prazo desconhecido cai no mais longo, não some", () => {
    const [, , , , longo] = agregarPrazoAVencer([{ prazo: "novo", valor: "10.00" }]);
    expect(longo?.valor).toBe(10);
  });
});
