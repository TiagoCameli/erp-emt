import { describe, expect, it } from "vitest";

import {
  montarEndividamento,
  type LinhaContratoRpc,
  type LinhaMesRpc,
} from "./endividamento";

function contrato(parcial: Partial<LinhaContratoRpc>): LinhaContratoRpc {
  return {
    lancamento_id: "id-1",
    numero: "LAN-2026-0001",
    credor: "Banco",
    descricao: "Contrato",
    categoria: "Empréstimos",
    valor_contratado: 0,
    total_pago: 0,
    saldo_devedor: 0,
    parcelas: 1,
    parcelas_pagas: 0,
    proximo_vencimento: "2026-09-20",
    ...parcial,
  };
}

describe("montarEndividamento", () => {
  it("ordena por saldo devedor, do maior para o menor", () => {
    const { contratos } = montarEndividamento(
      [
        contrato({ lancamento_id: "medio", saldo_devedor: 500 }),
        contrato({ lancamento_id: "maior", saldo_devedor: 900 }),
        contrato({ lancamento_id: "menor", saldo_devedor: 100 }),
      ],
      [],
    );

    expect(contratos.map((c) => c.lancamentoId)).toEqual([
      "maior",
      "medio",
      "menor",
    ]);
  });

  it("joga o contrato quitado para o fim, e ele não tem próximo vencimento", () => {
    const { contratos } = montarEndividamento(
      [
        contrato({
          lancamento_id: "quitado",
          saldo_devedor: 0,
          parcelas: 10,
          parcelas_pagas: 10,
          proximo_vencimento: null,
        }),
        contrato({ lancamento_id: "devendo", saldo_devedor: 1 }),
      ],
      [],
    );

    expect(contratos[1].lancamentoId).toBe("quitado");
    expect(contratos[1].proximoVencimento).toBeNull();
    expect(contratos[1].saldoDevedor).toBe(0);
  });

  it("soma os totais por centavos, e não somando os reais", () => {
    /*
     * LINHA DE CONTROLE. Estes três valores existem para quebrar: somados como
     * `number` de reais eles dão 2651428.2399999998, e o total da tela passaria
     * a discordar do total do banco por um centavo num relatório de milhões.
     * Trocar a soma em centavos por `a + b` derruba este teste.
     */
    const { totalSaldo, totalContratado, totalPago } = montarEndividamento(
      [
        contrato({ saldo_devedor: 326195.81, valor_contratado: 0.07 }),
        contrato({ saldo_devedor: 2078999.36, valor_contratado: 0.07 }),
        contrato({ saldo_devedor: 246233.07, valor_contratado: 0.07 }),
      ],
      [],
    );

    expect(totalSaldo).toBe(2651428.24);
    expect(totalContratado).toBe(0.21);
    expect(totalPago).toBe(0);
  });

  it("rotula o mês como MM/YYYY e soma o período", () => {
    const meses: LinhaMesRpc[] = [
      { mes: "2026-08-01", valor: 176460.57, parcelas: 3 },
      { mes: "2026-09-01", valor: 364626.12, parcelas: 10 },
    ];

    const { proximosMeses, totalProximosMeses } = montarEndividamento(
      [],
      meses,
    );

    expect(proximosMeses.map((m) => m.rotulo)).toEqual(["08/2026", "09/2026"]);
    expect(proximosMeses[0].parcelas).toBe(3);
    expect(totalProximosMeses).toBe(541086.69);
  });

  it("devolve tudo zerado quando nada foi marcado como dívida", () => {
    const vazio = montarEndividamento([], []);

    expect(vazio.contratos).toEqual([]);
    expect(vazio.proximosMeses).toEqual([]);
    expect(vazio.totalSaldo).toBe(0);
    expect(vazio.totalProximosMeses).toBe(0);
  });
});
