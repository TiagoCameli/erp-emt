import { describe, expect, it } from "vitest";

import {
  calcularCet,
  centrosImobilizado,
  etapasDeDivida,
  lerCronogramaColado,
  lerDataBr,
  lerFluxo,
  lerValorBr,
  mesesEntre,
  saldoNaData,
  somarCentavos,
  valorQuitacaoHoje,
  type PontoFluxo,
} from "@/modules/financeiro/dividas/calculo";

/** Data ISO `n` meses depois de 2026-01-15, mesmo dia do mês. */
function mes(n: number): string {
  const d = new Date(Date.UTC(2026, n, 15));
  return d.toISOString().slice(0, 10);
}

/**
 * O fluxo de um Price como o banco gera (`fn_calcular_cronograma`): PMT ao
 * centavo, juros ao centavo sobre o saldo, a última parcela fecha o saldo.
 */
function fluxoPrice(valor: number, taxa: number, n: number): PontoFluxo[] {
  const i = taxa / 100;
  const pmt = Math.round(((valor * i) / (1 - Math.pow(1 + i, -n))) * 100) / 100;
  let saldo = valor;
  const fluxo: PontoFluxo[] = [{ data: mes(0), valor }];
  for (let k = 1; k <= n; k++) {
    const juros = Math.round(saldo * i * 100) / 100;
    const principal = k === n ? saldo : pmt - juros;
    saldo = Math.round((saldo - principal) * 100) / 100;
    fluxo.push({ data: mes(k), valor: -Math.round((principal + juros) * 100) / 100 });
  }
  return fluxo;
}

describe("mesesEntre", () => {
  it("conta o calendário: do dia 15 ao 15 do mês seguinte é 1, inclusive em fevereiro", () => {
    expect(mesesEntre("2026-01-15", "2026-02-15")).toBe(1);
    expect(mesesEntre("2026-02-15", "2026-03-15")).toBe(1);
    expect(mesesEntre("2026-01-15", "2027-01-15")).toBe(12);
  });
  it("os dias que sobram valem 1/30", () => {
    expect(mesesEntre("2026-01-15", "2026-02-14")).toBeCloseTo(1 - 1 / 30, 10);
    expect(mesesEntre("2026-01-01", "2026-01-16")).toBeCloseTo(0.5, 10);
  });
});

describe("calcularCet", () => {
  it("Price 100.000 a 2% a.m. em 12x: CET 2% a.m., 26,82% a.a.", () => {
    const fluxo = fluxoPrice(100000, 2, 12);
    expect(fluxo[1].valor).toBe(-9455.96);
    const cet = calcularCet(fluxo)!;
    expect(cet.mensal * 100).toBeCloseTo(2, 3);
    expect(cet.anual * 100).toBeCloseTo(26.82, 1);
  });

  it("tarifa descontada na liberação sobe o CET acima da taxa", () => {
    const fluxo = fluxoPrice(100000, 2, 12);
    fluxo[0] = { ...fluxo[0], valor: 98000 };
    expect(calcularCet(fluxo)!.mensal).toBeGreaterThan(0.02);
  });

  it("taxa zero dá CET zero", () => {
    const fluxo: PontoFluxo[] = [{ data: mes(0), valor: 1200 }];
    for (let k = 1; k <= 12; k++) fluxo.push({ data: mes(k), valor: -100 });
    expect(calcularCet(fluxo)!.mensal).toBeCloseTo(0, 8);
  });

  it("sem saída (contrato sem cronograma) não inventa CET", () => {
    expect(calcularCet([{ data: "2026-01-15", valor: 100000 }])).toBeNull();
    expect(calcularCet([])).toBeNull();
  });

  it("ignora data inválida e valor zero", () => {
    const fluxo = [...fluxoPrice(10000, 1, 6), { data: "lixo", valor: -999 }, { data: mes(3), valor: 0 }];
    expect(calcularCet(fluxo)!.mensal * 100).toBeCloseTo(1, 3);
  });
});

describe("valorQuitacaoHoje", () => {
  const parcelas = () => fluxoPrice(100000, 2, 12).filter((p) => p.valor < 0).map((p) => ({ ...p, valor: -p.valor }));

  it("na data da liberação, as 12 parcelas do Price a valor presente voltam ao valor liberado", () => {
    expect(valorQuitacaoHoje(parcelas(), 2, mes(0))).toBeCloseTo(100000, 0);
  });

  it("logo depois de pagar a 3ª, é o saldo do Price; meio mês depois, o saldo com meio mês de juros", () => {
    const resto = parcelas().slice(3);
    const saldo = valorQuitacaoHoje(resto, 2, mes(3));
    expect(valorQuitacaoHoje(resto, 2, "2026-04-30")).toBeCloseTo(saldo * Math.pow(1.02, 0.5), 0);
    expect(saldo).toBeLessThan(resto.reduce((s, p) => s + p.valor, 0));
  });

  it("parcela vencida entra cheia; sem taxa é a soma; sem parcela é zero", () => {
    const vencida = [{ data: "2026-01-15", valor: 1000 }];
    expect(valorQuitacaoHoje(vencida, 2, "2026-03-01")).toBe(1000);
    expect(valorQuitacaoHoje([{ data: "2027-01-15", valor: 1000 }, ...vencida], 0, "2026-03-01")).toBe(2000);
    expect(valorQuitacaoHoje([], 2, "2026-03-01")).toBe(0);
  });
});

describe("lerFluxo", () => {
  it("aceita número em string (numeric do PostgREST) e descarta o que não é ponto", () => {
    expect(lerFluxo([{ data: "2026-01-15", valor: "100.5" }, { data: 3 }, null, "x"])).toEqual([
      { data: "2026-01-15", valor: 100.5 },
    ]);
    expect(lerFluxo(null)).toEqual([]);
  });
});

describe("leitura do cronograma colado", () => {
  it("data em pt-BR e ISO; data impossível é null", () => {
    expect(lerDataBr("5/2/2027")).toBe("2027-02-05");
    expect(lerDataBr("2027-02-05")).toBe("2027-02-05");
    expect(lerDataBr("31/02/2027")).toBeNull();
    expect(lerDataBr("Vencimento")).toBeNull();
  });

  it("valor em pt-BR, em inglês e com R$; vazio é zero", () => {
    expect(lerValorBr("1.234,56")).toBe(1234.56);
    expect(lerValorBr("R$ 1.234,56")).toBe(1234.56);
    expect(lerValorBr("1234.56")).toBe(1234.56);
    expect(lerValorBr("1.234")).toBe(1234);
    expect(lerValorBr("")).toBe(0);
    expect(lerValorBr("abc")).toBeNull();
  });

  it("lê tab e ponto e vírgula, pula cabeçalho e total, ignora o número da parcela", () => {
    const texto = [
      "Parcela\tVencimento\tAmortização\tJuros\tEncargos",
      "1\t15/02/2026\t7.455,96\t2.000,00\t12,50",
      "15/03/2026;7.605,08;1.850,88;",
      "Total\t\t15.061,04",
    ].join("\n");
    const { linhas, erros } = lerCronogramaColado(texto);
    expect(erros).toEqual([]);
    expect(linhas).toEqual([
      { vencimento: "2026-02-15", principal: 7455.96, juros: 2000, encargos: 12.5 },
      { vencimento: "2026-03-15", principal: 7605.08, juros: 1850.88, encargos: 0 },
    ]);
  });

  it("linha com valor que não é número vira erro, com o número da linha", () => {
    const { linhas, erros } = lerCronogramaColado("15/02/2026\tdez mil\n15/03/2026\t-5");
    expect(linhas).toEqual([]);
    expect(erros).toEqual(["Linha 1: valor que não é número", "Linha 2: valor negativo"]);
  });

  it("somarCentavos não acumula resto de ponto flutuante", () => {
    expect(somarCentavos([0.1, 0.2])).toBe(0.3);
  });
});

describe("opções de centro", () => {
  const centros = [
    { id: "f", nome: "Empréstimos", codigo: null, paiId: null, tipo: "financeiro" },
    { id: "i", nome: "Imobilizado", codigo: null, paiId: null, tipo: "imobilizado" },
    { id: "o", nome: "Obra BR-364", codigo: null, paiId: null, tipo: "obra" },
    { id: "f1", nome: "BB 123", codigo: null, paiId: "f", tipo: null },
    { id: "i1", nome: "Escavadeira", codigo: null, paiId: "i", tipo: null },
    { id: "o1", nome: "Etapa 1", codigo: null, paiId: "o", tipo: null },
    { id: "f1a", nome: "Neto", codigo: null, paiId: "f1", tipo: null },
  ];

  it("etapa do contrato: nível 2 de financeiro ou imobilizado, com a raiz no rótulo", () => {
    expect(etapasDeDivida(centros)).toEqual([
      { id: "f1", rotulo: "Empréstimos › BB 123" },
      { id: "i1", rotulo: "Imobilizado › Escavadeira" },
    ]);
  });

  it("bem da carta: a raiz de imobilizado e as etapas dela", () => {
    expect(centrosImobilizado(centros)).toEqual([
      { id: "i", rotulo: "Imobilizado" },
      { id: "i1", rotulo: "Imobilizado › Escavadeira" },
    ]);
  });
});

describe("saldoNaData", () => {
  const linhas = [
    { vencimento: "2026-02-15", numero: 1, saldoApos: 90000 },
    { vencimento: "2026-03-10", numero: null, saldoApos: 80000 },
    { vencimento: "2026-03-15", numero: 2, saldoApos: 70000 },
  ];
  it("pega o saldo da última linha vencida até a data", () => {
    expect(saldoNaData(linhas, "2026-03-12", 100000)).toBe(80000);
    expect(saldoNaData(linhas, "2026-03-15", 100000)).toBe(70000);
  });
  it("no mesmo dia vale a última linha na ordem do cronograma", () => {
    const mesmoDia = [...linhas, { vencimento: "2026-03-15", numero: null, saldoApos: 60000 }];
    expect(saldoNaData(mesmoDia, "2026-03-15", 100000)).toBe(60000);
  });
  it("dois eventos no mesmo dia: o segundo vale", () => {
    const doisEventos = [
      { vencimento: "2026-06-10", numero: null, saldoApos: 90000 },
      { vencimento: "2026-06-10", numero: null, saldoApos: 80000 },
    ];
    expect(saldoNaData(doisEventos, "2026-06-10", 100000)).toBe(80000);
  });
  it("antes da primeira parcela, o liberado", () => {
    expect(saldoNaData(linhas, "2026-01-30", 100000)).toBe(100000);
  });
});
