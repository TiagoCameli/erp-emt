import { describe, expect, it } from "vitest";

import {
  REGRAS_ARREDONDAMENTO,
  ROTULO_FASE_REVISAO,
  ROTULO_REGRA,
  ROTULO_STATUS_REVISAO,
  STATUS_REVISAO,
  rotuloRevisao,
} from "./rotulos";

describe("regras de arredondamento", () => {
  it("inclui o truncado por item e todas têm rótulo", () => {
    expect(REGRAS_ARREDONDAMENTO).toContain("item_truncado");
    expect(ROTULO_REGRA.item_truncado).toBe("Truncado por item, em cada medição");
    for (const r of REGRAS_ARREDONDAMENTO) expect(ROTULO_REGRA[r]).toBeTruthy();
  });
});

describe("status da revisão", () => {
  it("espelha o check do banco, com rótulo pt-BR", () => {
    expect([...STATUS_REVISAO]).toEqual(["em_aberto", "enviada", "aprovada", "substituida"]);
    expect(ROTULO_STATUS_REVISAO).toEqual({
      em_aberto: "Em aberto",
      enviada: "Enviada",
      aprovada: "Aprovada",
      substituida: "Substituída",
    });
  });

  it("fase da revisão tem rótulo", () => {
    expect(ROTULO_FASE_REVISAO.antes_aprovacao).toBe("Antes da aprovação");
    expect(ROTULO_FASE_REVISAO.pos_aprovacao).toBe("Pós-aprovação");
  });

  it("REVnn com dois dígitos", () => {
    expect(rotuloRevisao(0)).toBe("REV00");
    expect(rotuloRevisao(3)).toBe("REV03");
    expect(rotuloRevisao(12)).toBe("REV12");
  });
});
