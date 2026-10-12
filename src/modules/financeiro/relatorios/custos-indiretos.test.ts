import { describe, expect, it } from "vitest";

import {
  anoDoIndireto,
  custosPorCategoria,
  custosPorCentro,
  mesesVisiveis,
  type CustoIndiretoLinha,
} from "@/modules/financeiro/relatorios/custos-indiretos";

const ESCRITORIO = "11111111-1111-4111-8111-111111111111";
const ADMINISTRATIVO = "22222222-2222-4222-8222-222222222222";
const MANUTENCAO = "33333333-3333-4333-8333-333333333333";
const OFICINA = "44444444-4444-4444-8444-444444444444";
const ALUGUEL = "55555555-5555-4555-8555-555555555555";
const ENERGIA = "66666666-6666-4666-8666-666666666666";

const linha = (parcial: Partial<CustoIndiretoLinha>): CustoIndiretoLinha => ({
  mes: "2026-01-01",
  raizId: ESCRITORIO,
  raiz: "Escritório Central",
  centroId: ESCRITORIO,
  centro: "Escritório Central",
  categoriaId: ALUGUEL,
  categoria: "Aluguel",
  total: 0,
  ...parcial,
});

describe("anoDoIndireto", () => {
  it("aceita ano de quatro dígitos e cai no padrão no resto", () => {
    expect(anoDoIndireto("2025", 2026)).toBe(2025);
    expect(anoDoIndireto(undefined, 2026)).toBe(2026);
    expect(anoDoIndireto("abc", 2026)).toBe(2026);
    expect(anoDoIndireto("26", 2026)).toBe(2026);
    expect(anoDoIndireto("1850", 2026)).toBe(2026);
  });
});

describe("custosPorCentro", () => {
  it("soma por mês em centavos, sem erro de ponto flutuante", () => {
    const r = custosPorCentro([linha({ total: 0.1 }), linha({ total: 0.2, categoriaId: ENERGIA })]);
    expect(r.porMes[0]).toBe(0.3);
    expect(r.total).toBe(0.3);
    expect(r.raizes[0].centros[0].total).toBe(0.3);
  });

  it("agrupa por raiz com subtotal, maior raiz primeiro e a própria raiz no topo", () => {
    const r = custosPorCentro([
      linha({ total: 100 }),
      linha({ centroId: ADMINISTRATIVO, centro: "Administrativo", mes: "2026-02-01", total: 500 }),
      linha({ raizId: MANUTENCAO, raiz: "Manutenção/Documentação de Equipamentos", centroId: OFICINA, centro: "Oficina", mes: "2026-03-01", total: 50 }),
    ]);
    expect(r.raizes.map((x) => x.raiz)).toEqual(["Escritório Central", "Manutenção/Documentação de Equipamentos"]);
    const escritorio = r.raizes[0];
    expect(escritorio.centros.map((c) => c.centro)).toEqual(["Escritório Central", "Administrativo"]);
    expect(escritorio.porMes.slice(0, 3)).toEqual([100, 500, 0]);
    expect(escritorio.total).toBe(600);
    expect(r.porMes.slice(0, 3)).toEqual([100, 500, 50]);
    expect(r.total).toBe(650);
  });

  it("vazio soma zero", () => {
    const r = custosPorCentro([]);
    expect(r.raizes).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.porMes).toHaveLength(12);
  });
});

describe("custosPorCategoria", () => {
  it("soma no ano, ordena do maior e dá o percentual", () => {
    const c = custosPorCategoria([
      linha({ total: 100 }),
      linha({ mes: "2026-02-01", total: 50 }),
      linha({ categoriaId: ENERGIA, categoria: "Energia", total: 250 }),
      linha({ categoriaId: null, categoria: "Sem categoria", total: 100 }),
    ]);
    expect(c.map((x) => x.categoria)).toEqual(["Energia", "Aluguel", "Sem categoria"]);
    expect(c.map((x) => x.total)).toEqual([250, 150, 100]);
    expect(c.map((x) => x.pct)).toEqual([50, 30, 20]);
  });

  it("total zero dá percentual zero", () => {
    expect(custosPorCategoria([linha({ total: 0 })])[0].pct).toBe(0);
  });
});

describe("mesesVisiveis", () => {
  const vazio = Array.from({ length: 12 }, () => 0);
  it("ano passado mostra os doze", () => {
    expect(mesesVisiveis(2025, "2026-10", vazio)).toBe(12);
  });

  it("ano corrente vai até o mês corrente", () => {
    expect(mesesVisiveis(2026, "2026-10", vazio)).toBe(10);
  });

  it("competência adiante estica até o último mês com custo", () => {
    const porMes = [...vazio];
    porMes[11] = 10;
    expect(mesesVisiveis(2026, "2026-10", porMes)).toBe(12);
  });

  it("ano futuro vai até o último mês com custo", () => {
    const porMes = [...vazio];
    porMes[2] = 10;
    expect(mesesVisiveis(2027, "2026-10", porMes)).toBe(3);
  });
});
