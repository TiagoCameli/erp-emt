import { describe, expect, it } from "vitest";

import {
  filtrarDiarias,
  SEM_OBRA,
  type FiltrosTelaDiarias,
} from "@/modules/rh/diaristas/filtros";
import type { DiariaLista } from "@/modules/rh/diaristas/queries";

/** Rateio de 100% numa obra (o centro faz as vezes do id da obra aqui). */
function em(centro: string) {
  return [{ centroCustoId: centro, nome: centro, percentual: 100 }];
}

function diaria(parcial: Partial<DiariaLista>): DiariaLista {
  return {
    id: "d",
    colaboradorId: "c1",
    colaboradorNome: "Ana",
    obraId: null,
    obraNome: null,
    obraLote: null,
    rateio: [],
    data: "2026-09-01",
    dataFim: null,
    funcaoId: null,
    funcaoNome: null,
    valorDiaria: null,
    qtdDiarias: null,
    diasMeia: [],
    diasFalta: [],
    competencia: "2026-09-01",
    valor: 100,
    observacao: null,
    lancamentoId: null,
    fechada: false,
    situacao: "aberto",
    alteravel: true,
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
  diaria({ id: "1", colaboradorId: "c1", rateio: em("o1") }),
  diaria({
    id: "2",
    colaboradorId: "c2",
    fechada: true,
    situacao: "paga",
    alteravel: false,
  }),
  diaria({
    id: "4",
    colaboradorId: "c2",
    rateio: em("o1"),
    fechada: true,
    situacao: "fechada",
  }),
  diaria({
    id: "3",
    colaboradorId: "c3",
    rateio: em("o2"),
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
    expect(linhas.map((l) => l.id)).toEqual(["2", "4"]);
    expect(opcoes("obra", OBRAS).map((o) => o.valor)).toEqual(["o1", SEM_OBRA]);
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

  it("fechada a pagar e paga são situações diferentes", () => {
    const { linhas } = filtrarDiarias(DIARIAS, {
      ...VAZIO,
      situacao: "fechada",
    });
    expect(linhas.map((l) => l.id)).toEqual(["4"]);
  });

  it("diária rateada aparece no filtro de cada obra do rateio", () => {
    const rateada = diaria({
      id: "5",
      colaboradorId: "c4",
      rateio: [
        { centroCustoId: "o1", nome: "Obra 1", percentual: 70 },
        { centroCustoId: "o2", nome: "Obra 2", percentual: 30 },
      ],
    });
    const todas = [...DIARIAS, rateada];
    expect(
      filtrarDiarias(todas, { ...VAZIO, obraId: "o2" }).linhas.map((l) => l.id),
    ).toEqual(["3", "5"]);
    expect(
      filtrarDiarias(todas, { ...VAZIO, obraId: "o1" }).linhas.map((l) => l.id),
    ).toEqual(["1", "4", "5"]);
  });

  it("a busca acha a diária pelo nome de qualquer obra do rateio", () => {
    const rateada = diaria({
      id: "5",
      rateio: [
        { centroCustoId: "o1", nome: "007 - AC 405", percentual: 70 },
        { centroCustoId: "o2", nome: "009 - BR-364", percentual: 30 },
      ],
    });
    expect(
      filtrarDiarias([rateada], { ...VAZIO, busca: "BR-364" }).linhas,
    ).toHaveLength(1);
  });
});
