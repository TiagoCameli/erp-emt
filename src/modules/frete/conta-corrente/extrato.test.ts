import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import {
  cabecalhoDoExtrato,
  comSaldoAcumulado,
  contadoresDasAbas,
  corDoSaldo,
  dadosDaExportacao,
  ehEtamConstrutora,
  filtrarAbastecimentos,
  filtrarAjustes,
  filtrarFretes,
  filtrarPagamentos,
  filtrarPorMeses,
  filtrarTodos,
  memoriaDeCalculo,
  mesesDisponiveis,
  nomeArquivoExtrato,
  placaMovimento,
  precoBaseAbastecimento,
  rotuloMes,
  saldoDevedorCombustivelTotal,
  saldosVisiveis,
  totaisDe,
  type MovimentoExtrato,
  type SaldoTransportadora,
  type TipoMovimento,
} from "@/modules/frete/conta-corrente/extrato";

let seq = 0;
function mov(tipo: TipoMovimento, valor: number, data: string, troca: Partial<MovimentoExtrato> = {}): MovimentoExtrato {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    data,
    createdAt: data,
    tipo,
    valor,
    descricao: null,
    mesReferencia: `${data.slice(0, 7)}-01`,
    origemTabela: null,
    origemId: null,
    obraNome: null,
    fretePeso: null,
    freteKm: null,
    freteTkm: null,
    freteOrigem: null,
    freteDestino: null,
    freteInsumoNome: null,
    freteNotaFiscal: null,
    freteNotaFiscal2: null,
    fretePlaca: null,
    freteMotorista: null,
    saidaLitros: null,
    saidaPrecoCombustivel: null,
    saidaPrecoProprietario: null,
    saidaTaxaLitro: null,
    saidaPrecoMedioTanque: null,
    saidaCombustivelNome: null,
    saidaPlaca: null,
    saidaMotorista: null,
    saidaObservacoes: null,
    pagamentoMetodo: null,
    pagamentoNotaFiscal: null,
    pagamentoResponsavel: null,
    pagamentoPagoPor: null,
    pagamentoObservacoes: null,
    pagamentoLitros: null,
    ajusteCriadoPor: null,
    ...troca,
  };
}

describe("saldo corrido (TransportadoraExtratoList da origem)", () => {
  it("ordena crescente, começa do zero no recorte e devolve decrescente", () => {
    const a = mov("credito_frete", 1000, "2026-06-01T17:00:00Z");
    const b = mov("debito_pagamento_frete", 300, "2026-06-10T17:00:00Z");
    const c = mov("debito_abastecimento_emt", 50.1234, "2026-06-05T12:00:00Z");
    const resultado = comSaldoAcumulado([b, a, c]);
    expect(resultado.map((m) => m.id)).toEqual([b.id, c.id, a.id]);
    expect(resultado.map((m) => m.saldoAcumulado)).toEqual([649.8766, 949.8766, 1000]);
  });

  it("mesma data: desempata por created_at e depois por id (a origem não desempatava)", () => {
    const data = "2026-06-01T12:00:00Z";
    const primeiro = mov("credito_abastecimento_transterra", 100, data, { createdAt: "2026-06-01T12:00:01Z" });
    const segundo = mov("debito_abastecimento_transterra", 40, data, { createdAt: "2026-06-01T12:00:02Z" });
    const irmaoA = mov("credito_frete", 5, data, { id: "aaaaaaaa-0000-4000-8000-000000000000", createdAt: "2026-06-01T12:00:03Z" });
    const irmaoB = mov("credito_frete", 7, data, { id: "bbbbbbbb-0000-4000-8000-000000000000", createdAt: "2026-06-01T12:00:03Z" });
    for (const ordem of [
      [segundo, irmaoB, primeiro, irmaoA],
      [irmaoA, primeiro, irmaoB, segundo],
    ]) {
      const r = comSaldoAcumulado(ordem);
      expect(r.map((m) => m.id)).toEqual([irmaoB.id, irmaoA.id, segundo.id, primeiro.id]);
      expect(r.map((m) => m.saldoAcumulado)).toEqual([72, 65, 60, 100]);
    }
  });

  it("soma sem resíduo de float nas 4 casas", () => {
    const lista = Array.from({ length: 10 }, (_, i) => mov("credito_frete", 0.1, `2026-06-${String(i + 1).padStart(2, "0")}T12:00:00Z`));
    expect(comSaldoAcumulado(lista)[0]!.saldoAcumulado).toBe(1);
    expect(totaisDe(lista).creditos).toBe(1);
  });
});

describe("filtro de mês e cabeçalho", () => {
  const junho = mov("credito_frete", 1000, "2026-06-15T17:00:00Z");
  const julho = mov("debito_pagamento_frete", 400, "2026-07-02T17:00:00Z");
  const julho2 = mov("ajuste_manual_debito", 0.5, "2026-07-20T17:00:00Z", { mesReferencia: "2026-05-01" });
  const todos = [junho, julho, julho2];

  it("meses distintos pelo mês de referência, do mais novo para o mais velho", () => {
    expect(mesesDisponiveis(todos)).toEqual(["2026-07-01", "2026-06-01", "2026-05-01"]);
    expect(rotuloMes("2026-06-01")).toBe("Junho/2026");
  });

  it("filtra pelo mês de referência (não pela data)", () => {
    expect(filtrarPorMeses(todos, ["2026-05-01"])).toEqual([julho2]);
    expect(filtrarPorMeses(todos, [])).toEqual(todos);
  });

  it("sem mês: saldo da view; com mês: créditos menos débitos do recorte", () => {
    expect(cabecalhoDoExtrato(12345.67, todos, [])).toEqual({
      titulo: "Saldo atual",
      valor: 12345.67,
      sub: "3 movimentos no total",
    });
    expect(cabecalhoDoExtrato(12345.67, todos, ["2026-07-01"])).toEqual({
      titulo: "Saldo de Julho/2026",
      valor: -400,
      sub: "1 movimento no mês",
    });
    expect(cabecalhoDoExtrato(0, todos, ["2026-06-01", "2026-07-01"])).toEqual({
      titulo: "Saldo de 2 meses",
      valor: 600,
      sub: "2 movimentos no período",
    });
  });
});

describe("memória de cálculo (formatBreakdown da origem)", () => {
  it("frete: peso × km × tarifa, vazio se faltar um", () => {
    const m = mov("credito_frete", 0, "2026-06-01T17:00:00Z", { fretePeso: 32.5, freteKm: 120, freteTkm: 0.37 });
    expect(memoriaDeCalculo(m)).toBe(`32,50 t × 120,0 km × R$ 0,3700/tkm = ${formatarBRL(1443)}`);
    expect(memoriaDeCalculo({ ...m, freteKm: 0 })).toBe("");
  });

  it("débito em tanque externo, com e sem taxa", () => {
    const m = mov("debito_abastecimento_transterra", 0, "2026-06-01T12:00:00Z", {
      saidaLitros: 330.14,
      saidaPrecoCombustivel: 6.8,
      saidaTaxaLitro: 0.1,
    });
    expect(memoriaDeCalculo(m)).toBe(
      `330,14 L × (R$ 6,8000/L + R$ 0,1000/L taxa) = ${formatarBRL(330.14 * 6.9)}`,
    );
    expect(memoriaDeCalculo({ ...m, saidaTaxaLitro: 0 })).toBe(`330,14 L × R$ 6,8000/L = ${formatarBRL(330.14 * 6.8)}`);
  });

  it("crédito da dona do tanque usa o preço dela e cai no cobrado", () => {
    const m = mov("credito_abastecimento_transterra", 0, "2026-06-01T12:00:00Z", {
      saidaLitros: 100,
      saidaPrecoProprietario: 6.2,
      saidaPrecoCombustivel: 6.8,
      saidaTaxaLitro: 0,
    });
    expect(memoriaDeCalculo(m)).toBe(`100,00 L × R$ 6,2000/L (Areacre) = ${formatarBRL(620)}`);
    expect(memoriaDeCalculo({ ...m, saidaPrecoProprietario: null, saidaTaxaLitro: 0.1 })).toBe(
      `100,00 L × (R$ 6,8000/L Areacre + R$ 0,1000/L taxa) = ${formatarBRL(690)}`,
    );
  });

  it("débito em tanque da EMT: preço cobrado; sem preço, deriva do valor", () => {
    const m = mov("debito_abastecimento_emt", 4930, "2026-07-29T12:00:00Z", { saidaLitros: 725, saidaPrecoCombustivel: 6.8 });
    expect(memoriaDeCalculo(m)).toBe(`725,00 L × R$ 6,8000/L (cobrado da transportadora) = ${formatarBRL(4930)}`);
    expect(memoriaDeCalculo({ ...m, saidaPrecoCombustivel: null })).toBe(
      `725,00 L × R$ 6,8000/L (cobrado) = ${formatarBRL(4930)}`,
    );
  });

  it("pagamento e ajuste", () => {
    expect(
      memoriaDeCalculo(mov("debito_pagamento_frete", 10, "2026-06-01T17:00:00Z", { pagamentoMetodo: "pix", mesReferencia: "2026-05-01" })),
    ).toBe("Método: pix · Ref: 2026-05");
    expect(memoriaDeCalculo(mov("ajuste_manual_credito", 1, "2026-06-01T17:00:00Z"))).toBe("Ajuste manual lançado no extrato");
  });

  it("placa: a do frete ou a da saída; pagamento e ajuste não têm", () => {
    expect(placaMovimento(mov("credito_frete", 1, "2026-06-01T00:00:00Z", { fretePlaca: " ABC1D23 " }))).toBe("ABC1D23");
    expect(placaMovimento(mov("debito_abastecimento_emt", 1, "2026-06-01T00:00:00Z", { saidaPlaca: "XYZ9K88" }))).toBe("XYZ9K88");
    expect(placaMovimento(mov("debito_pagamento_frete", 1, "2026-06-01T00:00:00Z", { saidaPlaca: "XYZ9K88" }))).toBeNull();
  });
});

describe("abas", () => {
  const frete = mov("credito_frete", 100, "2026-06-01T17:00:00Z", { freteNotaFiscal: "123", obraNome: "BR-364 Lote 09", fretePlaca: "AAA1A11" });
  const extCred = mov("credito_abastecimento_transterra", 10, "2026-06-02T17:00:00Z");
  const extDeb = mov("debito_abastecimento_transterra", 20, "2026-06-03T17:00:00Z", { saidaMotorista: "João", saidaPrecoCombustivel: 6.8, saidaPrecoMedioTanque: 6.1 });
  const emt = mov("debito_abastecimento_emt", 30, "2026-06-04T17:00:00Z", { saidaPrecoCombustivel: 6.8, saidaPrecoMedioTanque: 6.1 });
  const pag = mov("debito_pagamento_frete", 40, "2026-06-05T17:00:00Z", { pagamentoMetodo: "boleto", pagamentoResponsavel: "Maria" });
  const ajC = mov("ajuste_manual_credito", 5, "2026-06-06T17:00:00Z", { descricao: "Diferença de preço", ajusteCriadoPor: "Tiago" });
  const ajD = mov("ajuste_manual_debito", 1, "2026-06-07T17:00:00Z", { descricao: "Arredondamento" });
  const todos = [frete, extCred, extDeb, emt, pag, ajC, ajD];

  it("contadores: crédito da dona do tanque só aparece em Todos", () => {
    expect(contadoresDasAbas(todos)).toEqual({ todos: 7, fretes: 1, abastecimentos: 2, pagamentos: 1, ajustes: 2 });
  });

  it("Todos filtra por tipo e por placa/descrição, com saldo do recorte", () => {
    const soDebitos = filtrarTodos(todos, ["debito_pagamento_frete", "ajuste_manual_debito"], "");
    expect(soDebitos.map((m) => m.id)).toEqual([ajD.id, pag.id]);
    expect(soDebitos[0]!.saldoAcumulado).toBe(-41);
    expect(filtrarTodos(todos, [], "aaa1a").map((m) => m.id)).toEqual([frete.id]);
  });

  it("Fretes busca em NF e obra", () => {
    expect(filtrarFretes(todos, "lote 09")).toEqual([frete]);
    expect(filtrarFretes(todos, "999")).toEqual([]);
  });

  it("Abastecimentos: categoria e preço base (médio do tanque só na EMT)", () => {
    expect(filtrarAbastecimentos(todos, "", "").map((m) => m.id)).toEqual([emt.id, extDeb.id]);
    expect(filtrarAbastecimentos(todos, "emt", "")).toEqual([emt]);
    expect(filtrarAbastecimentos(todos, "", "joão")).toEqual([extDeb]);
    expect(precoBaseAbastecimento(emt)).toBe(6.1);
    expect(precoBaseAbastecimento(extDeb)).toBe(6.8);
  });

  it("Pagamentos: método e busca", () => {
    expect(filtrarPagamentos(todos, "boleto", "")).toEqual([pag]);
    expect(filtrarPagamentos(todos, "pix", "")).toEqual([]);
    expect(filtrarPagamentos(todos, "", "maria")).toEqual([pag]);
  });

  it("Ajustes: sinal e busca por autor", () => {
    expect(filtrarAjustes(todos, "", "").map((m) => m.id)).toEqual([ajD.id, ajC.id]);
    expect(filtrarAjustes(todos, "credito", "")).toEqual([ajC]);
    expect(filtrarAjustes(todos, "", "tiago")).toEqual([ajC]);
  });

  it("recortes da exportação por tipo e saldo final da 1ª linha", () => {
    const d = dadosDaExportacao(todos, []);
    expect(d.creditosTanque).toEqual([extCred]);
    expect(d.abastecimentos.map((m) => m.id)).toEqual([emt.id, extDeb.id]);
    expect(d.totais.saldoFinal).toBe(100 + 10 - 20 - 30 - 40 + 5 - 1);
    expect(d.totais.saldoFinal).toBe(d.totais.saldo);
  });
});

describe("cards da conta corrente", () => {
  const saldo = (nome: string, extra: Partial<SaldoTransportadora> = {}): SaldoTransportadora => ({
    transportadoraId: nome,
    nome,
    saldo: 0,
    debitoCombustivelTotal: 0,
    creditoFreteTotal: 0,
    pagoFreteTotal: 0,
    qtdMovimentos: 0,
    ...extra,
  });

  it("esconde a ETAM pelo nome da origem e pela razão social do ERP", () => {
    for (const nome of ["ETAM Construtora", "CONSTRUTORA ETAM LTDA", " construtora  etam ltda. ", "Construtora Étam S/A"]) {
      expect(ehEtamConstrutora(nome)).toBe(true);
    }
    for (const nome of ["ETAM Transportes", "Areacre", "Construtora ETAM Norte Ltda", "EMT TRANSPORTES"]) {
      expect(ehEtamConstrutora(nome)).toBe(false);
    }
    const lista = [saldo("Areacre", { debitoCombustivelTotal: 10.5 }), saldo("CONSTRUTORA ETAM LTDA", { debitoCombustivelTotal: 99 })];
    expect(saldosVisiveis(lista).map((s) => s.nome)).toEqual(["Areacre"]);
    expect(saldoDevedorCombustivelTotal(saldosVisiveis(lista))).toBe(10.5);
  });

  it("cor do saldo: verde > 0, vermelho < 0, cinza 0", () => {
    expect(corDoSaldo(0.0037)).toBe("positivo");
    expect(corDoSaldo(-1)).toBe("negativo");
    expect(corDoSaldo(0)).toBe("zero");
  });

  it("nome do arquivo", () => {
    expect(nomeArquivoExtrato("EMT TRANSPORTES", "2026-09-24", "xlsx")).toBe("extrato-transportadora-emt-transportes-2026-09-24.xlsx");
    expect(nomeArquivoExtrato("Transportadora Soares", "2026-09-24", "pdf")).toBe(
      "extrato-transportadora-transportadora-soares-2026-09-24.pdf",
    );
  });
});
