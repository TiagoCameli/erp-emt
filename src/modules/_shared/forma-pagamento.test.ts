import { describe, expect, it } from "vitest";

import {
  AJUDA_TIPO_FORMA,
  CAMINHO_DO_PAGAMENTO,
  ehPagamentoDireto,
  ehTipoFormaPagamento,
  passaPelaAprovacao,
  ROTULO_TIPO_FORMA,
  tipoFormaPagamento,
  TIPOS_FORMA_PAGAMENTO,
  TIPOS_PAGAMENTO_DIRETO,
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

describe("para onde a forma manda o pagamento", () => {
  it("bancário e cheque passam pela fila de aprovação", () => {
    expect(passaPelaAprovacao("bancario")).toBe(true);
    expect(passaPelaAprovacao("cheque")).toBe(true);
  });

  it("dinheiro e cartão de crédito não passam pela fila", () => {
    expect(passaPelaAprovacao("dinheiro")).toBe(false);
    expect(passaPelaAprovacao("cartao_credito")).toBe(false);
  });

  /**
   * A INVARIANTE que o defeito de 20/08/2026 violou: os dois destinos são
   * complementares. A fila de aprovação não filtrava forma nenhuma enquanto a
   * aba "Dinheiro e cartão" filtrava, então 8 parcelas de cartão de crédito
   * (R$ 7.189,04) apareciam nas DUAS abas ao mesmo tempo — inclusive as do
   * LAN-2026-5026, que foi como o Tiago achou.
   *
   * Cobre os tipos que existem hoje e os que vierem: o laço é sobre o catálogo.
   */
  it("todo tipo cai em exatamente um destino, nunca nos dois nem em nenhum", () => {
    for (const tipo of TIPOS_FORMA_PAGAMENTO) {
      expect(passaPelaAprovacao(tipo)).toBe(!ehPagamentoDireto(tipo));
    }
  });

  it("a lista do filtro da aba é a dos que não passam, e não uma cópia à mão", () => {
    expect([...TIPOS_PAGAMENTO_DIRETO].sort()).toEqual(
      ["cartao_credito", "dinheiro"].sort(),
    );
    // Linha de controle: a lista não pode ser o catálogo inteiro nem vazia, que
    // é o que um `filter` com predicado invertido produziria.
    expect(TIPOS_PAGAMENTO_DIRETO.length).toBeGreaterThan(0);
    expect(TIPOS_PAGAMENTO_DIRETO.length).toBeLessThan(
      TIPOS_FORMA_PAGAMENTO.length,
    );
  });

  it("o que a tela promete é o que o predicado faz", () => {
    // O texto de CAMINHO_DO_PAGAMENTO é o que o usuário lê no formulário. Ele e
    // a regra vinham de lugares diferentes, e foi por isso que a tela de
    // aprovação pôde prometer "dinheiro e cartão não passam por aqui" enquanto
    // a consulta os trazia.
    for (const tipo of TIPOS_FORMA_PAGAMENTO) {
      const prometeAprovacao = CAMINHO_DO_PAGAMENTO[tipo].includes(
        "Passa pela aprovação",
      );
      expect(prometeAprovacao).toBe(passaPelaAprovacao(tipo));
    }
  });
});
