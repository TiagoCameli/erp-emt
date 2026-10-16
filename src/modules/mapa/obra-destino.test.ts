import { describe, expect, it } from "vitest";

import { distanciaM, type DestinoResolvido } from "@/modules/mapa/geo";
import {
  PELA_ZONA,
  SEM_OBRA,
  decisaoObra,
  escolhaInicialObra,
  obraDoDestino,
  obraEfetiva,
  pontoNaObra,
} from "@/modules/mapa/obra-destino";
import type {
  AreaMapa,
  LocalidadeMapa,
  Posicao,
  TrechoMapa,
} from "@/modules/mapa/tipos";

const P: Posicao = [-72.7, -7.6];

function naArea(obraId: string | null): DestinoResolvido {
  const area: AreaMapa = {
    id: `a-${obraId}`,
    nome: "Pátio",
    tipo: "patio_obra",
    obraId,
    obraNome: obraId ?? "",
    localidadeId: null,
    atributos: {},
    poligonos: [],
    centro: null,
  };
  return { tipo: "area", area, pos: P, estado: "parado" };
}

function noTrecho(obraId: string): DestinoResolvido {
  const trecho: TrechoMapa = {
    id: "t1",
    obraId,
    obraNome: obraId,
    trechoPaiId: null,
    nome: "Lote",
    rodovia: "BR-364",
    kmInicial: 700,
    kmFinal: 711,
    cor: "",
    ordem: 0,
    pontos: [],
  };
  return {
    tipo: "trecho",
    trecho,
    pos: P,
    km: 701,
    distanciaM: 5,
    heading: 90,
    estado: "operando",
  };
}

function noLocal(obraId: string | null): DestinoResolvido {
  const local: LocalidadeMapa = {
    id: "l1",
    nome: "Oficina",
    tipo: "oficina",
    obraId,
    fornecedorId: null,
    pos: P,
    tipos: ["oficina"],
    raioM: null,
  };
  return {
    tipo: "localidade",
    local,
    pos: P,
    distanciaM: 3,
    estado: "conserto",
  };
}

const livre: DestinoResolvido = { tipo: "livre", pos: P, estado: null };

describe("obraDoDestino", () => {
  it("lê a obra da área, do trecho e do local", () => {
    expect(obraDoDestino(naArea("o1"))).toBe("o1");
    expect(obraDoDestino(noTrecho("o2"))).toBe("o2");
    expect(obraDoDestino(noLocal("o3"))).toBe("o3");
  });

  it("ponto livre e zona sem obra não têm obra", () => {
    expect(obraDoDestino(livre)).toBeNull();
    expect(obraDoDestino(naArea(null))).toBeNull();
    expect(obraDoDestino(noLocal(null))).toBeNull();
  });
});

describe("escolhaInicialObra", () => {
  it("todas na mesma obra: vem com a obra", () => {
    expect(escolhaInicialObra([naArea("o1"), noTrecho("o1")])).toBe("o1");
  });

  it("obras diferentes, todas com obra: pela zona", () => {
    expect(escolhaInicialObra([naArea("o1"), noTrecho("o2")])).toBe(PELA_ZONA);
  });

  it("algum ponto sem obra: vazio, a pessoa tem que escolher", () => {
    expect(escolhaInicialObra([livre])).toBe("");
    expect(escolhaInicialObra([naArea("o1"), livre])).toBe("");
    expect(escolhaInicialObra([noLocal(null)])).toBe("");
  });
});

describe("obraEfetiva e decisaoObra", () => {
  it("obra escolhida vence a do ponto", () => {
    expect(obraEfetiva("o9", naArea("o1"))).toBe("o9");
    expect(decisaoObra("o9")).toEqual({ tipo: "obra", obraId: "o9" });
  });

  it("pela zona segue o ponto de cada uma", () => {
    expect(obraEfetiva(PELA_ZONA, naArea("o1"))).toBe("o1");
    expect(obraEfetiva(PELA_ZONA, noTrecho("o2"))).toBe("o2");
    expect(decisaoObra(PELA_ZONA)).toEqual({ tipo: "pela_zona" });
  });

  it("sem obra é escolha explícita; vazio não deixa confirmar", () => {
    expect(obraEfetiva(SEM_OBRA, naArea("o1"))).toBeNull();
    expect(decisaoObra(SEM_OBRA)).toEqual({ tipo: "sem_obra" });
    expect(decisaoObra("")).toBeNull();
  });
});

describe("pontoNaObra", () => {
  it("ponto livre: fica no ponto da obra", () => {
    expect(pontoNaObra(P, [])).toEqual(P);
  });

  it("ponto ocupado: vai para o anel, longe de quem já está", () => {
    const p1 = pontoNaObra(P, [P]);
    expect(distanciaM(p1, P)).toBeGreaterThanOrEqual(10);
    const p2 = pontoNaObra(P, [P, p1]);
    expect(distanciaM(p2, P)).toBeGreaterThanOrEqual(10);
    expect(distanciaM(p2, p1)).toBeGreaterThanOrEqual(10);
  });
});
