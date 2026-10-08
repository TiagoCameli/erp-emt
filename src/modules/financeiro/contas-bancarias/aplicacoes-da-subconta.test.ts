import { describe, expect, it } from "vitest";

import {
  resumoDaSubconta,
  type SaldoDaAplicacao,
} from "@/modules/financeiro/contas-bancarias/aplicacoes-da-subconta";

function aplicacao(parcial: Partial<SaldoDaAplicacao>): SaldoDaAplicacao {
  return {
    aplicacaoId: "a",
    subcontaId: "caixa",
    nome: "Aplicação",
    produto: "cdb",
    ativa: true,
    saldo: 0,
    ultimaPosicao: null,
    ...parcial,
  };
}

// Números reais da Caixa 578367973-5 em 08/10/2026.
const TODAS: SaldoDaAplicacao[] = [
  aplicacao({ aplicacaoId: "cdb", nome: "Caixa Econômica - CDB 95", saldo: 5030408.62 }),
  aplicacao({ aplicacaoId: "fundo", nome: "Caixa Econômica - Fundo", produto: "fundo", saldo: 1012470.45 }),
  aplicacao({ aplicacaoId: "rende", subcontaId: "bb", nome: "Banco do Brasil - Rende Fácil", saldo: 153615.4 }),
];

describe("resumoDaSubconta", () => {
  it("lista só as aplicações da subconta e soma em centavos", () => {
    const r = resumoDaSubconta("caixa", 6042879.07, TODAS);
    expect(r.aplicacoes.map((a) => a.aplicacaoId)).toEqual(["cdb", "fundo"]);
    expect(r.total).toBe(6042879.07);
    expect(r.foraDasAplicacoes).toBeNull();
  });

  it("mostra o que a subconta tem fora das aplicações, com sinal", () => {
    expect(resumoDaSubconta("caixa", 6043000, TODAS).foraDasAplicacoes).toBe(120.93);
    expect(resumoDaSubconta("caixa", 6042000, TODAS).foraDasAplicacoes).toBe(-879.07);
  });

  it("não acusa diferença de ponto flutuante", () => {
    const r = resumoDaSubconta("x", 0.3, [
      aplicacao({ subcontaId: "x", saldo: 0.1 }),
      aplicacao({ subcontaId: "x", saldo: 0.2 }),
    ]);
    expect(r.total).toBe(0.3);
    expect(r.foraDasAplicacoes).toBeNull();
  });

  it("sem saldo visível da subconta, não compara", () => {
    expect(resumoDaSubconta("caixa", null, TODAS).foraDasAplicacoes).toBeNull();
  });

  it("subconta sem aplicação: lista vazia e o saldo inteiro fica de fora", () => {
    const r = resumoDaSubconta("nova", 50, TODAS);
    expect(r.aplicacoes).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.foraDasAplicacoes).toBe(50);
  });
});
