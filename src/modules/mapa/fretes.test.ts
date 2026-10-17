import { describe, expect, it } from "vitest";

import {
  FRACAO_MAXIMA,
  aplicarFretes,
  fracaoDaViagem,
  marcacaoVenceFrete,
  pontoNaRota,
} from "@/modules/mapa/fretes";
import { distanciaM } from "@/modules/mapa/geo";
import type {
  CarretaRetorno,
  EquipamentoMapa,
  FreteEmRota,
  Posicao,
} from "@/modules/mapa/tipos";

const HORA = 3_600_000;
// Reta de ~111 km para o norte (1 grau de latitude), em três pontos.
const reta: Posicao[] = [
  [-67, -10],
  [-67, -9.5],
  [-67, -9],
];

const frete = (f: Partial<FreteEmRota>): FreteEmRota => ({
  id: "f1",
  tipo: "material",
  data: "2026-10-16",
  criadoEm: "2026-10-16T13:30:00Z",
  placa: "SQU9C94",
  motorista: "",
  transportadora: "EMT TRANSPORTES",
  equipamentoId: "cs3",
  origem: "Pedreira Britam",
  destino: "Usina Gregorio",
  material: "BRITA 1",
  peso: 47,
  km: 710,
  valorTkm: 0.37,
  valorTotal: 12346.9,
  valorMaterial: 5971.82,
  horas: 10,
  caminho: reta,
  ...f,
});

describe("carreta em frete pelo Frete", () => {
  it("a fração da viagem é o tempo desde a saída sobre o tempo da rota, sem chegar", () => {
    const saida = Date.parse("2026-10-16T13:30:00Z");
    expect(fracaoDaViagem(frete({}), saida - HORA)).toBe(0);
    expect(fracaoDaViagem(frete({}), saida + 2.5 * HORA)).toBeCloseTo(0.25, 9);
    // passou do tempo da rota sem a chegada lançada: para antes do destino
    expect(fracaoDaViagem(frete({}), saida + 30 * HORA)).toBe(FRACAO_MAXIMA);
    // sem tempo medido: 50 km/h sobre os km do frete (710 km = 14,2 h)
    expect(
      fracaoDaViagem(frete({ horas: null }), saida + 7.1 * HORA),
    ).toBeCloseTo(0.5, 9);
  });

  it("o ponto cai na distância certa do traçado, com o rumo do trecho", () => {
    const meio = pontoNaRota(reta, 0.5);
    expect(meio?.pos[1]).toBeCloseTo(-9.5, 6);
    expect(meio?.heading).toBeCloseTo(0, 3); // para o norte
    const quarto = pontoNaRota(reta, 0.25);
    const total = distanciaM(reta[0], reta[2]);
    expect(distanciaM(reta[0], quarto!.pos)).toBeCloseTo(total / 4, 0);
    expect(pontoNaRota([], 0.5)).toBeNull();
  });

  it("a máquina do frete vai para a rota, em frete e sem trecho; as outras passam iguais", () => {
    const base = {
      id: "cs3",
      pos: null,
      heading: 0,
      rumoManual: 90,
      fontePosicao: "manual",
      estado: "sem_posicao",
      trechoId: "t",
      km: 3,
    } as unknown as EquipamentoMapa;
    const outra = { ...base, id: "x" } as EquipamentoMapa;
    const agora = Date.parse("2026-10-16T13:30:00Z") + 5 * HORA;
    const { equipamentos, freteDe } = aplicarFretes(
      [base, outra],
      [frete({})],
      [],
      agora,
    );
    const [cs3, x] = equipamentos;
    expect(cs3.estado).toBe("em_frete");
    expect(cs3.fontePosicao).toBe("frete");
    expect(cs3.pos?.[1]).toBeCloseTo(-9.5, 6);
    expect(cs3.trechoId).toBeNull();
    expect(cs3.rumoManual).toBeNull();
    expect(x).toBe(outra);
    expect(freteDe.get("cs3")?.valorTotal).toBe(12346.9);
  });

  describe("marcação da ficha depois da saída vence o frete (16/10/2026)", () => {
    // CS-003 sem posição, frete criado 13:30 UTC, marcada parada 15:49 UTC.
    const cs3 = {
      id: "cs3",
      pos: null,
      heading: 0,
      rumoManual: null,
      fontePosicao: "manual",
      estado: "sem_posicao",
      estadoMarcado: "parado",
      estadoDesde: "2026-10-16T15:49:20Z",
    } as unknown as EquipamentoMapa;
    const agora = Date.parse("2026-10-16T16:00:00Z");

    it("sem posição própria, fica parada no destino do frete e a rota some", () => {
      const r = aplicarFretes([cs3], [frete({})], [], agora);
      const [e] = r.equipamentos;
      expect(e.estado).toBe("parado");
      expect(e.pos).toEqual([-67, -9]);
      expect(e.fontePosicao).toBe("manual");
      expect(r.freteDe.has("cs3")).toBe(false);
      expect([...r.fretesVencidos]).toEqual(["f1"]);
    });

    it("com posição própria, fica onde está, no estado marcado", () => {
      const comPos = {
        ...cs3,
        pos: [-72, -7.9],
        estado: "parado",
      } as EquipamentoMapa;
      const [e] = aplicarFretes([comPos], [frete({})], [], agora).equipamentos;
      expect(e).toBe(comPos);
    });

    it("marcação antes da saída perde: o frete põe em frete", () => {
      const antes = {
        ...cs3,
        estadoDesde: "2026-10-16T12:00:00Z",
      } as EquipamentoMapa;
      const r = aplicarFretes([antes], [frete({})], [], agora);
      expect(r.equipamentos[0].estado).toBe("em_frete");
      expect(r.equipamentos[0].fontePosicao).toBe("frete");
      expect(r.fretesVencidos.size).toBe(0);
    });

    it("operando ou RPC antiga sem o estado marcado não vencem: segue em frete", () => {
      // Caso real: CS-003/004/005 marcadas operando 15:49 UTC com frete aberto. Carreta operando
      // é carreta rodando (Tiago, 16/10/2026).
      for (const estadoMarcado of ["operando", null]) {
        const e = { ...cs3, estadoMarcado } as EquipamentoMapa;
        const r = aplicarFretes([e], [frete({})], [], agora);
        expect(r.equipamentos[0].estado).toBe("em_frete");
        expect(r.freteDe.has("cs3")).toBe(true);
      }
    });

    it("frete novo depois da marcação volta a pôr em frete", () => {
      const r = aplicarFretes(
        [cs3],
        [frete({}), frete({ id: "f2", criadoEm: "2026-10-16T15:55:00Z" })],
        [],
        agora,
      );
      expect(r.equipamentos[0].estado).toBe("em_frete");
      expect(r.freteDe.get("cs3")?.id).toBe("f2");
      // O frete antigo, de antes da marcação, não é o que manda: a rota do novo é a que fica.
      expect(r.fretesVencidos.has("f2")).toBe(false);
    });

    it("remarcar parado sem mudar o estado também vence (vale a última marcação)", () => {
      // Parada desde antes do frete; remarcada "parado" depois da saída: estado_desde não anda.
      const remarcada = {
        ...cs3,
        estadoDesde: "2026-10-16T12:00:00Z",
        marcadoEm: "2026-10-16T15:49:20Z",
      } as EquipamentoMapa;
      const r = aplicarFretes([remarcada], [frete({})], [], agora);
      expect(r.equipamentos[0].estado).toBe("parado");
      expect(r.fretesVencidos.has("f1")).toBe(true);
    });
  });
});

describe("carreta em deslocamento: volta do destino para a pedreira", () => {
  // Chegada lançada 18:00 UTC; a volta (a reta de 111 km, ao contrário) leva 10 h.
  const volta = (r: Partial<CarretaRetorno>): CarretaRetorno => ({
    equipamentoId: "cs3",
    freteId: "f1",
    chegadaEm: "2026-10-16T18:00:00Z",
    chegada: "2026-10-16",
    de: "Usina Gregorio",
    pedreiraId: "britam",
    pedreira: "Pedreira Britam",
    pedreiraEscolhida: false,
    horas: 10,
    km: 700,
    caminho: [...reta].reverse(),
    ...r,
  });
  const chegada = Date.parse("2026-10-16T18:00:00Z");
  const cs3 = {
    id: "cs3",
    pos: null,
    heading: 0,
    rumoManual: null,
    fontePosicao: "manual",
    estado: "sem_posicao",
    estadoMarcado: "operando",
    estadoDesde: "2026-10-16T15:49:20Z",
    marcadoEm: "2026-10-16T15:49:20Z",
    localidadeNome: "",
  } as unknown as EquipamentoMapa;

  it("no meio da volta está em deslocamento, no caminho da pedreira, e a volta fica na ficha", () => {
    const r = aplicarFretes([cs3], [], [volta({})], chegada + 5 * HORA);
    const [e] = r.equipamentos;
    expect(e.estado).toBe("em_deslocamento");
    expect(e.fontePosicao).toBe("frete");
    expect(e.estadoDesde).toBe("2026-10-16T18:00:00Z");
    expect(e.pos?.[1]).toBeCloseTo(-9.5, 6);
    expect(e.heading).toBeCloseTo(180, 3); // para o sul, de volta
    expect(r.retornoDe.get("cs3")?.pedreira).toBe("Pedreira Britam");
  });

  it("passado o tempo da volta, está parada na pedreira", () => {
    const r = aplicarFretes([cs3], [], [volta({})], chegada + 11 * HORA);
    const [e] = r.equipamentos;
    expect(e.estado).toBe("parado");
    expect(e.pos).toEqual([-67, -10]);
    expect(e.localidadeNome).toBe("Pedreira Britam");
    expect(e.estadoDesde).toBe("2026-10-17T04:00:00.000Z");
  });

  it("a pedreira escolhida na ficha é o fim do caminho", () => {
    const formate: Posicao[] = [
      [-67, -9],
      [-66, -9],
    ];
    const r = aplicarFretes(
      [cs3],
      [],
      [volta({ pedreira: "Pedreira Formate", caminho: formate })],
      chegada + 11 * HORA,
    );
    expect(r.equipamentos[0].pos).toEqual([-66, -9]);
    expect(r.equipamentos[0].localidadeNome).toBe("Pedreira Formate");
  });

  it("parado marcado depois da chegada vence: fica no destino e a volta some", () => {
    const parada = {
      ...cs3,
      estadoMarcado: "parado",
      marcadoEm: "2026-10-16T19:00:00Z",
    } as EquipamentoMapa;
    const r = aplicarFretes([parada], [], [volta({})], chegada + 5 * HORA);
    expect(r.equipamentos[0].estado).toBe("parado");
    expect(r.equipamentos[0].pos).toEqual([-67, -9]);
    expect(r.equipamentos[0].fontePosicao).toBe("manual");
    expect(r.retornoDe.has("cs3")).toBe(false);
  });

  it("parado marcado depois da chegada estimada à pedreira: fica na pedreira", () => {
    const parada = {
      ...cs3,
      estadoMarcado: "parado",
      marcadoEm: "2026-10-17T06:00:00Z",
    } as EquipamentoMapa;
    const r = aplicarFretes([parada], [], [volta({})], chegada + 20 * HORA);
    expect(r.equipamentos[0].pos).toEqual([-67, -10]);
  });

  it("operando ou marcação de antes da chegada não vencem: segue em deslocamento", () => {
    const antes = {
      ...cs3,
      estadoMarcado: "parado",
      marcadoEm: "2026-10-16T17:00:00Z",
    } as EquipamentoMapa;
    const operando = {
      ...cs3,
      marcadoEm: "2026-10-16T19:00:00Z",
    } as EquipamentoMapa;
    for (const e of [antes, operando]) {
      const r = aplicarFretes([e], [], [volta({})], chegada + 5 * HORA);
      expect(r.equipamentos[0].estado).toBe("em_deslocamento");
    }
  });

  it("frete aberto vence a volta: a carreta está em frete", () => {
    const r = aplicarFretes(
      [cs3],
      [frete({ id: "f2", criadoEm: "2026-10-17T13:00:00Z" })],
      [volta({})],
      Date.parse("2026-10-17T15:00:00Z"),
    );
    expect(r.equipamentos[0].estado).toBe("em_frete");
    expect(r.retornoDe.has("cs3")).toBe(false);
  });
});

describe("marcacaoVenceFrete", () => {
  const saida = { criadoEm: "2026-10-16T08:00:00-05:00" };
  const depois = "2026-10-16T10:00:00-05:00";
  const antes = "2026-10-16T07:00:00-05:00";

  it("estado que tira da estrada, marcado depois da saída, vence o frete", () => {
    for (const estado of [
      "parado",
      "quebrado_obra",
      "esperando_conserto",
      "conserto",
      "fora_funcionamento",
    ] as const) {
      expect(
        marcacaoVenceFrete({ estadoMarcado: estado, estadoDesde: depois }, saida),
      ).toBe(true);
    }
  });

  it("operando não vence; marcação de antes da saída também não", () => {
    expect(
      marcacaoVenceFrete({ estadoMarcado: "operando", estadoDesde: depois }, saida),
    ).toBe(false);
    expect(
      marcacaoVenceFrete(
        { estadoMarcado: "fora_funcionamento", estadoDesde: antes },
        saida,
      ),
    ).toBe(false);
  });
});

describe("só carreta da EMT Transportes anda pelo Frete (v1.22)", () => {
  it("máquina que não é carreta EMT, mesmo casada pela placa, fica como está: sem frete nem volta", () => {
    const cs6 = {
      id: "cs6",
      pos: [-72, -7.9],
      heading: 0,
      rumoManual: null,
      fontePosicao: "manual",
      estado: "operando",
      carretaEmt: false,
    } as unknown as EquipamentoMapa;
    const r = aplicarFretes(
      [cs6],
      [frete({ equipamentoId: "cs6" })],
      [
        {
          equipamentoId: "cs6",
          freteId: "f0",
          chegadaEm: "2026-10-16T10:00:00Z",
          chegada: "2026-10-16",
          de: "Usina Gregorio",
          pedreiraId: "britam",
          pedreira: "Pedreira Britam",
          pedreiraEscolhida: false,
          horas: 10,
          km: 700,
          caminho: [...reta].reverse(),
        },
      ],
      Date.parse("2026-10-16T15:00:00Z"),
    );
    expect(r.equipamentos[0]).toBe(cs6);
    expect(r.freteDe.has("cs6")).toBe(false);
    expect(r.retornoDe.has("cs6")).toBe(false);
  });

  it("a carreta EMT segue em frete", () => {
    const cs3 = {
      id: "cs3",
      pos: null,
      heading: 0,
      rumoManual: null,
      fontePosicao: "manual",
      estado: "sem_posicao",
      carretaEmt: true,
    } as unknown as EquipamentoMapa;
    const r = aplicarFretes(
      [cs3],
      [frete({})],
      [],
      Date.parse("2026-10-16T15:00:00Z"),
    );
    expect(r.equipamentos[0].estado).toBe("em_frete");
  });
});
