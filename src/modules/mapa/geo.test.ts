import { describe, expect, it } from "vitest";

import {
  colarNoLocal,
  colarNoTrecho,
  dentroDaArea,
  deslocar,
  distanciaM,
  estadoDaArea,
  estadoDoLocal,
  hexParaRgb,
  marcosKm,
  medirTrecho,
  pontoNoKm,
  resolverDestino,
  rumo,
  sugereAjuste,
  extensaoKm,
  posicaoDoNomeDaObra,
  tirarRetornoDasPontas,
  marcosNoZoom,
} from "@/modules/mapa/geo";
import type {
  AreaMapa,
  LocalidadeMapa,
  TrechoMapa,
} from "@/modules/mapa/tipos";

/** Trecho reto de ~11 km para leste, km 700 → 711, perto de Cruzeiro do Sul. */
const trecho: TrechoMapa = {
  id: "t1",
  obraId: "o1",
  obraNome: "BR-364",
  trechoPaiId: null,
  nome: "Lote teste",
  rodovia: "BR-364",
  kmInicial: 700,
  kmFinal: 711,
  cor: "#3E7744",
  ordem: 0,
  pontos: [
    [-72.5, -7.7],
    [-72.45, -7.7],
    [-72.4, -7.7],
  ],
};

const local: LocalidadeMapa = {
  id: "l1",
  nome: "Pátio",
  tipo: "patio",
  tipos: ["patio"],
  obraId: null,
  fornecedorId: null,
  pos: [-72.6, -7.8],
  raioM: null,
};
const oficina: LocalidadeMapa = {
  id: "l2",
  nome: "Oficina",
  tipo: "oficina",
  tipos: ["oficina"],
  obraId: null,
  fornecedorId: null,
  pos: [-72.7, -7.9],
  raioM: null,
};

const area: AreaMapa = {
  id: "a1",
  nome: "Pátio Lote 10",
  tipo: "patio_obra",
  obraId: "o1",
  obraNome: "BR-364",
  localidadeId: null,
  atributos: {},
  poligonos: [
    [
      [
        [-72.401, -7.701],
        [-72.399, -7.701],
        [-72.399, -7.699],
        [-72.401, -7.699],
        [-72.401, -7.701],
      ],
    ],
  ],
  centro: [-72.4, -7.7],
};

describe("distância e rumo", () => {
  it("mede ~11,0 km entre as pontas do trecho e aponta para leste", () => {
    const d = distanciaM(trecho.pontos[0], trecho.pontos[2]);
    expect(d).toBeGreaterThan(10_900);
    expect(d).toBeLessThan(11_100);
    expect(rumo(trecho.pontos[0], trecho.pontos[2])).toBeCloseTo(90, 0);
  });

  it("deslocar 100 m para o norte sobe ~0,0009 grau de latitude", () => {
    const p = deslocar([-72.5, -7.7], 0, 100);
    expect(p[0]).toBeCloseTo(-72.5, 6);
    // A projeção local é plana (110,574 km por grau); o haversine difere dela em menos de 1%.
    expect(Math.abs(distanciaM([-72.5, -7.7], p) - 100)).toBeLessThan(1);
  });
});

describe("km ao longo do traçado", () => {
  const medido = medirTrecho(trecho);

  it("o meio do traçado é o km do meio", () => {
    const { pos, heading } = pontoNoKm(medido, 705.5);
    expect(pos[0]).toBeCloseTo(-72.45, 4);
    expect(heading).toBeCloseTo(90, 0);
  });

  it("km fora da faixa trava nas pontas", () => {
    expect(pontoNoKm(medido, 600).pos).toEqual(trecho.pontos[0]);
    expect(pontoNoKm(medido, 900).pos[0]).toBeCloseTo(-72.4, 6);
  });

  it("marca os km redondos dentro da faixa", () => {
    expect(marcosKm([medido], 10).map((m) => m.km)).toEqual([700, 710]);
    expect(marcosKm([medido], 5).map((m) => m.km)).toEqual([700, 705, 710]);
  });
});

describe("colar no traçado", () => {
  const medido = medirTrecho(trecho);

  it("ponto a 100 m da pista cola nela, com km proporcional e rumo da pista", () => {
    const p = deslocar([-72.45, -7.7], 0, 100);
    const c = colarNoTrecho(p, [medido], 300);
    expect(c).not.toBeNull();
    expect(c?.distanciaM).toBeCloseTo(100, 0);
    expect(c?.km).toBeCloseTo(705.5, 1);
    expect(c?.pos[1]).toBeCloseTo(-7.7, 5);
    expect(c?.heading).toBeCloseTo(90, 0);
  });

  it("ponto a 500 m não cola quando o limite é 300 m", () => {
    expect(
      colarNoTrecho(deslocar([-72.45, -7.7], 0, 500), [medido], 300),
    ).toBeNull();
  });

  it("ponto além da ponta cai na ponta, sem passar do km final", () => {
    const c = colarNoTrecho([-72.395, -7.7], [medido], 1000);
    expect(c?.km).toBeCloseTo(711, 3);
  });
});

describe("resolver destino (mesma ordem do banco)", () => {
  const ctx = {
    trechos: [medirTrecho(trecho)],
    areas: [area],
    localidades: [local, oficina],
    snapTracadoM: 300,
    snapLocalM: 300,
  };

  it("dentro de uma área ganha do traçado e impõe o estado da zona", () => {
    expect(dentroDaArea([-72.4, -7.7], area)).toBe(true);
    const d = resolverDestino([-72.4, -7.7], ctx);
    expect(d.tipo).toBe("area");
    expect(d.estado).toBe("parado");
  });

  it("perto do traçado anota o km e fica operando, sem sair de onde foi tocado", () => {
    const tocado = deslocar([-72.45, -7.7], 180, 50);
    const d = resolverDestino(tocado, ctx);
    expect(d.tipo).toBe("trecho");
    if (d.tipo === "trecho") {
      expect(d.km).toBeCloseTo(705.5, 1);
      expect(d.estado).toBe("operando");
      expect(d.distanciaM).toBeCloseTo(50, 0);
    }
    // A máquina fica no pátio ao lado da pista, não em cima do eixo (pedido do Tiago, 15/10).
    expect(d.pos).toEqual(tocado);
  });

  it("perto de um pátio vira parado; perto da oficina vira conserto", () => {
    const patio = resolverDestino(deslocar(local.pos, 90, 120), ctx);
    expect(patio.tipo).toBe("localidade");
    expect(patio.estado).toBe("parado");
    const cons = resolverDestino(deslocar(oficina.pos, 90, 120), ctx);
    expect(cons.estado).toBe("conserto");
    expect(
      colarNoLocal(deslocar(oficina.pos, 90, 120), [local, oficina], 300)?.local
        .id,
    ).toBe("l2");
  });

  it("jazida ao lado da rodovia ganha do trecho (banco v1.20); pátio no mesmo lugar não", () => {
    const beira = deslocar([-72.45, -7.7], 180, 150);
    const jazida: LocalidadeMapa = {
      ...local,
      id: "j1",
      nome: "Jazida",
      tipo: "jazida",
      tipos: ["jazida"],
      obraId: "o2",
      pos: beira,
    };
    const naJazida = resolverDestino(beira, {
      ...ctx,
      localidades: [jazida, local, oficina],
    });
    expect(naJazida.tipo).toBe("localidade");
    if (naJazida.tipo === "localidade") expect(naJazida.local.id).toBe("j1");
    // Controle: um pátio no mesmo ponto continua perdendo para o traçado.
    const patioNaBeira = { ...jazida, id: "p9", tipo: "patio", tipos: ["patio"] };
    expect(
      resolverDestino(beira, { ...ctx, localidades: [patioNaBeira] }).tipo,
    ).toBe("trecho");
  });

  it("longe de tudo é livre e sem estado (a tela pergunta)", () => {
    const d = resolverDestino([-73.5, -8.5], ctx);
    expect(d).toEqual({ tipo: "livre", pos: [-73.5, -8.5], estado: null });
  });

  it("estados das zonas batem com a regra do banco", () => {
    expect(estadoDaArea("zona_oficina")).toBe("conserto");
    expect(estadoDaArea("jazida")).toBe("operando");
    expect(estadoDoLocal("terreno")).toBe("parado");
    expect(estadoDoLocal("usina")).toBe("operando");
  });
});

describe("cor hex", () => {
  it("converte e cai no cinza quando inválida", () => {
    expect(hexParaRgb("#3E7744")).toEqual([62, 119, 68]);
    expect(hexParaRgb("cf943a")).toEqual([207, 148, 58]);
    expect(hexParaRgb("")).toEqual([69, 70, 75]);
  });
});

describe("raio de cada local", () => {
  it("o raio do local manda; sem raio, vale o padrão", () => {
    const longe = deslocar(local.pos, 0, 600);
    expect(colarNoLocal(longe, [local], 300)).toBeNull();
    const grande = { ...local, raioM: 800 };
    expect(colarNoLocal(longe, [grande], 300)?.local.id).toBe("l1");
    const pequeno = { ...local, raioM: 50 };
    expect(
      colarNoLocal(deslocar(local.pos, 0, 120), [pequeno], 300),
    ).toBeNull();
  });
});

describe("ajuste de localização x transferência (sugestão da confirmação)", () => {
  const ctx = {
    trechos: [medirTrecho(trecho)],
    areas: [area],
    localidades: [local, oficina],
    snapTracadoM: 300,
    snapLocalM: 300,
  };
  const naPista = deslocar([-72.45, -7.7], 0, 40);
  const atualNaPista = {
    pos: naPista,
    trechoId: "t1",
    km: 705.5,
    areaId: null,
    localidadeId: null,
  };

  it("mesmo trecho a menos de 1 km sugere ajuste; a mais de 1 km, transferência", () => {
    const perto = resolverDestino(deslocar(naPista, 90, 400), ctx);
    expect(sugereAjuste(atualNaPista, perto)).toBe(true);
    const longe = resolverDestino(deslocar(naPista, 90, 2500), ctx);
    expect(sugereAjuste(atualNaPista, longe)).toBe(false);
  });

  it("mesmo pátio sugere ajuste; sair do pátio para a pista é transferência", () => {
    const noPatio = deslocar(local.pos, 90, 120);
    const atualNoPatio = {
      pos: noPatio,
      trechoId: null,
      km: null,
      areaId: null,
      localidadeId: local.id,
    };
    expect(
      sugereAjuste(
        atualNoPatio,
        resolverDestino(deslocar(local.pos, 0, 100), ctx),
      ),
    ).toBe(true);
    expect(sugereAjuste(atualNoPatio, resolverDestino(naPista, ctx))).toBe(
      false,
    );
  });

  it("livre perto de onde estava é ajuste; quem nunca foi posicionada não tem ajuste", () => {
    const livre: [number, number] = [-73.5, -8.5];
    const atualLivre = {
      pos: livre,
      trechoId: null,
      km: null,
      areaId: null,
      localidadeId: null,
    };
    expect(
      sugereAjuste(atualLivre, resolverDestino(deslocar(livre, 0, 150), ctx)),
    ).toBe(true);
    expect(
      sugereAjuste(atualLivre, resolverDestino(deslocar(livre, 0, 900), ctx)),
    ).toBe(false);
    expect(
      sugereAjuste({ ...atualLivre, pos: null }, resolverDestino(livre, ctx)),
    ).toBe(false);
  });
});

describe("obra no mapa: nome e extensão", () => {
  it("nome no ponto; sem ponto, no meio do trecho mais longo; sem trecho, no centro da área", () => {
    const medido = medirTrecho(trecho);
    const curto = medirTrecho({
      ...trecho,
      id: "t2",
      pontos: [
        [-72.6, -7.6],
        [-72.599, -7.6],
      ],
      kmInicial: 0,
      kmFinal: 0.1,
    });
    expect(posicaoDoNomeDaObra([-1, -2], [medido], [])).toEqual([-1, -2]);
    const meio = posicaoDoNomeDaObra(null, [curto, medido], []);
    expect(meio?.[0]).toBeCloseTo(-72.45, 2);
    expect(posicaoDoNomeDaObra(null, [], [area])).toEqual(area.centro);
    expect(posicaoDoNomeDaObra(null, [], [])).toBeNull();
  });

  it("extensão soma os segmentos tocados", () => {
    const a: [number, number] = [-72.5, -7.7];
    expect(
      extensaoKm([a, deslocar(a, 90, 1000), deslocar(a, 90, 2500)]),
    ).toBeCloseTo(2.5, 2);
    expect(extensaoKm([a])).toBe(0);
  });
});

describe("rota pela estrada: retorno nas pontas", () => {
  it("tira a volta na rotatória do começo e mantém o resto da estrada", () => {
    const a: [number, number] = [-72.82, -7.655];
    // sai 60 m para o sul, contorna e volta a passar a 5 m do início, depois segue 2 km a leste
    const volta = [
      deslocar(a, 180, 30),
      deslocar(a, 180, 60),
      deslocar(a, 90, 30),
      deslocar(a, 0, 5),
    ];
    const estrada = [
      deslocar(a, 90, 300),
      deslocar(a, 90, 1000),
      deslocar(a, 90, 2000),
    ];
    const limpo = tirarRetornoDasPontas([a, ...volta, ...estrada]);
    expect(limpo[0]).toEqual(a);
    expect(limpo.slice(1)).toEqual(estrada);
  });

  it("rota sem retorno passa igual; menos de 3 pontos também", () => {
    const a: [number, number] = [-72.82, -7.655];
    const reta = [a, deslocar(a, 90, 500), deslocar(a, 90, 1000)];
    expect(tirarRetornoDasPontas(reta)).toEqual(reta);
    expect(tirarRetornoDasPontas([a])).toEqual([a]);
  });
});

describe("marcos de km pelo zoom", () => {
  const medido = medirTrecho(trecho); // km 700 → 711
  const todos = marcosKm([medido], 1);

  it("gera um marco em cada km inteiro do trecho", () => {
    expect(todos.map((m) => m.km)).toEqual([
      700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711,
    ]);
  });

  it("de perto todo km, aproximando de 5 em 5, de longe de 10 em 10", () => {
    expect(marcosNoZoom(todos, 14).map((m) => m.km)).toHaveLength(12);
    expect(marcosNoZoom(todos, 13).map((m) => m.km)).toEqual([700, 705, 710]);
    expect(marcosNoZoom(todos, 11.5).map((m) => m.km)).toEqual([700, 710]);
  });
});
