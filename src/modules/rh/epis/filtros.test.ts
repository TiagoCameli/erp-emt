import { describe, expect, it } from "vitest";

import { filtrarEpis, type FiltrosTelaEpis } from "@/modules/rh/epis/filtros";
import type { EpiLista } from "@/modules/rh/epis/queries";

function epi(parcial: Partial<EpiLista>): EpiLista {
  return {
    id: "e",
    colaboradorId: "c1",
    colaboradorNome: "Ana",
    descricao: "Bota",
    ca: null,
    quantidade: 1,
    dataEntrega: "2026-09-01",
    dataDevolucao: null,
    assinado: false,
    observacao: null,
    criadoEm: "2026-09-01T00:00:00Z",
    ...parcial,
  };
}

const VAZIO: FiltrosTelaEpis = {
  busca: "",
  colaboradorId: "",
  situacao: "",
  assinado: "",
  entregaDe: "",
  entregaAte: "",
  devolucaoDe: "",
  devolucaoAte: "",
};

const EPIS = [
  epi({ id: "1", colaboradorId: "c1", assinado: true }),
  epi({ id: "2", colaboradorId: "c2", dataDevolucao: "2026-09-10" }),
  epi({ id: "3", colaboradorId: "c3", colaboradorNome: "Bruno" }),
];

const COLABORADORES = [
  { valor: "c1", rotulo: "Ana" },
  { valor: "c2", rotulo: "Ana" },
  { valor: "c3", rotulo: "Bruno" },
];

const SITUACOES = [
  { valor: "em_uso", rotulo: "Em uso" },
  { valor: "devolvido", rotulo: "Devolvido" },
];

describe("filtrarEpis (facetado)", () => {
  it("escolher a situação restringe os colaboradores oferecidos", () => {
    const { linhas, opcoes } = filtrarEpis(EPIS, {
      ...VAZIO,
      situacao: "devolvido",
    });
    expect(linhas.map((l) => l.id)).toEqual(["2"]);
    expect(opcoes("colaborador", COLABORADORES).map((o) => o.valor)).toEqual([
      "c2",
    ]);
    // A própria situação não se restringe: dá para trocar sem limpar.
    expect(opcoes("situacao", SITUACOES).map((o) => o.valor)).toEqual([
      "em_uso",
      "devolvido",
    ]);
  });

  it("a busca restringe as opções e o valor escolhido nunca some", () => {
    const { linhas, opcoes } = filtrarEpis(EPIS, {
      ...VAZIO,
      busca: "bruno",
      assinado: "sim",
    });
    expect(linhas).toEqual([]);
    expect(
      opcoes("assinado", [
        { valor: "sim", rotulo: "Assinado" },
        { valor: "nao", rotulo: "Não assinado" },
      ]).map((o) => o.valor),
    ).toEqual(["sim", "nao"]);
    expect(opcoes("situacao", SITUACOES).map((o) => o.valor)).toEqual([]);
  });
});
