import { describe, expect, it } from "vitest";

import { legendaDaReparticao } from "@/modules/financeiro/relatorios/components/indireto-meses-tabela";
import type { MesDoIndireto } from "@/modules/financeiro/relatorios/indireto-por-mes";

const mes = (obras: string[], naoRateado: number): MesDoIndireto => ({
  mes: "2026-11",
  total: 100,
  status: "automatico",
  obras: obras.map((c, i) => ({ centroId: c, centro: c, custoDireto: 0, indireto: 0, pct: 50 - i })),
  naoRateado,
  categorias: [],
  indiretoAcimaDoDireto: [],
  diferencaCategorias: 0,
});

describe("legenda da repartição", () => {
  it("mês sem obra nenhuma não começa com separador", () => {
    expect(legendaDaReparticao(mes([], 100))).toBe("tudo sem obra");
  });
  it("três obras, as demais contadas e o que ficou sem obra", () => {
    expect(legendaDaReparticao(mes(["009 - A", "007 - B", "003 - C", "012 - D"], 1))).toBe(
      "009 50% · 007 49% · 003 48% · +1 · sem obra",
    );
  });
});
