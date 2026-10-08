import { describe, expect, it } from "vitest";

import {
  compor,
  ehResgateAutomatico,
  mesAMes,
  montarPainel,
  percentualDoConjunto,
  posicaoVelha,
  type AplicacaoCadastro,
  type LinhaAba,
  type MovimentoAplicacao,
} from "./calculo";

const CDB: AplicacaoCadastro = {
  id: "cdb",
  nome: "Caixa Econômica - CDB 95",
  contaNome: "CAIXA · INVESTIMENTOS",
  contaId: "sub",
  etapaId: "etapa-cdb",
  produto: "cdb",
  indexador: "cdi",
  taxaPercentual: 95,
  liquidez: "diaria",
  liquidezDias: null,
  carenciaAte: null,
  vencimento: null,
  tipoIr: "regressivo",
  ativa: true,
};
const FUNDO: AplicacaoCadastro = { ...CDB, id: "fundo", nome: "Caixa Econômica - Fundo", produto: "fundo", taxaPercentual: null, tipoIr: "come_cotas" };

function linha(parcial: Partial<LinhaAba> & Pick<LinhaAba, "aplicacaoId" | "mes">): LinhaAba {
  return {
    posicaoInicial: 0,
    aplicado: 0,
    resgatado: 0,
    rendimento: null,
    ajusteAbertura: null,
    posicaoFinal: 0,
    rendimentoPct: null,
    cdiPct: null,
    pctCdi: null,
    ultimaPosicao: null,
    saldoInicial: 0,
    ...parcial,
  };
}

// Os números reais de setembro/2026 depois da abertura (prova do banco).
const SETEMBRO: LinhaAba[] = [
  linha({ aplicacaoId: "cdb", mes: "2026-09-01", posicaoInicial: 3943139.39, aplicado: 2000000, resgatado: 1017000, ajusteAbertura: 90374.18, posicaoFinal: 5016513.57, ultimaPosicao: "2026-09-25" }),
  linha({ aplicacaoId: "fundo", mes: "2026-09-01", posicaoInicial: -12806.3, aplicado: 1000000, resgatado: 146.3, ajusteAbertura: 13923.78, posicaoFinal: 1000971.18, ultimaPosicao: "2026-09-25" }),
];

// O Rende Fácil da BB 102.124-9: o saldo inicial (178.326,66 em 31/08/2026) não
// tem transferência por trás, só o extrato. Números reais do banco em 07/10/2026.
const RENDE: AplicacaoCadastro = { ...CDB, id: "rende", nome: "Banco do Brasil - Rende Fácil", taxaPercentual: null };
const RENDE_FACIL: LinhaAba[] = [
  linha({ aplicacaoId: "rende", mes: "2026-08-01", saldoInicial: 178326.66, posicaoFinal: 178326.66 }),
  linha({ aplicacaoId: "rende", mes: "2026-09-01", posicaoInicial: 178326.66, aplicado: 790226.26, resgatado: 798329.46, posicaoFinal: 170223.46 }),
];

describe("saldo inicial por aplicação", () => {
  it("o principal conta o saldo inicial: sem ele o Rende Fácil sairia com −8.103,20", () => {
    const painel = montarPainel([RENDE], RENDE_FACIL, [], "2026-09-30");
    expect(painel.aplicacoes[0].principal).toBe(170223.46);
    expect(painel.aplicacoes[0].posicaoLiquida).toBe(170223.46);
  });

  it("o mês do corte mostra o saldo inicial, e só ele", () => {
    const meses = mesAMes(RENDE_FACIL);
    expect(meses.map((m) => m.saldoInicial)).toEqual([178326.66, 0]);
  });
});

describe("montarPainel", () => {
  it("a posição total fecha no centavo com a subconta depois da abertura", () => {
    const painel = montarPainel([CDB, FUNDO], SETEMBRO, [], "2026-09-25");
    expect(painel.cards.posicaoTotal).toBe(6017484.75);
    expect(painel.cards.disponivelHoje).toBe(6017484.75);
    expect(painel.cards.comCarencia).toBe(0);
  });

  it("a abertura não é rendimento: mês só com ajuste tem rendimento NULO, não zero", () => {
    const painel = montarPainel([CDB, FUNDO], SETEMBRO, [], "2026-09-25");
    expect(painel.cards.rendimentoMes).toBeNull();
    expect(painel.aplicacoes[0].rendimentoAcumulado).toBeNull();
    expect(painel.meses[0].ajusteAbertura).toBe(104297.96);
  });

  it("aplicação que a pessoa não vê (fora das linhas) some do total, em vez de somar zero", () => {
    const painel = montarPainel([CDB, FUNDO], SETEMBRO.slice(0, 1), [], "2026-09-25");
    expect(painel.aplicacoes.map((a) => a.aplicacao.id)).toEqual(["cdb"]);
    expect(painel.cards.posicaoTotal).toBe(5016513.57);
  });

  it("resgate automático do mês conta como alerta de caixa", () => {
    const movimentos: MovimentoAplicacao[] = [
      { chave: "t:1", id: "1", tipo: "resgate", data: "2026-09-01", aplicacaoId: "fundo", documento: "TRF-1", descricao: "RESGATE AUTOMATICO", valor: -146.3 },
      { chave: "t:2", id: "2", tipo: "resgate", data: "2026-09-04", aplicacaoId: "cdb", documento: "TRF-2", descricao: "RESG CDB 95", valor: -350000 },
      { chave: "t:3", id: "3", tipo: "resgate", data: "2026-08-27", aplicacaoId: "fundo", documento: "TRF-3", descricao: "RESGATE AUTOMATICO", valor: -279003.38 },
    ];
    const painel = montarPainel([CDB, FUNDO], SETEMBRO, movimentos, "2026-09-25");
    expect(painel.cards.resgatesAutomaticosMes).toEqual({ quantidade: 1, valor: 146.3 });
  });

  it("posição com mais de 35 dias acende o aviso", () => {
    expect(posicaoVelha("2026-08-20", "2026-09-25")).toBe(true);
    expect(posicaoVelha("2026-08-21", "2026-09-25")).toBe(false);
    expect(posicaoVelha(null, "2026-09-25")).toBe(true);
  });
});

describe("mesAMes", () => {
  it("fecha a identidade final = inicial + saldo inicial + aplicado − resgatado + rendimento + ajuste", () => {
    const linhas: LinhaAba[] = [
      ...SETEMBRO,
      ...RENDE_FACIL,
      linha({ aplicacaoId: "cdb", mes: "2026-10-01", posicaoInicial: 5016513.57, rendimento: 50000.11, posicaoFinal: 5066513.68, rendimentoPct: 0.9967, cdiPct: 1.05, pctCdi: 94.92 }),
      linha({ aplicacaoId: "fundo", mes: "2026-10-01", posicaoInicial: 1000971.18, resgatado: 500.5, rendimento: -120.01, posicaoFinal: 1000350.67, rendimentoPct: -0.012, cdiPct: 1.05, pctCdi: -1.14 }),
    ];
    for (const m of mesAMes(linhas)) {
      const conta = Math.round(m.posicaoInicial * 100) + Math.round(m.saldoInicial * 100) + Math.round(m.aplicado * 100) - Math.round(m.resgatado * 100)
        + Math.round((m.rendimento ?? 0) * 100) + Math.round((m.ajusteAbertura ?? 0) * 100);
      expect(Math.round(m.posicaoFinal * 100)).toBe(conta);
    }
    // Pelo mês, não pelo índice: o Rende Fácil abre a série em agosto (corte).
    const outubro = mesAMes(linhas).find((m) => m.mes === "2026-10-01");
    expect(outubro?.rendimento).toBe(49880.1);
  });
});

describe("percentualDoConjunto", () => {
  it("pondera pela base de cada aplicação, não faz média simples dos %", () => {
    // 1% sobre 1.000.000 e 2% sobre 100.000: o conjunto rendeu 12.000 sobre 1,1 mi.
    const r = percentualDoConjunto([
      { rendimento: 10000, rendimentoPct: 1, cdiPct: 1 },
      { rendimento: 2000, rendimentoPct: 2, cdiPct: 1 },
    ]);
    expect(r.pct).toBeCloseTo((12000 / 1100000) * 100, 10);
    expect(r.pct).not.toBeCloseTo(1.5, 3);
  });

  it("sem % em nenhuma, devolve nulo", () => {
    expect(percentualDoConjunto([{ rendimento: null, rendimentoPct: null, cdiPct: null }]).pct).toBeNull();
  });
});

describe("compor", () => {
  it("compõe mês a mês em vez de somar", () => {
    expect(compor([1, 1])).toBeCloseTo(2.01, 10);
    expect(compor([null])).toBeNull();
  });
});

describe("ehResgateAutomatico", () => {
  it("só resgate com a descrição do banco", () => {
    expect(ehResgateAutomatico({ tipo: "resgate", descricao: "RESGATE AUTOMATICO" })).toBe(true);
    expect(ehResgateAutomatico({ tipo: "resgate", descricao: "RESG CDB 95" })).toBe(false);
    expect(ehResgateAutomatico({ tipo: "aplicacao", descricao: "RESGATE AUTOMATICO" })).toBe(false);
  });
});
