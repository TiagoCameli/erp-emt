import { describe, expect, it } from "vitest";

import {
  AJUDA_TIPO_FORMA,
  CAMINHO_DO_PAGAMENTO,
  ehTipoFormaPagamento,
  ROTULO_TIPO_FORMA,
  tipoFormaPagamento,
  TIPOS_FORMA_PAGAMENTO,
} from "@/modules/_shared/forma-pagamento";

describe("tipoFormaPagamento", () => {
  it("aceita os quatro tipos do banco", () => {
    for (const tipo of TIPOS_FORMA_PAGAMENTO) {
      expect(tipoFormaPagamento(tipo)).toBe(tipo);
    }
  });

  // O default seguro é PASSAR pela aprovação: forma sem tipo, tipo novo que o
  // app ainda não conhece ou dado sujo nunca pode virar pagamento automático.
  it("cai em bancario quando não sabe o que é", () => {
    expect(tipoFormaPagamento(null)).toBe("bancario");
    expect(tipoFormaPagamento(undefined)).toBe("bancario");
    expect(tipoFormaPagamento("")).toBe("bancario");
    expect(tipoFormaPagamento("pix")).toBe("bancario");
    expect(tipoFormaPagamento("CARTAO_CREDITO")).toBe("bancario");
    expect(tipoFormaPagamento(7)).toBe("bancario");
  });

  it("ehTipoFormaPagamento reconhece só o que existe", () => {
    expect(ehTipoFormaPagamento("dinheiro")).toBe(true);
    expect(ehTipoFormaPagamento("cartao_credito")).toBe(true);
    expect(ehTipoFormaPagamento("cartao")).toBe(false);
    expect(ehTipoFormaPagamento(null)).toBe(false);
  });
});

describe("textos por tipo", () => {
  it("todo tipo tem rótulo, ajuda e caminho do pagamento", () => {
    for (const tipo of TIPOS_FORMA_PAGAMENTO) {
      expect(ROTULO_TIPO_FORMA[tipo]).toBeTruthy();
      expect(AJUDA_TIPO_FORMA[tipo]).toBeTruthy();
      expect(CAMINHO_DO_PAGAMENTO[tipo]).toBeTruthy();
    }
  });

  it("bancário e cheque explicam que passam pela aprovação", () => {
    expect(CAMINHO_DO_PAGAMENTO.bancario).toContain("aprovação");
    expect(CAMINHO_DO_PAGAMENTO.cheque).toContain("aprovação");
  });

  it("dinheiro e cartão explicam que não passam", () => {
    expect(CAMINHO_DO_PAGAMENTO.dinheiro).toContain("Não passa");
    expect(CAMINHO_DO_PAGAMENTO.cartao_credito).toContain("sem aprovação");
  });
});
