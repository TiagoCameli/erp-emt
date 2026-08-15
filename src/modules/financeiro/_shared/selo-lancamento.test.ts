import { describe, expect, it } from "vitest";

import { seloDoLancamento } from "@/modules/financeiro/_shared/selo-lancamento";

/**
 * O selo de status de um lançamento a pagar tem que dizer, antes de tudo, se a
 * empresa ainda deve aquilo.
 *
 * Medido em 15/08/2026: os 107 lançamentos com status `aprovado` têm TODOS saldo
 * em aberto, somando R$ 9.835.752,05 — 84% de tudo que a empresa deve. Eles
 * apareciam com selo verde "Aprovado", que se lê como resolvido, enquanto só os
 * R$ 1,90 mi restantes apareciam como "A pagar".
 *
 * `aprovado` continua sendo uma etapa real e útil da máquina de estados (é o que
 * o financeiro pode pagar hoje), então ela não some: vira um selo secundário ao
 * lado, e o principal passa a falar de dívida.
 */
describe("seloDoLancamento", () => {
  it("aprovado com saldo aberto vira 'A pagar', com a etapa ao lado", () => {
    const selo = seloDoLancamento("aprovado", "a_pagar", 9_835.75);

    expect(selo.rotulo).toBe("A pagar");
    expect(selo.badge).toBe("pendente_aprovacao");
    expect(selo.etapa).toBe("Aprovado");
  });

  it("a pagar sem aprovação não ganha selo de etapa", () => {
    const selo = seloDoLancamento("a_pagar", "a_pagar", 1_898.21);

    expect(selo.rotulo).toBe("A pagar");
    expect(selo.badge).toBe("pendente_aprovacao");
    expect(selo.etapa).toBeUndefined();
  });

  it("pago continua pago", () => {
    const selo = seloDoLancamento("pago", "a_pagar", 0);

    expect(selo.rotulo).toBe("Pago");
    expect(selo.badge).toBe("pago");
    expect(selo.etapa).toBeUndefined();
  });

  it("cancelado e previsto não mudam", () => {
    expect(seloDoLancamento("cancelado", "a_pagar", 0).rotulo).toBe("Cancelado");
    expect(seloDoLancamento("previsto", "a_pagar", 500).rotulo).toBe("Previsto");
  });

  it("aprovado JÁ QUITADO continua mostrando Aprovado", () => {
    // Não acontece na base de hoje (os 107 têm saldo), mas se um dia acontecer,
    // "A pagar" com zero a pagar seria mentira na direção contrária.
    const selo = seloDoLancamento("aprovado", "a_pagar", 0);

    expect(selo.rotulo).toBe("Aprovado");
    expect(selo.badge).toBe("aprovado");
    expect(selo.etapa).toBeUndefined();
  });

  it("sem saber o saldo, não inventa: mantém o rótulo do status", () => {
    // `null` é "esta tela não carregou as parcelas" (ex: o detalhe da OC). Chutar
    // "A pagar" ali seria afirmar dívida sem ter olhado.
    const selo = seloDoLancamento("aprovado", "a_pagar", null);

    expect(selo.rotulo).toBe("Aprovado");
    expect(selo.etapa).toBeUndefined();
  });

  it("a receber aprovado com saldo lê 'A receber', não 'A pagar'", () => {
    // Mesma regra do rotuloStatusLancamento: num recebível a dívida é do cliente.
    const selo = seloDoLancamento("aprovado", "a_receber", 1_000);

    expect(selo.rotulo).toBe("A receber");
    expect(selo.badge).toBe("pendente_aprovacao");
    expect(selo.etapa).toBe("Aprovado");
  });

  it("status a_pagar num recebível continua lendo 'A receber'", () => {
    expect(seloDoLancamento("a_pagar", "a_receber", 1_000).rotulo).toBe(
      "A receber",
    );
  });
});
