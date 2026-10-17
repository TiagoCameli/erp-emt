import { describe, expect, it } from "vitest";

import { pessoaNoFiltro } from "@/modules/mapa/pessoas";
import type { PessoaMapa } from "@/modules/mapa/tipos";

function pessoa(parcial: Partial<PessoaMapa>): PessoaMapa {
  return {
    id: "p1",
    nome: "João Araújo",
    funcao: "Operador de Máquinas",
    vinculo: "clt",
    equipeId: null,
    equipeNome: "",
    obraId: "obra-a",
    frenteId: null,
    equipamentoId: null,
    areaId: null,
    localidadeId: null,
    pos: null,
    posicaoManual: false,
    centroCustoId: null,
    centroCustoNome: "",
    ...parcial,
  };
}

const SEM_FILTRO = { busca: "", obraId: "" };

describe("pessoaNoFiltro", () => {
  it("sem filtro, todo mundo entra", () => {
    expect(pessoaNoFiltro(pessoa({}), SEM_FILTRO)).toBe(true);
  });

  it("busca ignora acento e caixa, no nome e na função", () => {
    const p = pessoa({});
    expect(pessoaNoFiltro(p, { busca: "ARAUJO", obraId: "" })).toBe(true);
    expect(pessoaNoFiltro(p, { busca: "operador de maq", obraId: "" })).toBe(
      true,
    );
    expect(pessoaNoFiltro(p, { busca: "maria", obraId: "" })).toBe(false);
  });

  it("acha pela equipe", () => {
    const p = pessoa({ equipeNome: "Equipe Terraplenagem" });
    expect(pessoaNoFiltro(p, { busca: "terraplen", obraId: "" })).toBe(true);
  });

  it("obra recorta: outra obra e sem obra ficam de fora", () => {
    expect(
      pessoaNoFiltro(pessoa({ obraId: "obra-a" }), {
        busca: "",
        obraId: "obra-a",
      }),
    ).toBe(true);
    expect(
      pessoaNoFiltro(pessoa({ obraId: "obra-b" }), {
        busca: "",
        obraId: "obra-a",
      }),
    ).toBe(false);
    expect(
      pessoaNoFiltro(pessoa({ obraId: null }), { busca: "", obraId: "obra-a" }),
    ).toBe(false);
  });
});
