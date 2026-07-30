import { describe, expect, it } from "vitest";

import {
  STATUS_PARCELA,
  rotuloParcela,
} from "@/modules/financeiro/_shared/formato";

describe("rotuloParcela", () => {
  it("mostra 'parcela N de M' em todas as linhas quando há mais de uma", () => {
    // O bug que isto trava: a primeira parcela aparecia só como o número do
    // documento, enquanto as outras mostravam "parcela 2" e "parcela 3".
    expect(rotuloParcela("LAN-2026-0015", 1, 3)).toBe(
      "LAN-2026-0015 · parcela 1 de 3",
    );
    expect(rotuloParcela("LAN-2026-0015", 2, 3)).toBe(
      "LAN-2026-0015 · parcela 2 de 3",
    );
    expect(rotuloParcela("LAN-2026-0015", 3, 3)).toBe(
      "LAN-2026-0015 · parcela 3 de 3",
    );
  });

  it("não põe sufixo em lançamento de parcela única", () => {
    expect(rotuloParcela("LAN-2026-0015", 1, 1)).toBe("LAN-2026-0015");
  });

  it("aguenta total desconhecido sem inventar parcela", () => {
    expect(rotuloParcela("LAN-2026-0015", 1, 0)).toBe("LAN-2026-0015");
  });

  it("lançamento sem número tem rótulo em vez de vazio", () => {
    expect(rotuloParcela(null, 2, 2)).toBe("Sem número · parcela 2 de 2");
  });
});

describe("STATUS_PARCELA", () => {
  it("em revisão é atenção (âmbar), não recusa (vermelho)", () => {
    expect(STATUS_PARCELA.em_revisao.rotulo).toBe("Em revisão");
    expect(STATUS_PARCELA.em_revisao.badge).toBe("pendente_aprovacao");
    // Guarda contra alguém trocar por vermelho: revisão pede ajuste, não nega.
    expect(STATUS_PARCELA.em_revisao.badge).not.toBe("rejeitado");
  });

  it("cobre todos os status que o banco aceita", () => {
    expect(Object.keys(STATUS_PARCELA).sort()).toEqual([
      "aprovado",
      "cancelado",
      "em_revisao",
      "pago",
      "pendente",
    ]);
  });
});
