import { describe, expect, it } from "vitest";

import {
  FRACAO_MAXIMA,
  aplicarFretes,
  fracaoDaViagem,
  pontoNaRota,
} from "@/modules/mapa/fretes";
import { distanciaM } from "@/modules/mapa/geo";
import type {
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

describe("carreta em rota pelo Frete", () => {
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

  it("a máquina do frete vai para a rota, em rota e sem trecho; as outras passam iguais", () => {
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
      agora,
    );
    const [cs3, x] = equipamentos;
    expect(cs3.estado).toBe("em_rota");
    expect(cs3.fontePosicao).toBe("frete");
    expect(cs3.pos?.[1]).toBeCloseTo(-9.5, 6);
    expect(cs3.trechoId).toBeNull();
    expect(cs3.rumoManual).toBeNull();
    expect(x).toBe(outra);
    expect(freteDe.get("cs3")?.valorTotal).toBe(12346.9);
  });
});
