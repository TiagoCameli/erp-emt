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

/**
 * Transferência entre contas, que a RPC passou a devolver em 20/08/2026.
 *
 * O erro que estes testes existem para pegar é de SINAL: `transferencia_entrada`
 * precisa somar. Se ela cair no `else` junto com as saídas, a conta que recebeu
 * aparece com o DOBRO do valor a menos — e não há erro na tela, só um saldo
 * errado que ninguém consegue explicar olhando a lista.
 */
describe("saldo com transferência entre contas", () => {
  it("a entrada SOMA no destino", () => {
    expect(
      saldo(1000, [
        { contaBancariaId: CONTA, tipo: "transferencia_entrada", total: 300 },
      ]),
    ).toBe(1300);
  });

  it("a saída SUBTRAI na origem, com a tarifa já embutida pela RPC", () => {
    // A RPC soma valor + tarifa numa linha só: o banco debita os dois da
    // origem. Aqui entram R$ 300 de transferência mais R$ 5 de tarifa.
    expect(
      saldo(1000, [
        { contaBancariaId: CONTA, tipo: "transferencia_saida", total: 305 },
      ]),
    ).toBe(695);
  });

  it("as quatro linhas da mesma conta se juntam", () => {
    expect(
      saldo(1000, [
        { contaBancariaId: CONTA, tipo: "a_receber", total: 200 },
        { contaBancariaId: CONTA, tipo: "a_pagar", total: 100 },
        { contaBancariaId: CONTA, tipo: "transferencia_entrada", total: 50 },
        { contaBancariaId: CONTA, tipo: "transferencia_saida", total: 30 },
      ]),
    ).toBe(1120);
  });

  /**
   * A prova de que a transferência é soma zero entre as duas contas quando não
   * há tarifa: o que sai de uma entra na outra, e o total das duas não muda.
   */
  it("sem tarifa, o total das duas contas não muda", () => {
    const linhas: MovimentoContaAgregado[] = [
      { contaBancariaId: CONTA, tipo: "transferencia_saida", total: 1000 },
      { contaBancariaId: OUTRA, tipo: "transferencia_entrada", total: 1000 },
    ];
    const origem = saldo(5000, linhas, CONTA);
    const destino = saldo(2000, linhas, OUTRA);

    expect(origem).toBe(4000);
    expect(destino).toBe(3000);
    expect(origem + destino).toBe(7000);
  });

  /**
   * LINHA DE CONTROLE: com tarifa, o total das duas contas TEM que cair, e cair
   * exatamente a tarifa. Se este teste desse zero como o de cima, seria sinal de
   * que a tarifa sumiu do cálculo em vez de estar sendo cobrada de alguém.
   */
  it("com tarifa, o total das duas contas cai exatamente a tarifa", () => {
    const linhas: MovimentoContaAgregado[] = [
      // 1.000 de transferência + 8,90 de tarifa saindo da origem.
      { contaBancariaId: CONTA, tipo: "transferencia_saida", total: 1008.9 },
      { contaBancariaId: OUTRA, tipo: "transferencia_entrada", total: 1000 },
    ];
    const origem = saldo(5000, linhas, CONTA);
    const destino = saldo(2000, linhas, OUTRA);

    expect(origem).toBe(3991.1);
    expect(destino).toBe(3000);

    // A diferença se confere em CENTAVOS INTEIROS, não em reais: 7000 -
    // (3991.1 + 3000) dá 8.899999999999636 em ponto flutuante, e a primeira
    // versão deste teste falhou por isso. O módulo estava certo -- os dois
    // saldos acima vieram exatos, porque a soma dele já é em centavos. Quem
    // errou foi a asserção, e é o mesmo erro que a tela cometeria se somasse
    // reais para montar um total.
    const centavos = (reais: number) => Math.round(reais * 100);
    expect(centavos(7000) - (centavos(origem) + centavos(destino))).toBe(890);
  });

  it("NUMERIC string na transferência também vira o real certo", () => {
    expect(
      saldo(1000, [
        {
          contaBancariaId: CONTA,
          tipo: "transferencia_entrada",
          total: "1234.56",
        },
      ]),
    ).toBe(2234.56);
  });
});
