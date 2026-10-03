import { describe, expect, it } from "vitest";

import {
  montarFluxoCaixa,
  saldoDePartida,
  type LinhaFluxoRpc,
} from "@/modules/financeiro/relatorios/fluxo-caixa";

/**
 * Os números são os da base em 03/10/2026, depois da D1: julho tem o
 * financiamento liberado (R$ 2.298.000,00) e as medições recebidas; novembro e
 * dezembro têm as prestações que antes não apareciam no fluxo.
 */
const CORRENTE = "2026-10";

const LINHAS: LinhaFluxoRpc[] = [
  { mes: "2026-07", tipo: "a_receber", realizado: true, total: 5_558_839.77 },
  { mes: "2026-07", tipo: "emprestimo_tomado", realizado: true, total: 2_298_000 },
  { mes: "2026-07", tipo: "a_pagar", realizado: true, total: 4_000_000 },
  // Outubro: parte já paga (está no saldo de hoje), parte ainda prevista.
  { mes: "2026-10", tipo: "a_pagar", realizado: true, total: 100_000 },
  { mes: "2026-10", tipo: "a_pagar", realizado: false, total: 50_000 },
  { mes: "2026-10", tipo: "a_receber", realizado: false, total: 80_000 },
  { mes: "2026-11", tipo: "a_pagar", realizado: false, total: 286_447.61 },
  { mes: "2026-11", tipo: "amortizacao", realizado: false, total: 380_821.67 },
  { mes: "2026-12", tipo: "a_pagar", realizado: false, total: 249_459.79 },
  { mes: "2026-12", tipo: "amortizacao", realizado: false, total: 302_978.51 },
];

/** BB 30.893-5 mais Caixa 578367973-5, os dois saldos de 03/10/2026. */
const SALDO_HOJE = 2_241_486.72 + 543_929.6;

function mes(fluxo: ReturnType<typeof montarFluxoCaixa>, chave: string) {
  const achado = fluxo.meses.find((m) => m.mes === chave);
  if (!achado) throw new Error(`mês ${chave} não veio`);
  return achado;
}

describe("montarFluxoCaixa: quatro séries", () => {
  const fluxo = montarFluxoCaixa({
    linhas: LINHAS,
    mesCorrente: CORRENTE,
    saldoInicial: SALDO_HOJE,
  });

  it("separa cada série no mês, sem misturar movimentação com operacional", () => {
    const novembro = mes(fluxo, "2026-11");
    expect(novembro.aPagarProjetado).toBe(286_447.61);
    expect(novembro.amortizacaoProjetado).toBe(380_821.67);
    const julho = mes(fluxo, "2026-07");
    expect(julho.emprestimoTomadoRealizado).toBe(2_298_000);
    expect(julho.aReceberRealizado).toBe(5_558_839.77);
  });

  it("entradas e saídas do mês somam as duas séries de cada lado", () => {
    const julho = mes(fluxo, "2026-07");
    expect(julho.entradas).toBe(7_856_839.77);
    expect(julho.saidas).toBe(4_000_000);
    expect(julho.liquido).toBe(3_856_839.77);
    const dezembro = mes(fluxo, "2026-12");
    expect(dezembro.saidas).toBe(552_438.3);
    expect(dezembro.liquido).toBe(-552_438.3);
  });

  it("os totais da janela somam as quatro séries", () => {
    expect(fluxo.series.emprestimo_tomado).toEqual({
      total: 2_298_000,
      realizado: 2_298_000,
    });
    expect(fluxo.series.amortizacao).toEqual({ total: 683_800.18, realizado: 0 });
    expect(fluxo.totalEntradas).toBe(5_558_839.77 + 2_298_000 + 80_000);
    expect(fluxo.totalSaidas).toBe(
      4_000_000 + 150_000 + 286_447.61 + 380_821.67 + 249_459.79 + 302_978.51,
    );
    expect(fluxo.liquidoJanela).toBeCloseTo(
      fluxo.totalEntradas - fluxo.totalSaidas,
      2,
    );
  });

  it("série desconhecida fica fora em vez de cair num lado", () => {
    const comLixo = montarFluxoCaixa({
      linhas: [...LINHAS, { mes: "2026-11", tipo: "banana", realizado: false, total: 1 }],
      mesCorrente: CORRENTE,
      saldoInicial: SALDO_HOJE,
    });
    expect(comLixo.totalSaidas).toBe(fluxo.totalSaidas);
    expect(comLixo.totalEntradas).toBe(fluxo.totalEntradas);
  });
});

describe("montarFluxoCaixa: saldo acumulado", () => {
  const fluxo = montarFluxoCaixa({
    linhas: LINHAS,
    mesCorrente: CORRENTE,
    saldoInicial: SALDO_HOJE,
  });

  it("mês passado não ganha saldo acumulado, só o líquido", () => {
    expect(mes(fluxo, "2026-07").saldoAcumulado).toBeNull();
    expect(mes(fluxo, "2026-07").liquido).toBe(3_856_839.77);
  });

  it("o mês corrente parte do saldo de hoje e soma só o previsto", () => {
    // Os R$ 100.000,00 pagos em outubro já saíram do saldo de hoje: somá-los de
    // novo contaria a mesma saída duas vezes.
    expect(mes(fluxo, "2026-10").saldoAcumulado).toBe(
      Math.round((SALDO_HOJE + 80_000 - 50_000) * 100) / 100,
    );
  });

  it("cada mês futuro é o anterior mais entradas menos saídas previstas", () => {
    const outubro = mes(fluxo, "2026-10").saldoAcumulado ?? 0;
    const novembro = mes(fluxo, "2026-11").saldoAcumulado ?? 0;
    const dezembro = mes(fluxo, "2026-12").saldoAcumulado ?? 0;
    expect(novembro).toBeCloseTo(outubro - 286_447.61 - 380_821.67, 2);
    expect(dezembro).toBeCloseTo(novembro - 249_459.79 - 302_978.51, 2);
  });

  it("o saldo projetado é o do último mês da janela", () => {
    const comJanela = montarFluxoCaixa({
      linhas: LINHAS,
      janela: { de: "2025-10", ate: "2027-10" },
      mesCorrente: CORRENTE,
      saldoInicial: SALDO_HOJE,
    });
    expect(comJanela.saldoProjetado).toEqual({
      tipo: "calculado",
      mes: "2027-10",
      valor: mes(fluxo, "2026-12").saldoAcumulado,
      saldoInicial: SALDO_HOJE,
    });
  });

  it("janela que começa no futuro ainda soma os previstos até ela", () => {
    // Olhar só dezembro não pode fazer o saldo de dezembro esquecer novembro.
    const soDezembro = montarFluxoCaixa({
      linhas: LINHAS,
      janela: { de: "2026-12", ate: "2026-12" },
      mesCorrente: CORRENTE,
      saldoInicial: SALDO_HOJE,
    });
    expect(soDezembro.meses.map((m) => m.mes)).toEqual(["2026-12"]);
    expect(soDezembro.meses[0].saldoAcumulado).toBe(
      mes(fluxo, "2026-12").saldoAcumulado,
    );
  });

  it("janela aberta termina no último mês com movimento", () => {
    expect(fluxo.saldoProjetado).toMatchObject({ tipo: "calculado", mes: "2026-12" });
  });

  it("sem conta visível, diz isso em vez de projetar a partir de zero", () => {
    const semSaldo = montarFluxoCaixa({
      linhas: LINHAS,
      mesCorrente: CORRENTE,
      saldoInicial: null,
    });
    expect(semSaldo.saldoProjetado).toEqual({ tipo: "sem_saldo_visivel" });
    expect(semSaldo.meses.every((m) => m.saldoAcumulado === null)).toBe(true);
  });

  it("com centro escolhido, não soma fatia de obra ao saldo da empresa", () => {
    const comCentro = montarFluxoCaixa({
      linhas: LINHAS,
      mesCorrente: CORRENTE,
      saldoInicial: SALDO_HOJE,
      comCorteDeCentro: true,
    });
    expect(comCentro.saldoProjetado).toEqual({ tipo: "com_centro" });
    expect(comCentro.meses.every((m) => m.saldoAcumulado === null)).toBe(true);
  });

  it("janela que termina antes de hoje não tem saldo para projetar", () => {
    const passado = montarFluxoCaixa({
      linhas: LINHAS,
      janela: { ate: "2026-08" },
      mesCorrente: CORRENTE,
      saldoInicial: SALDO_HOJE,
    });
    expect(passado.saldoProjetado).toEqual({ tipo: "janela_no_passado" });
  });
});

describe("saldoDePartida", () => {
  const contas = [
    { id: "bb", tipo: "corrente", ativo: true },
    { id: "cef", tipo: "corrente", ativo: true },
    { id: "cofre", tipo: "caixa", ativo: true },
    { id: "bb-inv", tipo: "investimento", ativo: true },
    { id: "velha", tipo: "corrente", ativo: false },
  ];

  it("soma correntes e caixa ativas, sem a subconta de investimentos", () => {
    expect(
      saldoDePartida(contas, [
        { conta_bancaria_id: "bb", saldo: 2_241_486.72 },
        { conta_bancaria_id: "cef", saldo: 543_929.6 },
        { conta_bancaria_id: "cofre", saldo: 1_000 },
        { conta_bancaria_id: "bb-inv", saldo: 9_999_999 },
        { conta_bancaria_id: "velha", saldo: 50 },
      ]),
    ).toEqual({ saldo: 2_786_416.32, contas: 3, ocultas: 0 });
  });

  it("conta sem saldo visível fica fora e é contada", () => {
    expect(
      saldoDePartida(contas, [{ conta_bancaria_id: "bb", saldo: 2_241_486.72 }]),
    ).toEqual({ saldo: 2_241_486.72, contas: 1, ocultas: 2 });
  });

  it("nenhuma conta visível é null, não zero", () => {
    expect(saldoDePartida(contas, [])).toEqual({
      saldo: null,
      contas: 0,
      ocultas: 3,
    });
  });
});
