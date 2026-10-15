import { describe, expect, it } from "vitest";

import {
  lerPeriodoFornecedores,
  resumirRanking,
  TOPO_DO_RANKING,
  type FornecedorRankingLinha,
} from "@/modules/financeiro/relatorios/fornecedores-ranking";

const linha = (
  nome: string,
  emAberto: number,
  extra: Partial<FornecedorRankingLinha> = {},
): FornecedorRankingLinha => ({
  fornecedorId: nome,
  nome,
  lancamentos: 1,
  lancado: 0,
  pago: 0,
  emAberto,
  vencido: 0,
  proximos30: 0,
  ...extra,
});

describe("resumirRanking", () => {
  it("soma em centavos e conta só quem tem aberto", () => {
    const r = resumirRanking([
      linha("A", 0.1, { lancado: 0.1, vencido: 0.1 }),
      linha("B", 0.2, { lancado: 0.2, proximos30: 0.2 }),
      linha("C", 0, { pago: 100 }),
    ]);
    expect(r.totais.emAberto).toBe(0.3);
    expect(r.totais.lancado).toBe(0.3);
    expect(r.totais.pago).toBe(100);
    expect(r.totais.vencido).toBe(0.1);
    expect(r.totais.proximos30).toBe(0.2);
    expect(r.comAberto).toBe(2);
  });

  it("ordena os maiores credores e corta no topo", () => {
    const linhas = Array.from({ length: 15 }, (_, i) => linha(`F${i}`, i + 1));
    const r = resumirRanking(linhas);
    expect(r.maioresEmAberto).toHaveLength(TOPO_DO_RANKING);
    expect(r.maioresEmAberto[0].nome).toBe("F14");
    // Concentração: (15+14+13+12+11) / (1+...+15) = 65 / 120.
    expect(r.concentracaoTop5).toBeCloseTo(65 / 120, 10);
  });

  it("sem nada em aberto, sem concentração", () => {
    expect(resumirRanking([linha("A", 0, { pago: 10 })]).concentracaoTop5).toBeNull();
    expect(resumirRanking([]).maioresEmAberto).toEqual([]);
  });
});

describe("lerPeriodoFornecedores", () => {
  it("sem nada na URL, o ano corrente até o mês corrente", () => {
    expect(lerPeriodoFornecedores({}, "2026-10")).toEqual({
      modo: "periodo",
      mes: "2026-10",
      de: "2026-01",
      ate: "2026-10",
    });
  });

  it("o que a URL escolheu manda", () => {
    expect(lerPeriodoFornecedores({ modo: "total" }, "2026-10").modo).toBe("total");
    expect(lerPeriodoFornecedores({ modo: "mes", mes: "2026-03" }, "2026-10")).toMatchObject({
      modo: "mes",
      mes: "2026-03",
    });
  });
});
