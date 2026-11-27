// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  anomaliasDeLeitura,
  CONFIG_CONSUMO_PADRAO,
  consumoMensal,
  destaques,
  mediasPorGrupo,
  resumirPorVeiculo,
  trechoDoBanco,
  type TrechoLinha,
} from "@/modules/combustivel/consumo/calculo";

function t(parcial: Partial<TrechoLinha> & Pick<TrechoLinha, "saidaId" | "data">): TrechoLinha {
  return {
    veiculoChave: "eq:carro",
    equipamentoId: "carro",
    transportadoraId: null,
    placa: "",
    classe: "veiculo_leve",
    litros: 0,
    valorTotal: 0,
    odometroKm: null,
    horimetroH: null,
    virada: false,
    kmTrecho: null,
    litrosKm: null,
    valorKm: null,
    diasKm: null,
    saltoKm: false,
    consumoForaKm: false,
    hTrecho: null,
    litrosH: null,
    valorH: null,
    diasH: null,
    saltoH: false,
    consumoForaH: false,
    ...parcial,
  };
}

// Os números da prova SQL: carro 10.000 -> 10.500 (40 L) -> 11.100 (60 L), virada em 50, 450 (40 L).
const CARRO: TrechoLinha[] = [
  t({ saidaId: "c1", data: "2025-01-01T13:00:00Z", litros: 50, valorTotal: 300, odometroKm: 10000 }),
  t({ saidaId: "c2", data: "2025-01-03T13:00:00Z", litros: 40, valorTotal: 240, odometroKm: 10500, kmTrecho: 500, litrosKm: 40, valorKm: 240 }),
  t({ saidaId: "c3", data: "2025-01-05T13:00:00Z", litros: 60, valorTotal: 360, odometroKm: 11100, kmTrecho: 600, litrosKm: 60, valorKm: 360 }),
  t({ saidaId: "c4", data: "2025-01-07T13:00:00Z", litros: 30, valorTotal: 180, odometroKm: 50, virada: true }),
  t({ saidaId: "c5", data: "2025-02-09T13:00:00Z", litros: 40, valorTotal: 240, odometroKm: 450, kmTrecho: 400, litrosKm: 40, valorKm: 240 }),
  t({ saidaId: "c6", data: "2025-02-10T13:00:00Z", litros: 20, valorTotal: 120 }),
];

describe("consumo por veículo", () => {
  it("soma só os trechos válidos; o primeiro e a virada marcam início, sem leitura conta à parte", () => {
    const [r] = resumirPorVeiculo(CARRO);
    expect(r).toMatchObject({
      chave: "eq:carro",
      km: 1500,
      litrosKm: 140,
      litros: 240,
      trechosKm: 3,
      abastecimentos: 6,
      semLeitura: 1,
      leituraInicialKm: 10000,
      leituraFinalKm: 450,
    });
    expect(r!.lPorKm).toBeCloseTo(140 / 1500, 10);
    expect(r!.kmPorL).toBeCloseTo(1500 / 140, 10);
    expect(r!.rPorKm).toBeCloseTo(840 / 1500, 10);
    expect(r!.lPorH).toBeNull();
  });

  it("carreta pela placa e máquina pelo cadastro: mesmos números, mesmo L/km", () => {
    const placa = resumirPorVeiculo([
      t({ saidaId: "p1", data: "2025-01-01T13:00:00Z", veiculoChave: "pl:t:PRV0A00", equipamentoId: null, classe: "carreta", odometroKm: 1000, litros: 50 }),
      t({ saidaId: "p2", data: "2025-01-02T13:00:00Z", veiculoChave: "pl:t:PRV0A00", equipamentoId: null, classe: "carreta", odometroKm: 1400, litros: 40, kmTrecho: 400, litrosKm: 40 }),
    ]);
    const maquina = resumirPorVeiculo([
      t({ saidaId: "m1", data: "2025-01-01T13:00:00Z", veiculoChave: "eq:m", equipamentoId: "m", classe: "maquina", odometroKm: 1000, litros: 50 }),
      t({ saidaId: "m2", data: "2025-01-02T13:00:00Z", veiculoChave: "eq:m", equipamentoId: "m", classe: "maquina", odometroKm: 1400, litros: 40, kmTrecho: 400, litrosKm: 40 }),
    ]);
    expect(placa[0]!.lPorKm).toBe(0.1);
    expect(maquina[0]!.lPorKm).toBe(0.1);
  });

  it("carreta sem placa não vira veículo", () => {
    expect(resumirPorVeiculo([t({ saidaId: "x", data: "2025-01-01T13:00:00Z", veiculoChave: null })])).toEqual([]);
  });

  it("médias ponderadas por tipo e a da frota por último", () => {
    const resumos = resumirPorVeiculo([
      ...CARRO,
      t({ saidaId: "e1", data: "2025-01-01T13:00:00Z", veiculoChave: "eq:esc", equipamentoId: "esc", classe: "maquina", horimetroH: 100, litros: 30 }),
      t({ saidaId: "e2", data: "2025-01-02T13:00:00Z", veiculoChave: "eq:esc", equipamentoId: "esc", classe: "maquina", horimetroH: 110, litros: 50, hTrecho: 10, litrosH: 50, valorH: 300 }),
    ]);
    const medias = mediasPorGrupo(resumos, () => "Escavadeira");
    expect(medias.map((m) => m.grupo)).toEqual(["Veículos leves", "Escavadeira", "Frota"]);
    expect(medias[1]!.lPorH).toBe(5);
    expect(medias[2]).toMatchObject({ veiculos: 2, km: 1500, h: 10 });
  });

  it("destaque só acima do limite e com trechos suficientes na janela", () => {
    const periodo = resumirPorVeiculo(CARRO.slice(0, 3)); // 100 L / 1100 km
    const historico = resumirPorVeiculo(CARRO); // 140 L / 1500 km, 3 trechos
    const semDesvio = destaques(periodo, historico, CONFIG_CONSUMO_PADRAO);
    expect(semDesvio.size).toBe(0); // 0,0909 contra 0,0933: abaixo da média
    const pior = resumirPorVeiculo([
      CARRO[0]!,
      { ...CARRO[1]!, litrosKm: 60, litros: 60 }, // 60 L em 500 km = 0,12 L/km, 28,6% acima de 0,0933
    ]);
    const realce = destaques(pior, historico, CONFIG_CONSUMO_PADRAO).get("eq:carro");
    expect(realce?.kmPercentual).toBeCloseTo((0.12 / (140 / 1500) - 1) * 100, 6);
    expect(destaques(pior, historico, { ...CONFIG_CONSUMO_PADRAO, minTrechos: 4 }).size).toBe(0);
    expect(destaques(pior, historico, { ...CONFIG_CONSUMO_PADRAO, desvioPercentual: 30 }).size).toBe(0);
  });

  it("evolução mensal pelo mês de Rio Branco do abastecimento que fecha o trecho", () => {
    expect(consumoMensal(CARRO)).toEqual([
      { mes: "2025-01", km: 1100, h: 0, lPorKm: 100 / 1100, kmPorL: 11, lPorH: null },
      { mes: "2025-02", km: 400, h: 0, lPorKm: 0.1, kmPorL: 10, lPorH: null },
    ]);
  });
});

describe("anomalias D6 e D7", () => {
  it("salto e consumo fora do padrão viram uma anomalia cada, por abastecimento", () => {
    const anomalias = anomaliasDeLeitura(
      [
        t({ saidaId: "s1", data: "2025-01-10T13:00:00Z", kmTrecho: 1550, litrosKm: 20, diasKm: 1, saltoKm: true }),
        t({ saidaId: "s2", data: "2025-01-11T13:00:00Z", hTrecho: 0.5, litrosH: 40, diasH: 1, consumoForaH: true }),
        t({ saidaId: "s3", data: "2025-01-12T13:00:00Z", kmTrecho: 100, litrosKm: 10 }),
      ],
      () => "VL-001 Hilux",
      (iso) => iso.slice(0, 10),
    );
    expect(anomalias.map((a) => [a.id, a.detector, a.severity])).toEqual([
      ["D6-s1", "D6", "warning"],
      ["D7-s2", "D7", "warning"],
    ]);
    expect(anomalias[0]!.description).toContain("1.550 km em 1,0 dia(s)");
    expect(anomalias[1]!.description).toContain("80,0 L/h");
    expect(anomalias[0]!.affectedEquipamentoId).toBe("carro");
  });
});

describe("linha do banco", () => {
  it("numeric em texto vira número e classe desconhecida vira máquina", () => {
    const linha = trechoDoBanco({
      saida_id: "s",
      veiculo_chave: "eq:x",
      equipamento_id: "x",
      transportadora_id: null,
      placa: "",
      classe: "outra",
      data: "2025-01-01T13:00:00Z",
      litros: "40.0000",
      valor_total: "240.0000",
      odometro_km: "10500.0000",
      horimetro_h: null,
      virada: false,
      km_trecho: "500.0000",
      litros_km: "40.0000",
      valor_km: "240.0000",
      dias_km: "2.0000",
      salto_km: false,
      consumo_fora_km: false,
      h_trecho: null,
      litros_h: null,
      valor_h: null,
      dias_h: null,
      salto_h: false,
      consumo_fora_h: false,
    });
    expect(linha).toMatchObject({ classe: "maquina", litros: 40, odometroKm: 10500, kmTrecho: 500, horimetroH: null });
  });
});
