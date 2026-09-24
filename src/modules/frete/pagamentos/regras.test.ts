// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  filtrarPagamentos,
  FILTROS_PAGAMENTOS_VAZIOS,
  gerarMeses,
  mesesDosPagamentos,
  mesParaData,
  pagamentosDasParcelas,
  pagoPorDosPagamentos,
  parcelasIniciais,
  parcelasValidas,
  pDadosDoPagamento,
  podeRemoverParcela,
  rotuloMesCurto,
  rotuloMesLongo,
  rotuloMetodo,
  rotuloTotal,
  totalDasParcelas,
  totalDosPagamentos,
  type DadosPagamento,
} from "@/modules/frete/pagamentos/regras";

const BASE: DadosPagamento = {
  data: "2026-09-10",
  transportadoraId: "11111111-1111-4111-8111-111111111111",
  mesReferencia: "2026-08",
  valor: 1234.5678,
  metodo: "pix",
  quantidadeCombustivel: 0,
  responsavel: "Tiago",
  notaFiscal: "NF 1",
  pagoPor: "EMT Construtora",
  observacoes: null,
};

describe("meses do pagamento (gerarMeses da origem)", () => {
  it("vai de 24 meses atrás a 6 à frente, 31 opções, rótulo 'Março 2026'", () => {
    const meses = gerarMeses("2026-09");
    expect(meses).toHaveLength(31);
    expect(meses[0]).toEqual({ valor: "2024-09", rotulo: "Setembro 2024" });
    expect(meses[24]).toEqual({ valor: "2026-09", rotulo: "Setembro 2026" });
    expect(meses[30]).toEqual({ valor: "2027-03", rotulo: "Março 2027" });
  });

  it("vira o ano em janeiro", () => {
    const meses = gerarMeses("2026-01");
    expect(meses[23]).toEqual({ valor: "2025-12", rotulo: "Dezembro 2025" });
    expect(meses[25]).toEqual({ valor: "2026-02", rotulo: "Fevereiro 2026" });
  });

  it("rótulos da lista (Jan/2026) e do detalhe (Janeiro 2026)", () => {
    expect(rotuloMesCurto("2026-01-01")).toBe("Jan/2026");
    expect(rotuloMesCurto("2026-12")).toBe("Dez/2026");
    expect(rotuloMesLongo("2026-03-01")).toBe("Março 2026");
  });

  it("mês vira o dia 1 do banco; vazio fica vazio", () => {
    expect(mesParaData("2026-03")).toBe("2026-03-01");
    expect(mesParaData("")).toBe("");
    expect(mesParaData("março")).toBe("");
  });

  it("rótulos dos métodos da origem", () => {
    expect(rotuloMetodo("transferencia")).toBe("Transferência");
    expect(rotuloMetodo("combustivel")).toBe("Combustível");
    expect(rotuloMetodo("outro")).toBe("outro");
  });
});

describe("dividir entre meses", () => {
  it("começa com duas parcelas vazias, inválidas, e não deixa remover abaixo de duas", () => {
    const parcelas = parcelasIniciais();
    expect(parcelas).toHaveLength(2);
    expect(parcelasValidas(parcelas)).toBe(false);
    expect(podeRemoverParcela(parcelas)).toBe(false);
    expect(podeRemoverParcela([...parcelas, { mesReferencia: "", valor: "" }])).toBe(true);
  });

  it("válido só com 2 ou mais, todas com mês e valor maior que zero", () => {
    expect(parcelasValidas([{ mesReferencia: "2026-08", valor: "100" }])).toBe(false);
    expect(
      parcelasValidas([
        { mesReferencia: "2026-08", valor: "100" },
        { mesReferencia: "2026-09", valor: "50,5" },
      ]),
    ).toBe(true);
    expect(
      parcelasValidas([
        { mesReferencia: "2026-08", valor: "100" },
        { mesReferencia: "", valor: "50" },
      ]),
    ).toBe(false);
    expect(
      parcelasValidas([
        { mesReferencia: "2026-08", valor: "100" },
        { mesReferencia: "2026-09", valor: "0" },
      ]),
    ).toBe(false);
    // Mais de 4 casas não é valor aceito.
    expect(
      parcelasValidas([
        { mesReferencia: "2026-08", valor: "100" },
        { mesReferencia: "2026-09", valor: "1,23456" },
      ]),
    ).toBe(false);
  });

  it("o total soma o que é número, sem erro de ponto flutuante", () => {
    expect(
      totalDasParcelas([
        { mesReferencia: "2026-08", valor: "0,1" },
        { mesReferencia: "2026-09", valor: "0,2" },
        { mesReferencia: "", valor: "abc" },
      ]),
    ).toBe(0.3);
    expect(
      totalDasParcelas([
        { mesReferencia: "2026-08", valor: "1.234,5678" },
        { mesReferencia: "2026-09", valor: "765,4322" },
      ]),
    ).toBe(2000);
  });

  it("gera um pagamento por parcela com os mesmos campos e o mês e o valor de cada uma", () => {
    const lista = pagamentosDasParcelas(BASE, [
      { mesReferencia: "2026-07", valor: "600" },
      { mesReferencia: "2026-08", valor: "634,5678" },
    ]);
    expect(lista).toEqual([
      { ...BASE, mesReferencia: "2026-07", valor: 600 },
      { ...BASE, mesReferencia: "2026-08", valor: 634.5678 },
    ]);
  });
});

describe("payload da fn_frete_pagamento_salvar", () => {
  it("manda as chaves que a RPC lê, com o mês no dia 1", () => {
    expect(pDadosDoPagamento(BASE)).toEqual({
      data: "2026-09-10",
      transportadora_id: BASE.transportadoraId,
      mes_referencia: "2026-08-01",
      valor: 1234.5678,
      metodo: "pix",
      quantidade_combustivel: 0,
      responsavel: "Tiago",
      nota_fiscal: "NF 1",
      pago_por: "EMT Construtora",
      observacoes: null,
    });
  });

  it("sem mês manda nulo (o banco usa o mês da data)", () => {
    expect(pDadosDoPagamento({ ...BASE, mesReferencia: "" }).mes_referencia).toBeNull();
  });

  it("litros só no combustível; fora dele grava 0, como a origem", () => {
    expect(pDadosDoPagamento({ ...BASE, quantidadeCombustivel: 50 }).quantidade_combustivel).toBe(0);
    expect(
      pDadosDoPagamento({ ...BASE, metodo: "combustivel", quantidadeCombustivel: 50.25 }).quantidade_combustivel,
    ).toBe(50.25);
  });
});

describe("filtro da lista", () => {
  const T1 = "t1";
  const T2 = "t2";
  const linhas = [
    { id: "a", data: "2026-08-05", transportadoraId: T1, mesReferencia: "2026-07-01", metodo: "pix", pagoPor: "EMT Construtora", valor: 100 },
    { id: "b", data: "2026-09-01", transportadoraId: T2, mesReferencia: "2026-08-01", metodo: "combustivel", pagoPor: "Fulano", valor: 50.1234 },
    { id: "c", data: "2026-08-20", transportadoraId: T1, mesReferencia: "2026-08-01", metodo: "boleto", pagoPor: "EMT Construtora", valor: 0.0001 },
  ];

  it("sem filtro: todos, em ordem data desc", () => {
    expect(filtrarPagamentos(linhas, FILTROS_PAGAMENTOS_VAZIOS).map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("transportadora, mês, método e pago por por igualdade; período inclusivo sobre a data", () => {
    const f = FILTROS_PAGAMENTOS_VAZIOS;
    expect(filtrarPagamentos(linhas, { ...f, transportadoraId: T1 }).map((l) => l.id)).toEqual(["c", "a"]);
    expect(filtrarPagamentos(linhas, { ...f, mes: "2026-08" }).map((l) => l.id)).toEqual(["b", "c"]);
    expect(filtrarPagamentos(linhas, { ...f, metodo: "pix" }).map((l) => l.id)).toEqual(["a"]);
    expect(filtrarPagamentos(linhas, { ...f, pagoPor: "Fulano" }).map((l) => l.id)).toEqual(["b"]);
    expect(filtrarPagamentos(linhas, { ...f, de: "2026-08-05", ate: "2026-08-20" }).map((l) => l.id)).toEqual(["c", "a"]);
  });

  it("opções de mês e pago por saem dos pagamentos; total e rótulo do rodapé", () => {
    expect(mesesDosPagamentos(linhas)).toEqual(["2026-08", "2026-07"]);
    expect(pagoPorDosPagamentos(linhas)).toEqual(["EMT Construtora", "Fulano"]);
    expect(totalDosPagamentos(linhas)).toBe(150.1235);
    expect(rotuloTotal(1)).toBe("Total (1 registro)");
    expect(rotuloTotal(3)).toBe("Total (3 registros)");
  });
});
