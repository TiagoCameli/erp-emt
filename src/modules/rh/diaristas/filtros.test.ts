import { describe, expect, it } from "vitest";

import {
  filtrarDiarias,
  SEM_OBRA,
  type FiltrosTelaDiarias,
} from "@/modules/rh/diaristas/filtros";
import type { DiariaLista } from "@/modules/rh/diaristas/queries";

function diaria(parcial: Partial<DiariaLista>): DiariaLista {
  return {
    id: "d",
    colaboradorId: "c1",
    colaboradorNome: "Ana",
    obraId: null,
    obraNome: null,
    obraLote: null,
    data: "2026-09-01",
    competencia: "2026-09-01",
    valor: 100,
    observacao: null,
    lancamentoId: null,
    fechada: false,
    ...parcial,
  };
}

const VAZIO: FiltrosTelaDiarias = {
  busca: "",
  competencia: "",
  obraId: "",
  colaboradorId: "",
  situacao: "",
  dataDe: "",
  dataAte: "",
  valorDe: "",
  valorAte: "",
};

const DIARIAS = [
  diaria({ id: "1", colaboradorId: "c1", obraId: "o1" }),
  diaria({ id: "2", colaboradorId: "c2", obraId: null, fechada: true }),
  diaria({
    id: "3",
    colaboradorId: "c3",
    obraId: "o2",
    competencia: "2026-08-01",
    data: "2026-08-15",
  }),
];

const OBRAS = [
  { valor: "o1", rotulo: "Obra 1" },
  { valor: "o2", rotulo: "Obra 2" },
  { valor: SEM_OBRA, rotulo: "Sem obra" },
];

describe("filtrarDiarias (facetado)", () => {
  it("escolher o diarista restringe as obras oferecidas, inclusive Sem obra", () => {
    const { linhas, opcoes } = filtrarDiarias(DIARIAS, {
      ...VAZIO,
      colaboradorId: "c2",
    });
    expect(linhas.map((l) => l.id)).toEqual(["2"]);
    expect(opcoes("obra", OBRAS).map((o) => o.valor)).toEqual([SEM_OBRA]);
  });

  it("a competência (filtro de data) restringe os outros", () => {
    const { opcoes } = filtrarDiarias(DIARIAS, {
      ...VAZIO,
      competencia: "2026-08-01",
    });
    expect(opcoes("obra", OBRAS).map((o) => o.valor)).toEqual(["o2"]);
    expect(
      opcoes("situacao", [
        { valor: "aberto", rotulo: "Em aberto" },
        { valor: "paga", rotulo: "Paga" },
      ]).map((o) => o.valor),
    ).toEqual(["aberto"]);
  });
});
