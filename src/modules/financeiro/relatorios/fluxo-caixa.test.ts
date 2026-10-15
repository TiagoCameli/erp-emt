import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import {
  fraseDoFluxo,
  fraseDoSaldo,
  montarFluxoCaixa,
  ponteDoCaixa,
  saldoDePartida,
  type LinhaFluxoRpc,
} from "@/modules/financeiro/relatorios/fluxo-caixa";

/**
 * Os números lembram os da base em 15/10/2026: julho tem a medição recebida, o
 * financiamento liberado, um resgate manual de aplicação e CAPEX pago; outubro
 * em diante só tem saídas previstas (CAPEX, prestação, obra), porque as
 * medições do DNIT ainda não viram parcela a receber.
 */
const CORRENTE = "2026-10";

const LINHAS: LinhaFluxoRpc[] = [
  { mes: "2026-07", tipo: "a_receber", grupo: "operacao", realizado: true, total: 5_558_839.77 },
  { mes: "2026-07", tipo: "emprestimo_tomado", grupo: "divida", realizado: true, total: 2_298_000 },
  // O resgate manual é série `a_receber` (legado) e grupo `aplicacao`: até
  // 15/10 ele inflava as "entradas operacionais".
  { mes: "2026-07", tipo: "a_receber", grupo: "aplicacao", realizado: true, total: 1_000_000 },
  { mes: "2026-07", tipo: "a_pagar", grupo: "operacao", realizado: true, total: 4_000_000 },
  // CAPEX, distribuição e mútuo eram "saídas operacionais".
  { mes: "2026-07", tipo: "a_pagar", grupo: "investimento", realizado: true, total: 700_000 },
  { mes: "2026-07", tipo: "a_pagar", grupo: "socios", realizado: true, total: 300_000 },
  { mes: "2026-07", tipo: "a_receber", grupo: "socios", realizado: true, total: 100_000 },
  // Rendimento de aplicação: série `a_receber`, grupo nulo. Fora do caixa.
  { mes: "2026-07", tipo: "a_receber", grupo: null, realizado: true, total: 363_571.31 },
  // Outubro: parte já paga (está no saldo de hoje), parte ainda prevista.
  { mes: "2026-10", tipo: "a_pagar", grupo: "operacao", realizado: true, total: 100_000 },
  { mes: "2026-10", tipo: "a_pagar", grupo: "operacao", realizado: false, total: 50_000 },
  { mes: "2026-11", tipo: "a_pagar", grupo: "investimento", realizado: false, total: 286_447.61 },
  { mes: "2026-11", tipo: "amortizacao", grupo: "divida", realizado: false, total: 380_821.67 },
  { mes: "2026-12", tipo: "a_pagar", grupo: "operacao", realizado: false, total: 249_459.79 },
  { mes: "2026-12", tipo: "amortizacao", grupo: "divida", realizado: false, total: 302_978.51 },
];

/** Disponível e aplicado de 15/10/2026. */
const DISPONIVEL = -690_477.58;
const APLICADO = 10_583_093.4;

function mes(fluxo: ReturnType<typeof montarFluxoCaixa>, chave: string) {
  const achado = fluxo.meses.find((m) => m.mes === chave);
  if (!achado) throw new Error(`mês ${chave} não veio`);
  return achado;
}

describe("montarFluxoCaixa: cinco grupos pela natureza", () => {
  const fluxo = montarFluxoCaixa({
    linhas: LINHAS,
    mesCorrente: CORRENTE,
    saldoInicial: DISPONIVEL,
    aplicado: APLICADO,
  });

  it("o resgate de aplicação não é entrada da operação", () => {
    const julho = mes(fluxo, "2026-07");
    expect(julho.grupos.operacao.entrada.total).toBe(5_558_839.77);
    expect(julho.grupos.aplicacao.entrada.total).toBe(1_000_000);
  });

  it("CAPEX e sócios não são saída da operação", () => {
    const julho = mes(fluxo, "2026-07");
    expect(julho.grupos.operacao.saida.total).toBe(4_000_000);
    expect(julho.grupos.investimento.saida.total).toBe(700_000);
    expect(julho.grupos.socios).toEqual({
      entrada: { realizado: 100_000, projetado: 0, total: 100_000 },
      saida: { realizado: 300_000, projetado: 0, total: 300_000 },
      liquido: -200_000,
    });
  });

  it("empréstimo tomado e amortização são o grupo dívida, cada um no seu lado", () => {
    expect(mes(fluxo, "2026-07").grupos.divida.entrada.total).toBe(2_298_000);
    expect(mes(fluxo, "2026-11").grupos.divida.saida.projetado).toBe(380_821.67);
  });

  it("grupo nulo (rendimento) fica fora do caixa", () => {
    // Somando o rendimento, julho entraria com 363 mil a mais, e o saldo
    // projetado partiria de um dinheiro que não passou pela conta corrente.
    const julho = mes(fluxo, "2026-07");
    expect(julho.entradas).toBe(5_558_839.77 + 2_298_000 + 1_000_000 + 100_000);
  });

  it("série desconhecida e grupo desconhecido ficam fora em vez de cair num lado", () => {
    const comLixo = montarFluxoCaixa({
      linhas: [
        ...LINHAS,
        { mes: "2026-11", tipo: "banana", grupo: "operacao", realizado: false, total: 1 },
        { mes: "2026-11", tipo: "a_pagar", grupo: "banana", realizado: false, total: 1 },
      ],
      mesCorrente: CORRENTE,
      saldoInicial: DISPONIVEL,
    });
    expect(comLixo.totalSaidas).toBe(fluxo.totalSaidas);
    expect(comLixo.totalEntradas).toBe(fluxo.totalEntradas);
  });

  it("o líquido da janela é a soma dos líquidos dos grupos, e entradas menos saídas", () => {
    const soma = Object.values(fluxo.grupos).reduce((s, g) => s + g.liquido, 0);
    expect(fluxo.liquidoJanela).toBeCloseTo(soma, 2);
    expect(fluxo.liquidoJanela).toBeCloseTo(fluxo.totalEntradas - fluxo.totalSaidas, 2);
    // 5.558.839,77 - 4.000.000,00 - 100.000,00 - 50.000,00 - 249.459,79, em
    // centavos: o resultado sai redondo, sem o resíduo do ponto flutuante.
    expect(fluxo.grupos.operacao.liquido).toBe(1_159_379.98);
  });
});

describe("montarFluxoCaixa: saldo acumulado", () => {
  const fluxo = montarFluxoCaixa({
    linhas: LINHAS,
    mesCorrente: CORRENTE,
    saldoInicial: DISPONIVEL,
    aplicado: APLICADO,
  });

  it("mês passado não ganha saldo acumulado, só o líquido", () => {
    expect(mes(fluxo, "2026-07").saldoAcumulado).toBeNull();
    expect(mes(fluxo, "2026-07").saldoComAplicado).toBeNull();
  });

  it("o mês corrente parte do saldo de hoje e soma só o previsto", () => {
    // Os R$ 100.000,00 pagos em outubro já saíram do saldo de hoje: somá-los de
    // novo contaria a mesma saída duas vezes.
    expect(mes(fluxo, "2026-10").saldoAcumulado).toBe(-740_477.58);
  });

  it("cada mês futuro é o anterior mais entradas menos saídas previstas", () => {
    expect(mes(fluxo, "2026-11").saldoAcumulado).toBe(-1_407_746.86);
    expect(mes(fluxo, "2026-12").saldoAcumulado).toBe(-1_960_185.16);
  });

  it("a segunda linha é o disponível mais o aplicado de hoje", () => {
    expect(mes(fluxo, "2026-12").saldoComAplicado).toBe(8_622_908.24);
  });

  it("o saldo projetado é o do último mês da janela, com e sem o aplicado", () => {
    const comJanela = montarFluxoCaixa({
      linhas: LINHAS,
      janela: { de: "2025-10", ate: "2027-10" },
      mesCorrente: CORRENTE,
      saldoInicial: DISPONIVEL,
      aplicado: APLICADO,
    });
    expect(comJanela.saldoProjetado).toEqual({
      tipo: "calculado",
      mes: "2027-10",
      valor: -1_960_185.16,
      saldoInicial: DISPONIVEL,
      aplicado: APLICADO,
      valorComAplicado: 8_622_908.24,
    });
  });

  it("sem subconta visível, a linha com o aplicado não existe (não é zero)", () => {
    const semAplicado = montarFluxoCaixa({
      linhas: LINHAS,
      mesCorrente: CORRENTE,
      saldoInicial: DISPONIVEL,
    });
    expect(mes(semAplicado, "2026-12").saldoComAplicado).toBeNull();
    expect(semAplicado.saldoProjetado).toMatchObject({
      aplicado: null,
      valorComAplicado: null,
    });
  });

  it("janela que começa no futuro ainda soma os previstos até ela", () => {
    // Olhar só dezembro não pode fazer o saldo de dezembro esquecer novembro.
    const soDezembro = montarFluxoCaixa({
      linhas: LINHAS,
      janela: { de: "2026-12", ate: "2026-12" },
      mesCorrente: CORRENTE,
      saldoInicial: DISPONIVEL,
    });
    expect(soDezembro.meses.map((m) => m.mes)).toEqual(["2026-12"]);
    expect(soDezembro.meses[0].saldoAcumulado).toBe(-1_960_185.16);
  });

  it("o que venceu e não foi pago entra no ponto de partida", () => {
    // Um a pagar de agosto ainda em aberto não está no saldo de hoje: sem isto
    // ele nunca entraria na projeção e o saldo ficaria inflado.
    const comAtraso = montarFluxoCaixa({
      linhas: [
        { mes: "2026-08", tipo: "a_pagar", grupo: "operacao", realizado: false, total: 10_000 },
        { mes: "2026-08", tipo: "a_receber", grupo: "operacao", realizado: true, total: 999 },
        { mes: "2026-10", tipo: "a_pagar", grupo: "investimento", realizado: false, total: 1_000 },
      ],
      mesCorrente: CORRENTE,
      saldoInicial: 50_000,
    });
    expect(mes(comAtraso, "2026-08").saldoAcumulado).toBeNull();
    expect(mes(comAtraso, "2026-10").saldoAcumulado).toBe(39_000);
    expect(comAtraso.saldoProjetado).toMatchObject({ tipo: "calculado", valor: 39_000 });
  });

  it("sem conta visível, diz isso em vez de projetar a partir de zero", () => {
    const semSaldo = montarFluxoCaixa({
      linhas: LINHAS,
      mesCorrente: CORRENTE,
      saldoInicial: null,
      aplicado: APLICADO,
    });
    expect(semSaldo.saldoProjetado).toEqual({ tipo: "sem_saldo_visivel" });
    expect(semSaldo.meses.every((m) => m.saldoAcumulado === null)).toBe(true);
    expect(semSaldo.meses.every((m) => m.saldoComAplicado === null)).toBe(true);
  });

  it("com centro escolhido, não soma fatia de obra ao saldo da empresa", () => {
    const comCentro = montarFluxoCaixa({
      linhas: LINHAS,
      mesCorrente: CORRENTE,
      saldoInicial: DISPONIVEL,
      aplicado: APLICADO,
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
      saldoInicial: DISPONIVEL,
    });
    expect(passado.saldoProjetado).toEqual({ tipo: "janela_no_passado" });
    expect(passado.previstoAFrente).toBeNull();
  });
});

describe("previsto à frente e o aviso de projeção só com saídas", () => {
  const fluxo = montarFluxoCaixa({
    linhas: LINHAS,
    mesCorrente: CORRENTE,
    saldoInicial: DISPONIVEL,
    aplicado: APLICADO,
  });

  it("separa o CAPEX das saídas previstas a partir do mês corrente", () => {
    expect(fluxo.previstoAFrente).toEqual({
      desde: CORRENTE,
      entradasDaOperacao: 0,
      saidas: 50_000 + 286_447.61 + 380_821.67 + 249_459.79 + 302_978.51,
      saidasDeInvestimento: 286_447.61,
    });
  });

  it("sem a receber futuro, o aviso diz que a projeção só desce e por quê", () => {
    const frases = fraseDoSaldo(fluxo, formatarBRL);
    expect(frases?.aviso).toContain("não há nenhuma entrada da operação lançada");
    expect(frases?.aviso).toContain(formatarBRL(286_447.61));
  });

  it("com a receber futuro lançado, não há aviso", () => {
    const comReceber = montarFluxoCaixa({
      linhas: [
        ...LINHAS,
        { mes: "2026-11", tipo: "a_receber", grupo: "operacao", realizado: false, total: 1 },
      ],
      mesCorrente: CORRENTE,
      saldoInicial: DISPONIVEL,
    });
    expect(fraseDoSaldo(comReceber, formatarBRL)?.aviso).toBeNull();
  });

  it("a frase do saldo traz o disponível, o aplicado e as duas projeções", () => {
    const frase = fraseDoSaldo(fluxo, formatarBRL)?.saldo ?? "";
    expect(frase).toContain(formatarBRL(DISPONIVEL));
    expect(frase).toContain(formatarBRL(APLICADO));
    expect(frase).toContain(formatarBRL(-1_960_185.16));
    expect(frase).toContain(formatarBRL(8_622_908.24));
  });
});

describe("ponteDoCaixa e fraseDoFluxo", () => {
  const fluxo = montarFluxoCaixa({
    linhas: LINHAS,
    mesCorrente: CORRENTE,
    saldoInicial: DISPONIVEL,
  });
  const ponte = ponteDoCaixa(fluxo);

  it("vai da operação à sobra, passando por cada grupo com movimento", () => {
    expect(ponte.degraus.map((d) => d.id)).toEqual([
      "operacao-entrada",
      "operacao-saida",
      "geracao",
      "investimento",
      "socios",
      "divida",
      "aplicacao",
      "sobra",
    ]);
  });

  it("a escada fecha: o último degrau termina onde a sobra começa e acaba", () => {
    const aplicacao = ponte.degraus.find((d) => d.id === "aplicacao")!;
    const sobra = ponte.degraus.at(-1)!;
    expect(aplicacao.ate).toBeCloseTo(sobra.valor, 2);
    expect(sobra.valor).toBeCloseTo(fluxo.liquidoJanela, 2);
    const geracao = ponte.degraus.find((d) => d.id === "geracao")!;
    expect(geracao.valor).toBe(fluxo.grupos.operacao.liquido);
  });

  it("grupo zerado na janela não ganha degrau", () => {
    const soOperacao = ponteDoCaixa(
      montarFluxoCaixa({
        linhas: [LINHAS[0], LINHAS[3]],
        mesCorrente: CORRENTE,
        saldoInicial: DISPONIVEL,
      }),
    );
    expect(soOperacao.degraus.map((d) => d.id)).toEqual([
      "operacao-entrada",
      "operacao-saida",
      "geracao",
      "sobra",
    ]);
  });

  it("a frase conta a mesma história, com os números", () => {
    const frase = fraseDoFluxo(fluxo, formatarBRL);
    expect(frase).toContain(`a operação gerou ${formatarBRL(1_159_379.98)}`);
    expect(frase).toContain(`o CAPEX levou ${formatarBRL(986_447.61)}`);
    expect(frase).toContain(`sócios e mútuo levaram ${formatarBRL(200_000)} líquidos`);
    expect(frase).toContain(`o resgate de aplicações trouxe ${formatarBRL(1_000_000)}`);
    expect(frase).toMatch(/Somando tudo, (sobraram|faltaram)/);
  });
});

describe("saldoDePartida", () => {
  const contas = [
    { id: "bb", tipo: "corrente", ativo: true },
    { id: "cef", tipo: "corrente", ativo: true },
    { id: "cofre", tipo: "caixa", ativo: true },
    { id: "bb-inv", tipo: "investimento", ativo: true },
    { id: "poupa", tipo: "poupanca", ativo: true },
    { id: "velha", tipo: "corrente", ativo: false },
  ];

  it("soma o disponível (correntes e caixa) e, à parte, o aplicado", () => {
    expect(
      saldoDePartida(contas, [
        { conta_bancaria_id: "bb", saldo: -44_714.58 },
        { conta_bancaria_id: "cef", saldo: -5_763 },
        { conta_bancaria_id: "cofre", saldo: 0 },
        { conta_bancaria_id: "bb-inv", saldo: 124_961.98 },
        { conta_bancaria_id: "poupa", saldo: 1_000 },
        { conta_bancaria_id: "velha", saldo: 50 },
      ]),
    ).toEqual({
      saldo: -50_477.58,
      contas: 3,
      ocultas: 0,
      aplicado: 125_961.98,
      contasAplicadas: 2,
    });
  });

  it("conta corrente sem saldo visível fica fora e é contada", () => {
    expect(
      saldoDePartida(contas, [{ conta_bancaria_id: "bb", saldo: 2_241_486.72 }]),
    ).toEqual({
      saldo: 2_241_486.72,
      contas: 1,
      ocultas: 2,
      aplicado: null,
      contasAplicadas: 0,
    });
  });

  it("nenhuma conta visível é null, não zero", () => {
    expect(saldoDePartida(contas, [])).toMatchObject({
      saldo: null,
      contas: 0,
      ocultas: 3,
      aplicado: null,
    });
  });
});
