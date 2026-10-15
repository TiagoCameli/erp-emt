import { describe, expect, it } from "vitest";

import type { LinhaCustoReceita } from "@/modules/financeiro/relatorios/custo-receita";
import {
  conferencia,
  lucroEPrejuizo,
  mesesDoAnoAte,
  nomeCurto,
  resultadoPorObra,
  type LinhaRateioMes,
  type PapelRateio,
} from "@/modules/financeiro/relatorios/resultado-por-obra";
import { indiretoPorMes, totalDoAno } from "@/modules/financeiro/relatorios/indireto-por-mes";
import { ponteObrasDre } from "@/modules/financeiro/relatorios/ponte-obras-dre";

const OBRA_A = "a";
const OBRA_B = "b";
const ESCRITORIO = "esc";
const CARRETAS = "car";

const papeis = new Map<string, PapelRateio>([
  [ESCRITORIO, "indireto"],
  [CARRETAS, "fora"],
]);

function cr(mes: string, tipo: "a_pagar" | "a_receber", centro: string, total: number): LinhaCustoReceita {
  return { mes, tipo, centroCustoId: centro, nome: `Centro ${centro}`, codigo: null, total, retencao: 0 };
}

function rt(mes: string, centro: string | null, indireto: number, naoRateado = 0, total = 0): LinhaRateioMes {
  return {
    mes,
    centroId: centro,
    centro: centro ? `Centro ${centro}` : null,
    custoDireto: 0,
    indireto,
    status: "automatico",
    naoRateado,
    custoIndiretoMes: total,
  };
}

// Dois anos, três meses, um mês futuro (previsto) que não pode entrar.
const linhas: LinhaCustoReceita[] = [
  cr("2025-12", "a_receber", OBRA_A, 1000),
  cr("2025-12", "a_pagar", OBRA_A, 400),
  cr("2025-12", "a_pagar", ESCRITORIO, 100),
  cr("2026-01", "a_pagar", OBRA_A, 300.1),
  cr("2026-01", "a_pagar", OBRA_B, 100.2),
  cr("2026-01", "a_pagar", ESCRITORIO, 80.03),
  cr("2026-01", "a_pagar", CARRETAS, 50),
  cr("2026-02", "a_receber", OBRA_B, 900),
  cr("2026-02", "a_receber", ESCRITORIO, 5),
  cr("2026-02", "a_pagar", OBRA_B, 200),
  cr("2026-02", "a_pagar", ESCRITORIO, 60),
  cr("2026-03", "a_pagar", OBRA_A, 999),
  cr("2026-03", "a_receber", OBRA_A, 5000),
];

const rateio: LinhaRateioMes[] = [
  rt("2025-12", OBRA_A, 100, 0, 100),
  rt("2026-01", OBRA_A, 60.02, 0, 80.03),
  rt("2026-01", OBRA_B, 20.01, 0, 80.03),
  // Fevereiro: só a obra B tem custo; 10 ficaram sem obra (ajuste manual).
  rt("2026-02", OBRA_B, 50, 10, 60),
  rt("2026-03", OBRA_A, 77, 0, 77),
];

describe("resultado por obra", () => {
  const r = resultadoPorObra({ mes: "2026-02", linhas, rateio, papeis });
  const a = r.obras.find((o) => o.centroId === OBRA_A)!;
  const b = r.obras.find((o) => o.centroId === OBRA_B)!;

  it("o mês escolhido corta: o previsto de março não entra em janela nenhuma", () => {
    expect(a.inicio.receita).toBe(1000);
    expect(a.inicio.direto).toBe(700.1);
    expect(r.mesesDoAno).toEqual(["2026-01", "2026-02"]);
  });

  it("três janelas: mês, ano até o mês e desde o início", () => {
    expect(b.mes).toEqual({ receita: 900, direto: 200, indireto: 50, resultado: 650, margem: (650 / 900) * 100 });
    expect(b.ano.resultado).toBe(529.79);
    expect(a.ano.resultado).toBe(-360.12);
    expect(a.inicio.resultado).toBe(139.88);
    // Sem receita não há margem: nulo, não zero.
    expect(a.ano.margem).toBeNull();
  });

  it("o indireto sai da linha do escritório e entra nas obras; carretas ficam à parte", () => {
    expect(r.obras.map((o) => o.centroId).sort()).toEqual([OBRA_A, OBRA_B]);
    expect(r.foraDoRateio.map((o) => o.centroId)).toEqual([CARRETAS]);
    expect(r.foraDoRateio[0].ano).toMatchObject({ direto: 50, indireto: 0, resultado: -50 });
    expect(r.naoRateado).toEqual({ mes: 10, ano: 10, inicio: 10 });
    expect(r.receitaNosIndiretos).toEqual({ mes: 5, ano: 5, inicio: 5 });
  });

  it("a soma da tela fecha com o custo x receita ao centavo, nas três janelas", () => {
    expect(conferencia(r, "mes")).toBe(0);
    expect(conferencia(r, "ano")).toBe(0);
    expect(conferencia(r, "inicio")).toBe(0);
    expect(r.totalGeral.inicio.resultado).toBe(614.67);
  });

  it("a conferência acusa rateio que não distribuiu o custo do indireto", () => {
    const furado = resultadoPorObra({ mes: "2026-02", linhas, rateio: rateio.slice(1), papeis });
    expect(conferencia(furado, "inicio")).toBe(-100);
    expect(conferencia(furado, "ano")).toBe(0);
  });

  it("a matriz mês x obra soma o resultado do ano da obra", () => {
    expect(b.porMesDoAno).toEqual([-120.21, 650]);
    expect(b.porMesDoAno.reduce((s, v) => s + Math.round(v * 100), 0) / 100).toBe(b.ano.resultado);
    expect(r.totalObrasPorMes).toEqual([-480.33, 650]);
    expect(r.totalObras.ano.resultado).toBe(169.67);
  });

  it("ordena pelo resultado desde o início", () => {
    expect(r.obras.map((o) => o.centroId)).toEqual([OBRA_B, OBRA_A]);
  });

  it("lucro e prejuízo, do maior para o menor em cada lado", () => {
    const { lucro, prejuizo } = lucroEPrejuizo(r.obras, "ano");
    expect(lucro.map((o) => o.centroId)).toEqual([OBRA_B]);
    expect(prejuizo.map((o) => o.centroId)).toEqual([OBRA_A]);
  });
});

describe("apoio", () => {
  it("meses do ano até o mês", () => {
    expect(mesesDoAnoAte("2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("nome curto pelo código da obra", () => {
    expect(nomeCurto("009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10")).toBe("009");
    expect(nomeCurto("007.1 AC405 - Lote 2 Trecho depois da Ponte do Moa")).toBe("007.1");
    expect(nomeCurto("Acesso ao Polo Naval")).toBe("Acesso ao Polo Naval");
  });
});

describe("indireto por mês", () => {
  // Outubro/2026 em miniatura: Impostos (parcelamentos) puxando o mês.
  const rateioOut: LinhaRateioMes[] = [
    { ...rt("2026-10", "polo", 192, 0, 740), custoDireto: 146 },
    { ...rt("2026-10", "009", 548, 0, 740), custoDireto: 900 },
    { ...rt("2026-09", "009", 90, 0, 90), custoDireto: 1000 },
  ];
  const categorias = [
    { mes: "2026-10-01", raizId: "esc", raiz: "Escritório", centroId: "esc", centro: "Escritório", categoriaId: "imp", categoria: "Impostos", total: 653.92 },
    { mes: "2026-10-01", raizId: "esc", raiz: "Escritório", centroId: "esc", centro: "Escritório", categoriaId: "sal", categoria: "Salários", total: 50.08 },
    { mes: "2026-10-01", raizId: "man", raiz: "Manutenção", centroId: "m1", centro: "Máquina 1", categoriaId: "sal", categoria: "Salários", total: 36 },
    { mes: "2026-09-01", raizId: "esc", raiz: "Escritório", centroId: "esc", centro: "Escritório", categoriaId: "sal", categoria: "Salários", total: 90 },
  ];
  const meses = indiretoPorMes(rateioOut, categorias);
  const out = meses.find((m) => m.mes === "2026-10")!;

  it("uma linha por mês, em ordem, com o total do rateio", () => {
    expect(meses.map((m) => m.mes)).toEqual(["2026-09", "2026-10"]);
    expect(out.total).toBe(740);
    expect(totalDoAno(meses)).toBe(830);
  });

  it("a categoria que mais pesou abre a lista, somando etapas diferentes", () => {
    expect(out.categorias[0]).toMatchObject({ categoria: "Impostos", total: 653.92 });
    expect(out.categorias[1]).toMatchObject({ categoria: "Salários", total: 86.08 });
    expect(out.categorias[0].pct).toBeCloseTo(88.37, 2);
    expect(out.diferencaCategorias).toBe(0);
  });

  it("aponta obra que recebe mais indireto que o próprio custo direto", () => {
    expect(out.obras.map((o) => o.centroId)).toEqual(["009", "polo"]);
    expect(out.indiretoAcimaDoDireto.map((o) => o.centroId)).toEqual(["polo"]);
  });

  it("acusa categoria que não fecha com o rateio", () => {
    const furado = indiretoPorMes(rateioOut, categorias.slice(1));
    expect(furado.find((m) => m.mes === "2026-10")!.diferencaCategorias).toBe(653.92);
  });
});

describe("ponte das obras com o DRE", () => {
  // Jan-set/2026, medido no banco em 15/10/2026.
  const ponte = ponteObrasDre({
    dre: { receita: 44190967.6, custo: 30177437.5 },
    obras: { receita: 44190967.6, custo: 30086303.48 },
    termos: {
      custoForaDasObras: 77130.08,
      receitaForaDasObras: 0,
      financeiraNasObras: 14717.34,
      cronogramaOperacional: 28721.28,
    },
  });

  it("fecha o custo ao centavo com os três termos", () => {
    expect(ponte.custo.naoExplicado).toBe(0);
    expect(ponte.custo.passos.map((p) => p.valor)).toEqual([-77130.08, -28721.28, 14717.34]);
  });

  it("receita sem termo fecha direto, e o passo zero some", () => {
    expect(ponte.receita.naoExplicado).toBe(0);
    expect(ponte.receita.passos).toEqual([]);
  });

  it("diferença que os termos não explicam aparece", () => {
    const furada = ponteObrasDre({
      dre: { receita: 10, custo: 100 },
      obras: { receita: 10, custo: 90.01 },
      termos: { custoForaDasObras: 10, receitaForaDasObras: 0, financeiraNasObras: 0, cronogramaOperacional: 0 },
    });
    expect(furada.custo.naoExplicado).toBe(0.01);
  });
});

import { recorteDoIndireto } from "@/modules/financeiro/relatorios/indireto-por-mes";

describe("recorte do Indireto pela URL", () => {
  it("padrão: o ano e o mês do último mês fechado", () => {
    expect(recorteDoIndireto(undefined, undefined, "2026-09")).toEqual({ ano: 2026, mes: "2026-09" });
  });
  it("link antigo do rateio leva o ano junto do mês", () => {
    expect(recorteDoIndireto(undefined, "2025-03", "2026-09")).toEqual({ ano: 2025, mes: "2025-03" });
  });
  it("seta de ano não deixa o detalhe aberto em outro ano", () => {
    expect(recorteDoIndireto("2025", undefined, "2026-09")).toEqual({ ano: 2025, mes: "2025-12" });
    expect(recorteDoIndireto("2026", "2025-03", "2026-09")).toEqual({ ano: 2026, mes: "2026-09" });
  });
});
