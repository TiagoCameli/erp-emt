import { describe, expect, it } from "vitest";

import {
  filtrarColaboradores,
  type FiltrosColaboradores,
} from "@/modules/cadastros/colaboradores/filtros";
import type { ColaboradorLista } from "@/modules/cadastros/colaboradores/queries";

function colaborador(parcial: Partial<ColaboradorLista>): ColaboradorLista {
  return {
    id: "c",
    nome: "Fulano",
    funcaoId: null,
    obraId: null,
    jornadaId: null,
    vinculo: "clt",
    centroCustoId: null,
    cnhCategoria: null,
    dataAdmissao: null,
    ativo: true,
    ...parcial,
  } as ColaboradorLista;
}

const SEM_FILTRO: FiltrosColaboradores = {
  busca: "",
  status: "todos",
  funcaoId: "",
  obraId: "",
  jornadaId: "",
  vinculo: "",
  centroCustoId: "",
  cnh: "",
  admissaoDe: "",
  admissaoAte: "",
};

const LISTA = [
  colaborador({ id: "1", nome: "Ana", obraId: "obra-a", funcaoId: "pedreiro", vinculo: "clt", dataAdmissao: "2026-01-10" }),
  colaborador({ id: "2", nome: "Beto", obraId: "obra-a", funcaoId: "servente", vinculo: "diarista", dataAdmissao: "2026-05-02" }),
  colaborador({ id: "3", nome: "Caio", obraId: "obra-b", funcaoId: "motorista", vinculo: "terceiro", ativo: false }),
];

const OPCOES_FUNCAO = ["pedreiro", "servente", "motorista"].map((v) => ({ valor: v, rotulo: v }));
const OPCOES_OBRA = ["obra-a", "obra-b"].map((v) => ({ valor: v, rotulo: v }));

describe("filtrarColaboradores (facetado)", () => {
  it("escolher a obra restringe as funções às que existem nela", () => {
    const { linhas, opcoes } = filtrarColaboradores(LISTA, { ...SEM_FILTRO, obraId: "obra-a" });
    expect(linhas.map((c) => c.id)).toEqual(["1", "2"]);
    expect(opcoes("funcao", OPCOES_FUNCAO).map((o) => o.valor)).toEqual(["pedreiro", "servente"]);
    // A própria obra não se restringe: dá para trocar sem limpar.
    expect(opcoes("obra", OPCOES_OBRA).map((o) => o.valor)).toEqual(["obra-a", "obra-b"]);
  });

  it("período de admissão restringe as opções sem ser restringido", () => {
    const { opcoes } = filtrarColaboradores(LISTA, { ...SEM_FILTRO, admissaoDe: "2026-03-01" });
    expect(opcoes("funcao", OPCOES_FUNCAO).map((o) => o.valor)).toEqual(["servente"]);
  });

  it("o valor escolhido continua na lista mesmo sem linha", () => {
    const { linhas, opcoes } = filtrarColaboradores(LISTA, {
      ...SEM_FILTRO,
      status: "ativos",
      funcaoId: "motorista",
    });
    expect(linhas).toEqual([]);
    expect(opcoes("funcao", OPCOES_FUNCAO).map((o) => o.valor)).toEqual(["pedreiro", "servente", "motorista"]);
  });
});
