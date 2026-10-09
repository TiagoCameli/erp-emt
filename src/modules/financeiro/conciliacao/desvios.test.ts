import { describe, expect, it } from "vitest";

import { textoDesvio, type DesvioDoFechamento } from "@/modules/financeiro/conciliacao/desvios";

// formatarBRL usa espaco nao separavel depois do "R$".
const texto = (d: DesvioDoFechamento) => textoDesvio(d).replace(/\s/g, " ");

describe("textoDesvio", () => {
  it("diz o mês por extenso e quanto o saldo subiu", () => {
    expect(texto({ mes: "2026-09-01", saldoFechamento: 100, saldoAgora: 1334.56, diferenca: 1234.56 })).toBe(
      "Setembro/2026: o saldo do app no fim do mês mudou +R$ 1.234,56 depois do fechamento",
    );
  });

  it("mostra o sinal quando o saldo caiu", () => {
    expect(texto({ mes: "2026-01-01", saldoFechamento: 50, saldoAgora: 40, diferenca: -10 })).toBe(
      "Janeiro/2026: o saldo do app no fim do mês mudou -R$ 10,00 depois do fechamento",
    );
  });
});
