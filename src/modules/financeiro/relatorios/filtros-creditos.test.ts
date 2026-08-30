import { describe, expect, it } from "vitest";

import {
  lerFiltrosCreditos,
  passaNaSituacao,
  recortarCreditosPorSituacao,
} from "@/modules/financeiro/relatorios/filtros-creditos";

/**
 * O filtro de situação do relatório de Créditos.
 *
 * A regra que ele carrega e que não se adivinha: "quitado" é NÃO TER próxima
 * parcela, e não "saldo devedor igual a zero". As duas coisas quase sempre
 * andam juntas, mas é a existência da parcela que a tabela já usa para escrever
 * "Quitado" na linha — e um filtro que discordasse da coluna ao lado seria pior
 * que filtro nenhum.
 */

function contrato(campos: {
  proximoVencimento: string | null;
  valorContratado?: number;
  totalPago?: number;
  saldoDevedor?: number;
}) {
  return {
    proximoVencimento: campos.proximoVencimento,
    valorContratado: campos.valorContratado ?? 0,
    totalPago: campos.totalPago ?? 0,
    saldoDevedor: campos.saldoDevedor ?? 0,
  };
}

describe("lerFiltrosCreditos", () => {
  it("sem parâmetro, não filtra nada", () => {
    expect(lerFiltrosCreditos({})).toEqual({ situacao: "" });
  });

  it("lê a situação escolhida", () => {
    expect(lerFiltrosCreditos({ situacao: "quitado" })).toEqual({
      situacao: "quitado",
    });
  });

  it("valor inventado na URL cai em 'todas', não em tela vazia", () => {
    // Link colado à mão não pode virar relatório em branco sem explicação.
    expect(lerFiltrosCreditos({ situacao: "pago" })).toEqual({ situacao: "" });
  });
});

describe("passaNaSituacao", () => {
  it("quitado é não ter próxima parcela, mesmo com saldo", () => {
    expect(passaNaSituacao(null, "quitado")).toBe(true);
    expect(passaNaSituacao("2026-09-20", "quitado")).toBe(false);
  });

  it("em aberto é ter próxima parcela", () => {
    expect(passaNaSituacao("2026-09-20", "em_aberto")).toBe(true);
    expect(passaNaSituacao(null, "em_aberto")).toBe(false);
  });

  it("sem escolha, passa tudo", () => {
    expect(passaNaSituacao(null, "")).toBe(true);
    expect(passaNaSituacao("2026-09-20", "")).toBe(true);
  });
});

describe("recortarCreditosPorSituacao", () => {
  const carteira = {
    contratos: [
      contrato({
        proximoVencimento: "2026-09-20",
        valorContratado: 1000,
        totalPago: 300.33,
        saldoDevedor: 699.67,
      }),
      contrato({
        proximoVencimento: null,
        valorContratado: 500,
        totalPago: 500,
        saldoDevedor: 0,
      }),
      contrato({
        proximoVencimento: "2026-10-15",
        valorContratado: 250.5,
        totalPago: 0.5,
        saldoDevedor: 250,
      }),
    ],
    totalContratado: 1750.5,
    totalPago: 800.83,
    totalSaldo: 949.67,
    proximosMeses: [{ mes: "2026-09", valor: 100 }],
    totalProximosMeses: 100,
  };

  it("sem filtro devolve o mesmo objeto, sem recalcular nada", () => {
    expect(recortarCreditosPorSituacao(carteira, "")).toBe(carteira);
  });

  it("os TOTAIS acompanham o recorte", () => {
    // É a regra do módulo: cartão que ignora o filtro da tabela embaixo dele
    // responde a uma pergunta que ninguém fez.
    const emAberto = recortarCreditosPorSituacao(carteira, "em_aberto");

    expect(emAberto.contratos).toHaveLength(2);
    expect(emAberto.totalContratado).toBe(1250.5);
    expect(emAberto.totalPago).toBe(300.83);
    expect(emAberto.totalSaldo).toBe(949.67);
  });

  it("quitado deixa só o contrato sem próxima parcela", () => {
    const quitados = recortarCreditosPorSituacao(carteira, "quitado");

    expect(quitados.contratos).toHaveLength(1);
    expect(quitados.totalSaldo).toBe(0);
    expect(quitados.totalPago).toBe(500);
  });

  it("soma em centavos: o total do cartão fecha com a soma da tabela", () => {
    // Somar `number` de dinheiro dezenas de vezes é o caminho conhecido para o
    // cartão fechar um centavo longe da tabela.
    const emAberto = recortarCreditosPorSituacao(carteira, "em_aberto");
    const somaDaTabela = emAberto.contratos.reduce(
      (soma, c) => soma + c.totalPago,
      0,
    );

    expect(emAberto.totalPago).toBeCloseTo(somaDaTabela, 2);
    // E o número é exato, não só próximo: 300,33 + 0,50 dá 300,83 redondo.
    expect(emAberto.totalPago).toBe(300.83);
  });

  it("a curva de vencimentos NÃO é recortada", () => {
    // Todo vencimento futuro vem de contrato em aberto, então recortar seria
    // trabalho para chegar onde já se está.
    const emAberto = recortarCreditosPorSituacao(carteira, "em_aberto");
    expect(emAberto.proximosMeses).toBe(carteira.proximosMeses);
    expect(emAberto.totalProximosMeses).toBe(100);
  });
});
