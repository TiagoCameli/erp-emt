import { describe, expect, it } from "vitest";

import { facetasNoServidor } from "@/modules/_shared/filtros-facetados";
import {
  aplicarFiltrosPontos,
  facetasDosPontos,
  soltarFacetaPontos,
  type FiltrosPontos,
} from "@/modules/rh/apontamentos/queries";

interface Linha {
  obra_id: string;
  status: string;
  encarregado_id: string | null;
  data: string;
}

/** Builder que filtra um array em memória: o banco de mentira das facetas. */
interface EmMemoria {
  linhas: Linha[];
  eq: (coluna: string, valor: string) => EmMemoria;
  gte: (coluna: string, valor: string) => EmMemoria;
  lte: (coluna: string, valor: string) => EmMemoria;
}

function emMemoria(linhas: Linha[]): EmMemoria {
  const coluna = (linha: Linha, nome: string) => linha[nome as keyof Linha] ?? "";
  return {
    linhas,
    eq: (nome, valor) => emMemoria(linhas.filter((l) => coluna(l, nome) === valor)),
    gte: (nome, valor) => emMemoria(linhas.filter((l) => coluna(l, nome) >= valor)),
    lte: (nome, valor) => emMemoria(linhas.filter((l) => coluna(l, nome) <= valor)),
  };
}

const LINHAS: Linha[] = [
  { obra_id: "obra-a", status: "rascunho", encarregado_id: "joao", data: "2026-09-01" },
  { obra_id: "obra-a", status: "aprovado", encarregado_id: "maria", data: "2026-09-02" },
  { obra_id: "obra-b", status: "aprovado", encarregado_id: "pedro", data: "2026-08-15" },
];

function facetas(filtros: FiltrosPontos) {
  return facetasNoServidor(facetasDosPontos(filtros), async (exceto) =>
    aplicarFiltrosPontos(
      emMemoria(LINHAS),
      exceto ? soltarFacetaPontos(filtros, exceto) : filtros,
    ).linhas,
  );
}

describe("facetas dos pontos", () => {
  it("escolher a obra restringe encarregado e status, e a obra não se corta", async () => {
    const resultado = await facetas({ obraId: "obra-a" });
    expect(resultado.encarregado.sort()).toEqual(["joao", "maria"]);
    expect(resultado.status.sort()).toEqual(["aprovado", "rascunho"]);
    expect(resultado.obra.sort()).toEqual(["obra-a", "obra-b"]);
  });

  it("o período restringe as obras, sem ser faceta", async () => {
    const resultado = await facetas({ de: "2026-09-01" });
    expect(resultado.obra).toEqual(["obra-a"]);
  });

  it("status + obra: cada um vê o recorte do outro", async () => {
    const resultado = await facetas({ obraId: "obra-b", status: "aprovado" });
    expect(resultado.status).toEqual(["aprovado"]);
    expect(resultado.obra.sort()).toEqual(["obra-a", "obra-b"]);
    expect(resultado.encarregado).toEqual(["pedro"]);
  });
});
