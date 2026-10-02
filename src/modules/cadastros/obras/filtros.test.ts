import { describe, expect, it } from "vitest";

import { filtrarObras, type FiltrosObras } from "@/modules/cadastros/obras/filtros";
import type { ObraLista } from "@/modules/cadastros/obras/queries";

function obra(parcial: Partial<ObraLista>): ObraLista {
  return {
    id: "o",
    nome: "Obra",
    numeroContrato: null,
    clienteId: null,
    clienteNome: null,
    rodovia: null,
    lote: null,
    uf: null,
    extensaoKm: null,
    dataInicio: null,
    dataFimPrevista: null,
    status: "em_andamento",
    observacoes: null,
    ativo: true,
    ...parcial,
  };
}

const SEM_FILTRO: FiltrosObras = {
  busca: "",
  status: "todos",
  situacao: "",
  clienteId: "",
  uf: "",
  rodovia: "",
  lote: "",
  inicioDe: "",
  inicioAte: "",
  fimDe: "",
  fimAte: "",
};

const LISTA = [
  obra({ id: "1", nome: "BR-364 Lote 9", uf: "RO", rodovia: "BR-364", lote: "9", clienteId: "dnit" }),
  obra({ id: "2", nome: "BR-364 Lote 10", uf: "RO", rodovia: "BR-364", lote: "10", clienteId: "dnit" }),
  obra({ id: "3", nome: "BR-163", uf: "MT", rodovia: "BR-163", lote: "1", clienteId: "seinfra", ativo: false }),
];

const OPCOES_UF = ["MT", "RO"].map((v) => ({ valor: v, rotulo: v }));
const OPCOES_LOTE = ["1", "10", "9"].map((v) => ({ valor: v, rotulo: v }));

describe("filtrarObras (facetado)", () => {
  it("escolher a UF restringe os lotes aos da UF", () => {
    const { linhas, opcoes } = filtrarObras(LISTA, { ...SEM_FILTRO, uf: "RO" });
    expect(linhas.map((o) => o.id)).toEqual(["1", "2"]);
    expect(opcoes("lote", OPCOES_LOTE).map((o) => o.valor)).toEqual(["10", "9"]);
    expect(opcoes("uf", OPCOES_UF).map((o) => o.valor)).toEqual(["MT", "RO"]);
  });

  it("status ativo tira da UF a que só tem obra inativa, e a busca também restringe", () => {
    expect(
      filtrarObras(LISTA, { ...SEM_FILTRO, status: "ativos" }).opcoes("uf", OPCOES_UF).map((o) => o.valor),
    ).toEqual(["RO"]);
    expect(
      filtrarObras(LISTA, { ...SEM_FILTRO, busca: "163" }).opcoes("lote", OPCOES_LOTE).map((o) => o.valor),
    ).toEqual(["1"]);
  });
});
