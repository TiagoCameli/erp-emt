import { describe, expect, it } from "vitest";

import { distanciaM } from "@/modules/mapa/geo";
import {
  destinoDaPessoa,
  lugarDaPessoa,
  pessoaNoFiltro,
  posicaoDoOperador,
} from "@/modules/mapa/pessoas";
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
    obraMapaId: null,
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

describe("destinoDaPessoa", () => {
  const silo = { id: "local-silo" };

  it("tocou dentro do raio do local: trabalha nele e fica no ponto tocado", () => {
    // No pátio cheio de máquinas o centro do local some debaixo delas; o ponto tocado não.
    expect(destinoDaPessoa([-72.7071, -7.6118], silo)).toEqual({
      localidade_id: "local-silo",
      lng: -72.7071,
      lat: -7.6118,
    });
  });

  it("escolheu o local na ficha (sem ponto): vai para o local", () => {
    expect(destinoDaPessoa(null, silo)).toEqual({
      localidade_id: "local-silo",
    });
  });

  it("ponto fora de qualquer local: só o ponto", () => {
    expect(destinoDaPessoa([-72.5, -7.5], null)).toEqual({
      lng: -72.5,
      lat: -7.5,
    });
  });

  it("sem ponto e sem local: nada a mover", () => {
    expect(destinoDaPessoa(null, null)).toBeNull();
  });

  it("obra como local: grava a obra, sem local, no ponto dado", () => {
    expect(destinoDaPessoa([-72.5, -7.5], null, { id: "obra-a" })).toEqual({
      obra_id: "obra-a",
      lng: -72.5,
      lat: -7.5,
    });
    expect(destinoDaPessoa(null, null, { id: "obra-a" })).toEqual({
      obra_id: "obra-a",
    });
  });

  it("local ganha da obra (o local já diz a obra dele)", () => {
    expect(destinoDaPessoa(null, { id: "silo" }, { id: "obra-a" })).toEqual({
      localidade_id: "silo",
    });
  });
});

describe("lugarDaPessoa", () => {
  const ativas = new Set(["obra-a"]);

  it("local escolhido aparece como local", () => {
    expect(lugarDaPessoa(pessoa({ localidadeId: "silo" }), ativas)).toBe(
      "local:silo",
    );
  });

  it("obra do Mapa, ativa, sem local: a obra é o local", () => {
    expect(lugarDaPessoa(pessoa({ obraMapaId: "obra-a" }), ativas)).toBe(
      "obra:obra-a",
    );
  });

  it("obra só do RH não conta como local escolhido", () => {
    expect(
      lugarDaPessoa(pessoa({ obraId: "obra-a", obraMapaId: null }), ativas),
    ).toBe("");
  });

  it("obra inativa deixa de ser o local", () => {
    expect(lugarDaPessoa(pessoa({ obraMapaId: "obra-velha" }), ativas)).toBe(
      "",
    );
  });

  it("quem opera máquina ou está numa área não mostra a obra como local", () => {
    expect(
      lugarDaPessoa(
        pessoa({ obraMapaId: "obra-a", equipamentoId: "eq-1" }),
        ativas,
      ),
    ).toBe("");
    expect(
      lugarDaPessoa(pessoa({ obraMapaId: "obra-a", areaId: "area-1" }), ativas),
    ).toBe("");
  });
});

describe("posicaoDoOperador", () => {
  const maquina: [number, number] = [-72.7067, -7.6121];

  it("máquina virada para o norte: o boneco fica a oeste, na mesma latitude", () => {
    const p = posicaoDoOperador(maquina, 0, 8.6);
    expect(p[0]).toBeLessThan(maquina[0]);
    expect(p[1]).toBeCloseTo(maquina[1], 9);
  });

  it("máquina virada para o leste: a esquerda dela é o norte", () => {
    const p = posicaoDoOperador(maquina, 90, 8.6);
    expect(p[1]).toBeGreaterThan(maquina[1]);
    expect(p[0]).toBeCloseTo(maquina[0], 9);
  });

  it("fica à distância pedida, encostado na lateral", () => {
    expect(distanciaM(maquina, posicaoDoOperador(maquina, 37, 8.6))).toBeCloseTo(8.6, 1);
  });
});
