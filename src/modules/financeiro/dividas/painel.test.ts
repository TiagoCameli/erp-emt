import { describe, expect, it } from "vitest";

import { montarPainelDividas, rotuloMesCurto } from "@/modules/financeiro/dividas/painel";
import type { ConsorcioRelatorio, ContratoRelatorio } from "@/modules/financeiro/dividas/relatorio";

function contrato(p: Partial<ContratoRelatorio>): ContratoRelatorio {
  return {
    contratoId: "c",
    credor: "BANCO",
    numero: "1",
    tipo: "capital_giro",
    status: "ativo",
    centroCustoId: "cc",
    centro: null,
    valorLiberado: 0,
    dataLiberacao: "2026-01-01",
    taxaAm: 0,
    sistema: "price",
    temCronograma: true,
    principalPago: 0,
    saldoDevedor: 0,
    jurosPagos: 0,
    jurosAPagar: 0,
    aPagar: 0,
    totalNoPrazo: 0,
    quitacaoHoje: 0,
    restantes: [],
    proximas: [],
    cet: null,
    ...p,
  };
}

function cota(p: Partial<ConsorcioRelatorio>): ConsorcioRelatorio {
  return {
    cotaId: "q",
    administradora: "ADM",
    grupo: "1",
    cota: "1",
    bem: "Caminhão",
    status: "ativa",
    valorCredito: 0,
    prazo: 0,
    parcelasPagas: 0,
    fundoComumPago: 0,
    taxaPaga: 0,
    aPagar: 0,
    divida: 0,
    contemplacaoData: null,
    contemplacaoForma: null,
    valorCarta: null,
    proximas: [],
    ...p,
  };
}

const HOJE = "2026-10-14";

describe("montarPainelDividas", () => {
  it("separa a vencida, distribui 12 meses a partir do corrente e corta o que passa da janela", () => {
    const painel = montarPainelDividas(
      [
        contrato({
          saldoDevedor: 900,
          jurosAPagar: 100.1,
          aPagar: 1000.1,
          restantes: [
            { data: "2026-09-05", valor: 100.1 }, // vencida
            { data: "2026-10-14", valor: 100 }, // hoje: mês corrente, não atraso
            { data: "2027-09-30", valor: 300 }, // 12º mês
            { data: "2027-10-01", valor: 500 }, // fora da janela
          ],
        }),
      ],
      [],
      HOJE,
    );

    expect(painel.meses.map((m) => m.chave)).toEqual([
      "atraso",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
      "2027-09",
    ]);
    expect(painel.atraso).toBe(100.1);
    expect(painel.parcelasEmAtraso).toBe(1);
    expect(painel.vence12Meses).toBe(400);
    expect(painel.meses[1]).toMatchObject({ contratos: 100, total: 100, parcelas: 1 });
    // Linha de controle: atraso + janela + fora da janela = tudo o que está em aberto.
    expect(painel.atraso + painel.vence12Meses + 500).toBe(painel.aPagar);
  });

  it("sem parcela vencida não desenha a barra de atraso", () => {
    const painel = montarPainelDividas([], [], HOJE);
    expect(painel.meses).toHaveLength(12);
    expect(painel.meses[0].chave).toBe("2026-10");
    expect(painel.atraso).toBe(0);
  });

  it("contrato quitado não entra em nada", () => {
    const painel = montarPainelDividas(
      [contrato({ status: "quitado", saldoDevedor: 50, aPagar: 50, restantes: [{ data: "2026-11-01", valor: 50 }] })],
      [],
      HOJE,
    );
    expect(painel.contratosAtivos).toBe(0);
    expect(painel.saldoDevedor).toBe(0);
    expect(painel.vence12Meses).toBe(0);
    expect(painel.credores).toEqual([]);
  });

  it("consórcio entra na própria série e a dívida é só a da cota contemplada", () => {
    const painel = montarPainelDividas(
      [contrato({ aPagar: 10, restantes: [{ data: "2026-11-10", valor: 10 }] })],
      [
        cota({ aPagar: 200, divida: 0, proximas: [{ numero: 1, vencimento: "2026-11-20", total: 20 }] }),
        cota({ status: "contemplada", aPagar: 300, divida: 300, proximas: [] }),
      ],
      HOJE,
    );
    expect(painel.meses.find((m) => m.chave === "2026-11")).toMatchObject({
      contratos: 10,
      consorcios: 20,
      total: 30,
      parcelas: 2,
    });
    expect(painel.vence12MesesContratos).toBe(10);
    expect(painel.vence12MesesConsorcios).toBe(20);
    expect(painel.consorciosAPagar).toBe(500);
    expect(painel.consorciosDivida).toBe(300);
    expect(painel.cotasEmAberto).toBe(2);
  });

  it("agrupa por credor, soma principal e juros e ordena do maior para o menor", () => {
    const painel = montarPainelDividas(
      [
        contrato({ credor: "BB", saldoDevedor: 100, jurosAPagar: 10 }),
        contrato({ credor: "CAIXA", saldoDevedor: 500, jurosAPagar: 50 }),
        contrato({ credor: "BB", saldoDevedor: 200, jurosAPagar: 20 }),
        contrato({ credor: "ZERADO", saldoDevedor: 0, jurosAPagar: 0 }),
      ],
      [],
      HOJE,
    );
    expect(painel.credores).toEqual([
      { credor: "CAIXA", contratos: 1, principal: 500, juros: 50, total: 550 },
      { credor: "BB", contratos: 2, principal: 300, juros: 30, total: 330 },
    ]);
    expect(painel.saldoDevedor).toBe(800);
  });
});

describe("rotuloMesCurto", () => {
  it("abrevia mês e ano", () => {
    expect(rotuloMesCurto("2026-10")).toBe("out/26");
    expect(rotuloMesCurto("2027-01")).toBe("jan/27");
  });
});
