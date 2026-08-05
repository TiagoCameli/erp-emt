import { describe, expect, it } from "vitest";

import {
  movimentoPorContaEmCentavos,
  saldoAtualDaConta,
  type MovimentoContaAgregado,
} from "@/modules/financeiro/contas-bancarias/saldo";

/**
 * A entrada aqui é o que `fn_rel_posicao_bancaria` devolve: UMA linha por conta
 * e tipo, com o total já somado no banco (e já pelo valor líquido, porque quem
 * soma é a RPC). Nenhum teste deste arquivo recebe lista de parcela: somar
 * parcela por parcela no Node era o defeito, o PostgREST corta em 1.000 linhas
 * sem erro e a BR-364 tem 1.696 parcelas pagas.
 */

const CONTA = "11111111-1111-1111-1111-111111111111";
const OUTRA = "22222222-2222-2222-2222-222222222222";

/** Saldo em reais de uma conta, do jeito que listarContas() monta. */
function saldo(
  saldoInicial: number | string,
  linhas: MovimentoContaAgregado[],
  contaId = CONTA,
): number {
  const movimento = movimentoPorContaEmCentavos(linhas);
  return saldoAtualDaConta(saldoInicial, movimento.get(contaId) ?? 0);
}

describe("saldo atual da conta bancária", () => {
  it("subtrai o total de a_pagar que veio somado do banco", () => {
    // O caso da BR-364: 1.696 parcelas pagas, R$ 1.696.000,00 de saída, que
    // chegam numa linha só. Antes, 696 delas ficavam de fora em silêncio.
    expect(
      saldo(2000000, [
        { contaBancariaId: CONTA, tipo: "a_pagar", total: 1696000 },
      ]),
    ).toBe(304000);
  });

  it("junta as duas linhas da mesma conta: a_receber soma, a_pagar subtrai", () => {
    expect(
      saldo(1000, [
        { contaBancariaId: CONTA, tipo: "a_receber", total: 300 },
        { contaBancariaId: CONTA, tipo: "a_pagar", total: 500 },
      ]),
    ).toBe(800);
  });

  it("NUMERIC que chega como string vira o real certo", () => {
    // O tipo gerado promete number, mas o PostgREST pode entregar NUMERIC como
    // string. Number("475400.00") tem que virar saída de R$ 475.400,00, não NaN.
    expect(
      saldo("500000.00", [
        { contaBancariaId: CONTA, tipo: "a_pagar", total: "475400.00" },
      ]),
    ).toBe(24600);
  });

  it("não mistura contas", () => {
    const linhas: MovimentoContaAgregado[] = [
      { contaBancariaId: CONTA, tipo: "a_pagar", total: 100 },
      { contaBancariaId: OUTRA, tipo: "a_pagar", total: 900 },
    ];
    expect(saldo(1000, linhas, CONTA)).toBe(900);
    expect(saldo(1000, linhas, OUTRA)).toBe(100);
  });

  it("conta que não aparece na RPC fica com o saldo inicial", () => {
    // Conta sem nenhuma parcela paga não vira linha na função do banco.
    expect(saldo(1000, [])).toBe(1000);
  });

  it("total nulo não vira NaN", () => {
    expect(
      saldo(1000, [{ contaBancariaId: CONTA, tipo: "a_pagar", total: null }]),
    ).toBe(1000);
  });

  it("soma em centavos: parcelas de centavo não acumulam erro", () => {
    // 0,10 + 0,20 vindos em duas linhas de tipos opostos: a subtração acontece
    // em inteiro, não em float.
    expect(
      saldo(0.3, [
        { contaBancariaId: CONTA, tipo: "a_pagar", total: 0.1 },
        { contaBancariaId: CONTA, tipo: "a_receber", total: 0.2 },
      ]),
    ).toBe(0.4);
  });
});
