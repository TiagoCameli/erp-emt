import { describe, expect, it } from "vitest";

import {
  lerPeriodoInvestimentos,
  montarInvestimentos,
  sentidoDaTransferencia,
  type MovimentoInvestimento,
  type SubcontaInvestimento,
} from "@/modules/financeiro/relatorios/investimentos";

const SUB = "sub-caixa";

function mov(parcial: Partial<MovimentoInvestimento>): MovimentoInvestimento {
  return {
    id: parcial.numero ?? "x",
    numero: "TRF-2026-0001",
    data: "2026-05-01",
    valor: 0,
    sentido: "aplicacao",
    aplicacaoId: "cdb",
    aplicacaoNome: "Caixa Econômica - CDB 95",
    subcontaId: SUB,
    descricao: null,
    ...parcial,
  };
}

const subcontas: SubcontaInvestimento[] = [
  {
    contaId: SUB,
    nome: "CAIXA ECONOMICA 578367973-5 · INVESTIMENTOS",
    contaPaiNome: "CAIXA ECONOMICA 578367973-5",
    saldoAtual: 5913186.79,
  },
];

describe("montarInvestimentos", () => {
  const movimentos = [
    mov({ numero: "TRF-1", data: "2026-04-29", valor: 500000, aplicacaoId: "cdb" }),
    mov({ numero: "TRF-2", data: "2026-05-20", valor: 1000000, aplicacaoId: "fundo", aplicacaoNome: "Caixa Econômica - Fundo" }),
    mov({ numero: "TRF-3", data: "2026-08-10", valor: 514309.72, sentido: "resgate", aplicacaoId: "cdb" }),
    mov({ numero: "TRF-4", data: "2026-08-11", valor: 0.1, sentido: "resgate", aplicacaoId: "fundo", aplicacaoNome: "Caixa Econômica - Fundo" }),
    mov({ numero: "TRF-5", data: "2026-09-21", valor: 2000000, aplicacaoId: "cdb" }),
  ];

  it("a posição de cada aplicação é tudo o que foi aplicado menos o resgatado (a regra do Tiago)", () => {
    const r = montarInvestimentos(movimentos, subcontas, { de: "", ate: "" });
    const cdb = r.aplicacoes.find((a) => a.aplicacaoId === "cdb")!;
    const fundo = r.aplicacoes.find((a) => a.aplicacaoId === "fundo")!;
    expect(cdb.aplicado).toBe(2500000);
    expect(cdb.resgatado).toBe(514309.72);
    expect(cdb.posicao).toBe(1985690.28);
    // Centavos exatos: 1.000.000,00 - 0,10 não pode virar 999999.8999.
    expect(fundo.posicao).toBe(999999.9);
    expect(cdb.conta).toBe("CAIXA ECONOMICA 578367973-5");
  });

  it("o período recorta o MOVIMENTO, nunca a posição", () => {
    const r = montarInvestimentos(movimentos, subcontas, { de: "2026-08-01", ate: "2026-08-31" });
    expect(r.aplicadoPeriodo).toBe(0);
    expect(r.resgatadoPeriodo).toBe(514309.82);
    const cdb = r.aplicacoes.find((a) => a.aplicacaoId === "cdb")!;
    expect(cdb.resgatadoPeriodo).toBe(514309.72);
    expect(cdb.posicao).toBe(1985690.28);
    expect(r.movimentos.map((m) => m.numero)).toEqual(["TRF-4", "TRF-3"]);
  });

  it("a série mensal acumula desde o primeiro movimento e preenche mês sem movimento", () => {
    const r = montarInvestimentos(movimentos, subcontas, { de: "", ate: "" });
    expect(r.meses.map((m) => m.mes)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(r.meses.find((m) => m.mes === "2026-06")!.posicaoFinal).toBe(1500000);
    expect(r.meses.at(-1)!.posicaoFinal).toBe(2985690.18);
  });

  it("filtrar agosto mostra só agosto, com a posição acumulada até lá", () => {
    const r = montarInvestimentos(movimentos, subcontas, { de: "2026-08-01", ate: "2026-08-31" });
    expect(r.meses).toEqual([
      { mes: "2026-08", aplicado: 0, resgatado: 514309.82, posicaoFinal: 985690.18 },
    ]);
  });

  it("subconta sem permissão de saldo fica fora do total e é contada", () => {
    const r = montarInvestimentos([], [...subcontas, { contaId: "sub-bb", nome: "BB · INVESTIMENTOS", contaPaiNome: "BB", saldoAtual: null }], { de: "", ate: "" });
    expect(r.saldoAplicado).toBe(5913186.79);
    expect(r.subcontasOcultas).toBe(1);
    expect(r.meses).toEqual([]);
  });

  it("dinheiro que ENTRA na subconta é aplicação; o que sai é resgate", () => {
    expect(sentidoDaTransferencia(true)).toBe("aplicacao");
    expect(sentidoDaTransferencia(false)).toBe("resgate");
  });
});

describe("lerPeriodoInvestimentos", () => {
  it("sem nada na URL é o histórico inteiro", () => {
    expect(lerPeriodoInvestimentos({})).toEqual({ de: "", ate: "" });
  });
  it("lê as chaves com prefixo, ignora lixo e desinverte", () => {
    expect(lerPeriodoInvestimentos({ inv_de: "2026-09-30", inv_ate: "2026-08-01" })).toEqual({ de: "2026-08-01", ate: "2026-09-30" });
    expect(lerPeriodoInvestimentos({ inv_de: "ontem", de: "2026-01-01" })).toEqual({ de: "", ate: "" });
  });
});
