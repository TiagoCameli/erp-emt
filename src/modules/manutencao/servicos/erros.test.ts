import { describe, expect, it } from "vitest";

import { traduzirErroOs } from "@/modules/manutencao/servicos/erros";

const FALLBACK = "Não foi possível salvar";

describe("traduzirErroOs", () => {
  it("saldo insuficiente com números: formata em pt-BR e diz o que fazer", () => {
    const texto = traduzirErroOs(
      { code: "23514", message: "Saldo insuficiente no almoxarifado: disponível 2.5000, pedido 3" },
      FALLBACK,
    );
    expect(texto).toContain("há 2,5 disponível");
    expect(texto).toContain("foram pedidos 3");
    expect(texto).toContain("Registre a entrada");
  });

  it("saldo que ficaria negativo (gatilho) vira frase sem números crus", () => {
    const texto = traduzirErroOs(
      {
        code: "23514",
        message:
          "Saldo insuficiente no almoxarifado: o saldo desta peça ficaria negativo (10.0000 de entrada, 12.0000 de saída)",
      },
      FALLBACK,
    );
    expect(texto).toBe("Saldo insuficiente no almoxarifado: a operação deixaria o saldo desta peça negativo");
  });

  it("'reabra antes' em concluída manda reabrir, com o status acentuado", () => {
    expect(
      traduzirErroOs({ code: "P0001", message: "OS concluida não pode ser editada: reabra antes" }, FALLBACK),
    ).toBe("A OS está concluída e não aceita alteração: reabra a OS antes");
    expect(
      traduzirErroOs({ code: "P0001", message: "OS concluida não aceita linha nova: reabra antes" }, FALLBACK),
    ).toBe("A OS está concluída e não aceita alteração: reabra a OS antes");
  });

  it("'reabra antes' em cancelada não manda reabrir (cancelada não reabre)", () => {
    expect(
      traduzirErroOs({ code: "P0001", message: "OS cancelada não aceita linha nova: reabra antes" }, FALLBACK),
    ).toBe("A OS está cancelada e não aceita alteração");
  });

  it("raise exception nosso passa como está", () => {
    expect(traduzirErroOs({ code: "P0001", message: "Informe o motivo para reabrir" }, FALLBACK)).toBe(
      "Informe o motivo para reabrir",
    );
  });

  it("permissão negada (grant ou RLS) não vaza o texto técnico", () => {
    const texto = traduzirErroOs(
      { code: "42501", message: 'permission denied for function fn_os_salvar' },
      FALLBACK,
    );
    expect(texto).not.toContain("permission");
    expect(texto).toContain("permissão");
  });

  it("qualquer outro erro cai no fallback", () => {
    expect(traduzirErroOs({ code: "08006", message: "connection failure" }, FALLBACK)).toBe(FALLBACK);
    expect(traduzirErroOs({ code: "23514", message: 'violates check constraint "x"' }, FALLBACK)).toBe(FALLBACK);
    expect(traduzirErroOs(null, FALLBACK)).toBe(FALLBACK);
  });
});
