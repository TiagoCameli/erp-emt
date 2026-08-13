import { describe, expect, it } from "vitest";

import {
  dividirEmParcelas,
  montarPrevia,
  resumirParcelas,
} from "@/modules/rh/adiantamentos/parcelamento";

describe("dividirEmParcelas", () => {
  it("divide exato quando o valor fecha", () => {
    expect(dividirEmParcelas(1200, 3)).toEqual([400, 400, 400]);
  });

  it("joga a sobra de centavos na primeira parcela", () => {
    expect(dividirEmParcelas(1000, 3)).toEqual([333.34, 333.33, 333.33]);
  });

  it("mantém a soma exata mesmo com divisão feia", () => {
    const parcelas = dividirEmParcelas(100, 7);
    expect(parcelas).toEqual([14.32, 14.28, 14.28, 14.28, 14.28, 14.28, 14.28]);
    const soma = parcelas.reduce((a, b) => Math.round((a + b) * 100) / 100, 0);
    expect(soma).toBe(100);
  });

  it("funciona no limite de centavos", () => {
    expect(dividirEmParcelas(0.05, 3)).toEqual([0.03, 0.01, 0.01]);
  });

  it("uma parcela devolve o total", () => {
    expect(dividirEmParcelas(1234.56, 1)).toEqual([1234.56]);
  });

  it("nunca devolve parcela de zero", () => {
    // 3 centavos em 3 parcelas é o limite: 1 centavo cada.
    expect(dividirEmParcelas(0.03, 3)).toEqual([0.01, 0.01, 0.01]);
  });
});

describe("montarPrevia", () => {
  it("distribui as parcelas em meses consecutivos a partir da competência", () => {
    expect(montarPrevia(1200, 3, "2026-09")).toEqual([
      { competencia: "2026-09", valor: 400 },
      { competencia: "2026-10", valor: 400 },
      { competencia: "2026-11", valor: 400 },
    ]);
  });

  it("vira o ano", () => {
    expect(montarPrevia(600, 3, "2026-11")).toEqual([
      { competencia: "2026-11", valor: 200 },
      { competencia: "2026-12", valor: 200 },
      { competencia: "2027-01", valor: 200 },
    ]);
  });

  it("devolve lista vazia com entrada inválida, sem quebrar a tela", () => {
    expect(montarPrevia(0, 3, "2026-09")).toEqual([]);
    expect(montarPrevia(1200, 0, "2026-09")).toEqual([]);
  });

  it("uma parcela é o valor cheio numa linha só", () => {
    expect(montarPrevia(1234.56, 1, "2026-09")).toEqual([
      { competencia: "2026-09", valor: 1234.56 },
    ]);
  });

  it("quantidade não inteira devolve lista vazia", () => {
    expect(montarPrevia(1200, 2.5, "2026-09")).toEqual([]);
  });
});

describe("resumirParcelas", () => {
  it("saldo é o concedido menos o descontado, não o previsto menos o descontado", () => {
    // Adiantamento de 1.200,00 em 3x de 400,00. A 2a parcela só descontou a
    // metade (200,00): o previsto dela SEGUE em 400,00, e a diferença
    // (200,00) virou uma parcela nova (sobra) numa competência futura, aberta.
    const resumo = resumirParcelas(1200, [
      { valorPrevisto: 400, valorDescontado: 400, folhaId: "folha-1" },
      { valorPrevisto: 400, valorDescontado: 200, folhaId: "folha-2" },
      { valorPrevisto: 400, valorDescontado: 0, folhaId: null },
      { valorPrevisto: 200, valorDescontado: 0, folhaId: null }, // sobra da 2a
    ]);

    // A forma ERRADA (soma de todos os previstos - descontado) mediria
    // 1.400,00 - 600,00 = 800,00. A forma correta bate com o que falta pagar.
    expect(resumo.saldo).toBe(600);
    // sum(descontado) + sum(previsto das ABERTAS) = 600 + (400 + 200) = 1200,
    // igual ao concedido: é a invariante do plano em estado estável.
    expect(resumo.totalPlano).toBe(1200);
    expect(resumo.parcelasTotal).toBe(4);
    // Só as 2 primeiras foram processadas por uma folha (folhaId != null).
    expect(resumo.parcelasDescontadas).toBe(2);
  });

  it("parcela fechada com desconto zero conta como descontada (processada), não como aberta", () => {
    // Não coube nem 1 centavo naquele mês: fecha com valor_descontado = 0, e o
    // previsto inteiro (500,00) virou sobra aberta numa competência futura.
    const resumo = resumirParcelas(1000, [
      { valorPrevisto: 500, valorDescontado: 500, folhaId: "folha-1" },
      { valorPrevisto: 500, valorDescontado: 0, folhaId: "folha-2" },
      { valorPrevisto: 500, valorDescontado: 0, folhaId: null }, // sobra
    ]);

    expect(resumo.parcelasDescontadas).toBe(2);
    expect(resumo.saldo).toBe(500);
    expect(resumo.totalPlano).toBe(1000);
  });

  it("duas parcelas na mesma competência (plano + sobra empurrada) entram nas duas somas", () => {
    const resumo = resumirParcelas(900, [
      { valorPrevisto: 300, valorDescontado: 300, folhaId: "folha-1" },
      { valorPrevisto: 300, valorDescontado: 300, folhaId: "folha-1" },
      { valorPrevisto: 300, valorDescontado: 0, folhaId: null },
    ]);

    expect(resumo.parcelasTotal).toBe(3);
    expect(resumo.parcelasDescontadas).toBe(2);
    expect(resumo.saldo).toBe(300);
  });

  it("tudo em aberto: saldo é o concedido inteiro e nada foi processado", () => {
    const resumo = resumirParcelas(400, [
      { valorPrevisto: 400, valorDescontado: 0, folhaId: null },
    ]);

    expect(resumo.saldo).toBe(400);
    expect(resumo.parcelasDescontadas).toBe(0);
    expect(resumo.totalPlano).toBe(400);
  });

  it("tudo quitado: saldo zero e nenhuma parcela aberta", () => {
    const resumo = resumirParcelas(1200, [
      { valorPrevisto: 400, valorDescontado: 400, folhaId: "folha-1" },
      { valorPrevisto: 400, valorDescontado: 400, folhaId: "folha-2" },
      { valorPrevisto: 400, valorDescontado: 400, folhaId: "folha-3" },
    ]);

    expect(resumo.saldo).toBe(0);
    expect(resumo.totalPlano).toBe(1200);
    expect(resumo.parcelasDescontadas).toBe(3);
  });

  it("sem parcelas (adiantamento legado ou erro de leitura) não quebra: saldo é o concedido", () => {
    expect(resumirParcelas(1000, [])).toEqual({
      parcelasTotal: 0,
      parcelasDescontadas: 0,
      saldo: 1000,
      totalPlano: 0,
    });
  });
});
