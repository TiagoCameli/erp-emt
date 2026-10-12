import { describe, expect, it } from "vitest";

import {
  aplicarIndireto,
  ID_NAO_RATEADO,
  janelasContiguas,
  margemPorObra,
  rateioPermitidoNoCustoCc,
} from "@/modules/financeiro/relatorios/indireto-nos-relatorios";
import type { FiltrosCustoCc } from "@/modules/financeiro/relatorios/filtros-custo-cc";

const ESCRITORIO = "0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e";
const MANUTENCAO = "fbd2556a-3e96-474b-818f-ff536a288dff";
const OBRA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBRA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBRA_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INDIRETOS = new Set([ESCRITORIO, MANUTENCAO]);

const centros = [
  { centroCustoId: OBRA_A, nome: "Obra A", codigo: "100", valor: 1000.1 },
  { centroCustoId: ESCRITORIO, nome: "Escritório Central", codigo: null, valor: 300.2 },
  { centroCustoId: OBRA_B, nome: "Obra B", codigo: "200", valor: 500 },
  { centroCustoId: MANUTENCAO, nome: "Manutenção", codigo: null, valor: 0.1 },
];

const centavos = (v: number) => Math.round(v * 100);

describe("aplicarIndireto", () => {
  it("tira os indiretos, soma o indireto nas obras e mantém o total ao centavo", () => {
    // 300,20 + 0,10 = 300,30 de indireto: 200,15 para A, 100,05 para B, 0,10 não rateado.
    const r = aplicarIndireto(centros, {
      porObra: new Map([
        [OBRA_A, 200.15],
        [OBRA_B, 100.05],
      ]),
      naoRateado: 0.1,
      indiretos: INDIRETOS,
    });

    const ids = r.centros.map((c) => c.centroCustoId);
    expect(ids).not.toContain(ESCRITORIO);
    expect(ids).not.toContain(MANUTENCAO);

    const a = r.centros.find((c) => c.centroCustoId === OBRA_A)!;
    expect(a).toMatchObject({ direto: 1000.1, indireto: 200.15, valor: 1200.25 });
    const b = r.centros.find((c) => c.centroCustoId === OBRA_B)!;
    expect(b).toMatchObject({ direto: 500, indireto: 100.05, valor: 600.05 });

    const nr = r.centros.find((c) => c.centroCustoId === ID_NAO_RATEADO)!;
    expect(nr).toMatchObject({
      nome: "Indireto não rateado",
      codigo: null,
      direto: 0,
      indireto: 0.1,
      valor: 0.1,
    });

    const totalOriginal = centros.reduce((s, c) => s + centavos(c.valor), 0);
    expect(centavos(r.total)).toBe(totalOriginal);
    expect(r.centros.reduce((s, c) => s + centavos(c.valor), 0)).toBe(totalOriginal);
  });

  it("ordena pelo valor com indireto, maior primeiro", () => {
    const r = aplicarIndireto(centros, {
      porObra: new Map([[OBRA_B, 900]]),
      naoRateado: 0,
      indiretos: INDIRETOS,
    });
    expect(r.centros.map((c) => c.centroCustoId)).toEqual([OBRA_B, OBRA_A]);
  });

  it("sem não rateado, não desenha a linha dele", () => {
    const r = aplicarIndireto(centros, {
      porObra: new Map([[OBRA_A, 300.3]]),
      naoRateado: 0,
      indiretos: INDIRETOS,
    });
    expect(r.centros.some((c) => c.centroCustoId === ID_NAO_RATEADO)).toBe(false);
  });

  it("obra que recebe indireto sem custo no recorte entra com o nome do cadastro", () => {
    const r = aplicarIndireto(
      centros,
      {
        porObra: new Map([
          [OBRA_A, 200],
          [OBRA_C, 100.3],
        ]),
        naoRateado: 0,
        indiretos: INDIRETOS,
      },
      new Map([[OBRA_C, { nome: "Obra C", codigo: "300" }]]),
    );
    const c = r.centros.find((x) => x.centroCustoId === OBRA_C)!;
    expect(c).toMatchObject({ nome: "Obra C", codigo: "300", direto: 0, indireto: 100.3, valor: 100.3 });
    expect(centavos(r.total)).toBe(centros.reduce((s, x) => s + centavos(x.valor), 0));
  });

  it("obra sem nome no cadastro vai para o não rateado, sem sumir dinheiro", () => {
    const r = aplicarIndireto(centros, {
      porObra: new Map([
        [OBRA_A, 200],
        [OBRA_C, 100.3],
      ]),
      naoRateado: 0,
      indiretos: INDIRETOS,
    });
    expect(r.centros.some((x) => x.centroCustoId === OBRA_C)).toBe(false);
    const nr = r.centros.find((x) => x.centroCustoId === ID_NAO_RATEADO)!;
    expect(nr.valor).toBe(100.3);
    expect(centavos(r.total)).toBe(centros.reduce((s, x) => s + centavos(x.valor), 0));
  });
});

describe("margemPorObra", () => {
  it("margem sem e com indireto por obra, sem os indiretos, pela receita", () => {
    const linhas = margemPorObra(
      new Map([
        [OBRA_A, { nome: "Obra A", receita: 2000 }],
        [OBRA_B, { nome: "Obra B", receita: 5000 }],
      ]),
      new Map([
        [OBRA_A, 1000.1],
        [OBRA_B, 4000],
        [ESCRITORIO, 300.2],
        [OBRA_C, 50],
      ]),
      new Map([
        [OBRA_A, 199.9],
        [OBRA_B, 100.3],
      ]),
      INDIRETOS,
      new Map([[OBRA_C, "Obra C"]]),
    );

    expect(linhas.map((l) => l.centroId)).toEqual([OBRA_B, OBRA_A, OBRA_C]);

    const a = linhas.find((l) => l.centroId === OBRA_A)!;
    expect(a.receita).toBe(2000);
    expect(a.custoDireto).toBe(1000.1);
    expect(a.indireto).toBe(199.9);
    expect(a.resultadoSem).toBe(999.9);
    expect(a.resultadoCom).toBe(800);
    expect(a.margemSem).toBeCloseTo(49.995, 6);
    expect(a.margemCom).toBeCloseTo(40, 6);

    const c = linhas.find((l) => l.centroId === OBRA_C)!;
    expect(c.nome).toBe("Obra C");
    expect(c.margemSem).toBeNull();
    expect(c.margemCom).toBeNull();
    expect(c.resultadoCom).toBe(-50);
  });
});

describe("janelasContiguas", () => {
  it("meses marcados soltos viram janelas [inicio, fim) sem cobrir o buraco", () => {
    expect(janelasContiguas(["2026-04", "2026-02", "2026-03", "2026-06", "2025-12"])).toEqual([
      { inicio: "2025-12-01", fim: "2026-01-01" },
      { inicio: "2026-02-01", fim: "2026-05-01" },
      { inicio: "2026-06-01", fim: "2026-07-01" },
    ]);
    expect(janelasContiguas([])).toEqual([]);
  });
});

describe("rateioPermitidoNoCustoCc", () => {
  const base: FiltrosCustoCc = {
    modo: "mes",
    mes: "2026-04",
    de: "",
    ate: "",
    centroIds: [],
    etapaIds: [],
    categoriaIds: [],
    fornecedorIds: [],
    formaIds: [],
    semForma: false,
    status: [],
    tiposCentro: [],
    excluirPrevisto: false,
    comparar: false,
    incluirInvestimento: false,
    comIndireto: true,
  };

  it("sem filtro de recorte, vale em mês, período e tudo", () => {
    expect(rateioPermitidoNoCustoCc(base)).toBe(true);
    expect(rateioPermitidoNoCustoCc({ ...base, modo: "periodo" })).toBe(true);
    expect(rateioPermitidoNoCustoCc({ ...base, modo: "total" })).toBe(true);
  });

  it("qualquer recorte que muda a base do indireto desliga", () => {
    expect(rateioPermitidoNoCustoCc({ ...base, modo: "vida" })).toBe(false);
    expect(rateioPermitidoNoCustoCc({ ...base, centroIds: [OBRA_A] })).toBe(false);
    expect(rateioPermitidoNoCustoCc({ ...base, categoriaIds: [OBRA_A] })).toBe(false);
    expect(rateioPermitidoNoCustoCc({ ...base, fornecedorIds: [OBRA_A] })).toBe(false);
    expect(rateioPermitidoNoCustoCc({ ...base, formaIds: [OBRA_A] })).toBe(false);
    expect(rateioPermitidoNoCustoCc({ ...base, semForma: true })).toBe(false);
    expect(rateioPermitidoNoCustoCc({ ...base, status: ["pago"] })).toBe(false);
    expect(rateioPermitidoNoCustoCc({ ...base, tiposCentro: ["obra"] })).toBe(false);
    expect(rateioPermitidoNoCustoCc({ ...base, excluirPrevisto: true })).toBe(false);
    expect(rateioPermitidoNoCustoCc({ ...base, incluirInvestimento: true })).toBe(false);
  });
});

import { margemPorObraPermitida, mesDoRateio } from "@/modules/financeiro/relatorios/indireto-nos-relatorios";

describe("margemPorObraPermitida", () => {
  it("só sem corte de centro e sem incluir investimentos (o rateio é sempre sem CAPEX)", () => {
    expect(margemPorObraPermitida({ semCorteDeCentro: true, incluirInvestimento: false })).toBe(true);
    expect(margemPorObraPermitida({ semCorteDeCentro: true, incluirInvestimento: true })).toBe(false);
    expect(margemPorObraPermitida({ semCorteDeCentro: false, incluirInvestimento: false })).toBe(false);
  });
});

describe("mesDoRateio", () => {
  it("aceita yyyy-MM válido e cai no padrão com mês inexistente", () => {
    expect(mesDoRateio("2026-04", "2026-09")).toBe("2026-04");
    expect(mesDoRateio("2026-13", "2026-09")).toBe("2026-09");
    expect(mesDoRateio("abc", "2026-09")).toBe("2026-09");
    expect(mesDoRateio(undefined, "2026-09")).toBe("2026-09");
  });
});
