// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  calcularPrecoFIFO,
  combustivelDaUltimaEntrada,
  montarConsumosAnteriores,
  precoFifoDaSaida,
  relogioDoCampo,
  relogioRioBranco,
  type ConsumoAnterior,
  type EntradaFifo,
  type EsvaziamentoFifo,
  type SaidaFifo,
  type TransferenciaFifo,
} from "@/modules/combustivel/_shared/fifo-ts";

/**
 * Os testes de `src/utils/fifoCombustivel.test.ts` do Gestão Obras, portados um a um com as
 * mesmas expectativas. Só a forma dos dados muda (os campos que o FIFO lê).
 */

const ent = (id: string, depositoId: string, dataHora: string, litros: number, valor: number): EntradaFifo => ({
  id,
  dataHora,
  depositoId,
  tipoCombustivel: "d",
  quantidadeLitros: litros,
  valorTotal: valor,
});

const trans = (id: string, destinoId: string, dataHora: string, litros: number, valor: number): TransferenciaFifo => ({
  id,
  dataHora,
  depositoOrigemId: "outro",
  depositoDestinoId: destinoId,
  quantidadeLitros: litros,
  valorTotal: valor,
});

const consumo = (
  tipo: "saida" | "transferencia_out" | "esvaziamento",
  tanqueId: string,
  data: string,
  litros: number,
): ConsumoAnterior => ({ tipo, tanqueId, data, litros });

describe("calcularPrecoFIFO", () => {
  it("1 lote único: porção tem saldoAntesDoConsumo correto", () => {
    const entradas = [ent("e1", "t1", "2026-01-01T08:00:00", 10000, 55000)];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-02T08:00:00",
      litros: 100,
      entradas,
      transferenciasIn: [],
      consumosAnteriores: [],
    });
    expect(r.precoMedio).toBe(5.5);
    expect(r.detalhamento).toEqual([
      {
        fonteTipo: "entrada",
        fonteId: "e1",
        fonteDataHora: "2026-01-01T08:00:00",
        saldoAntesDoConsumo: 10000,
        litros: 100,
        preco: 5.5,
      },
    ]);
    expect(r.litrosSemSuprimento).toBe(0);
  });

  it("2 lotes: exemplo 70/30 reflete saldoAntesDoConsumo correto", () => {
    const entradas = [
      ent("A", "t1", "2026-01-01T08:00:00", 10000, 55000),
      ent("B", "t1", "2026-01-10T08:00:00", 2000, 12000),
    ];
    const consumosAnteriores = [consumo("saida", "t1", "2026-01-05T08:00:00", 9930)];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-15T08:00:00",
      litros: 100,
      entradas,
      transferenciasIn: [],
      consumosAnteriores,
    });
    expect(r.precoMedio).toBeCloseTo(5.65, 4);
    expect(r.detalhamento).toEqual([
      {
        fonteTipo: "entrada",
        fonteId: "A",
        fonteDataHora: "2026-01-01T08:00:00",
        saldoAntesDoConsumo: 70,
        litros: 70,
        preco: 5.5,
      },
      {
        fonteTipo: "entrada",
        fonteId: "B",
        fonteDataHora: "2026-01-10T08:00:00",
        saldoAntesDoConsumo: 2000,
        litros: 30,
        preco: 6.0,
      },
    ]);
  });

  it("consumo anterior tipo transferencia_out reduz saldo", () => {
    const entradas = [ent("A", "t1", "2026-01-01T08:00:00", 1000, 5500)];
    const consumosAnteriores = [consumo("transferencia_out", "t1", "2026-01-05T08:00:00", 800)];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-10T08:00:00",
      litros: 100,
      entradas,
      transferenciasIn: [],
      consumosAnteriores,
    });
    expect(r.detalhamento[0].saldoAntesDoConsumo).toBe(200);
    expect(r.precoMedio).toBe(5.5);
  });

  it("consumo anterior tipo esvaziamento reduz saldo", () => {
    const entradas = [ent("A", "t1", "2026-01-01T08:00:00", 1000, 6000)];
    const consumosAnteriores = [consumo("esvaziamento", "t1", "2026-01-05T08:00:00", 500)];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-10T08:00:00",
      litros: 200,
      entradas,
      transferenciasIn: [],
      consumosAnteriores,
    });
    expect(r.detalhamento[0].saldoAntesDoConsumo).toBe(500);
    expect(r.detalhamento[0].litros).toBe(200);
    expect(r.precoMedio).toBe(6.0);
  });

  it("ordem cronológica mistura saídas + transf_out + esvaziamentos", () => {
    const entradas = [ent("A", "t1", "2026-01-01T08:00:00", 1000, 5000)];
    const consumosAnteriores = [
      consumo("saida", "t1", "2026-01-05T08:00:00", 200),
      consumo("transferencia_out", "t1", "2026-01-03T08:00:00", 100),
      consumo("esvaziamento", "t1", "2026-01-07T08:00:00", 50),
    ];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-10T08:00:00",
      litros: 100,
      entradas,
      transferenciasIn: [],
      consumosAnteriores,
    });
    expect(r.detalhamento[0].saldoAntesDoConsumo).toBe(650);
    expect(r.detalhamento[0].litros).toBe(100);
    expect(r.litrosSemSuprimento).toBe(0);
  });

  it("saída sem lote anterior: litrosSemSuprimento total", () => {
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-01T08:00:00",
      litros: 100,
      entradas: [],
      transferenciasIn: [],
      consumosAnteriores: [],
    });
    expect(r.precoMedio).toBe(0);
    expect(r.detalhamento).toEqual([]);
    expect(r.litrosSemSuprimento).toBe(100);
  });

  it("saída parcialmente suprida", () => {
    const entradas = [ent("A", "t1", "2026-01-01T08:00:00", 50, 275)];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-02T08:00:00",
      litros: 100,
      entradas,
      transferenciasIn: [],
      consumosAnteriores: [],
    });
    expect(r.detalhamento[0].litros).toBe(50);
    expect(r.detalhamento[0].saldoAntesDoConsumo).toBe(50);
    expect(r.litrosSemSuprimento).toBe(50);
  });

  it("ignora entradas futuras (após data da operação)", () => {
    const entradas = [
      ent("A", "t1", "2026-01-01T08:00:00", 100, 550),
      ent("B", "t1", "2026-02-01T08:00:00", 100, 800),
    ];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-15T08:00:00",
      litros: 50,
      entradas,
      transferenciasIn: [],
      consumosAnteriores: [],
    });
    expect(r.detalhamento).toEqual([
      {
        fonteTipo: "entrada",
        fonteId: "A",
        fonteDataHora: "2026-01-01T08:00:00",
        saldoAntesDoConsumo: 100,
        litros: 50,
        preco: 5.5,
      },
    ]);
  });

  it("transferências IN tratadas como lote", () => {
    const transferenciasIn = [trans("T1", "t1", "2026-01-01T08:00:00", 200, 1200)];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-15T08:00:00",
      litros: 100,
      entradas: [],
      transferenciasIn,
      consumosAnteriores: [],
    });
    expect(r.detalhamento[0].fonteTipo).toBe("transferencia");
    expect(r.detalhamento[0].fonteId).toBe("T1");
    expect(r.precoMedio).toBe(6.0);
  });

  it("ordena lotes por data ASC, independente da ordem input", () => {
    const entradas = [
      ent("B", "t1", "2026-01-10T08:00:00", 2000, 12000),
      ent("A", "t1", "2026-01-01T08:00:00", 100, 550),
    ];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-15T08:00:00",
      litros: 150,
      entradas,
      transferenciasIn: [],
      consumosAnteriores: [],
    });
    expect(r.detalhamento[0].fonteId).toBe("A");
    expect(r.detalhamento[1].fonteId).toBe("B");
  });

  it("consumos de OUTROS tanques são ignorados", () => {
    const entradas = [ent("A", "t1", "2026-01-01T08:00:00", 1000, 5000)];
    const consumosAnteriores = [consumo("saida", "t2", "2026-01-05T08:00:00", 500)];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-10T08:00:00",
      litros: 100,
      entradas,
      transferenciasIn: [],
      consumosAnteriores,
    });
    expect(r.detalhamento[0].saldoAntesDoConsumo).toBe(1000);
  });

  it("consumos futuros (data > esta operação) são ignorados", () => {
    const entradas = [ent("A", "t1", "2026-01-01T08:00:00", 1000, 5000)];
    const consumosAnteriores = [consumo("saida", "t1", "2026-02-01T08:00:00", 500)];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-10T08:00:00",
      litros: 100,
      entradas,
      transferenciasIn: [],
      consumosAnteriores,
    });
    expect(r.detalhamento[0].saldoAntesDoConsumo).toBe(1000);
  });

  it("esvaziamento não drena lote que chegou DEPOIS dele (troca de combustível)", () => {
    // Tanque tinha diesel, foi esvaziado, recebeu gasolina depois. A saída de
    // gasolina não pode ter seus lotes drenados pelo esvaziamento do diesel.
    const entradas = [
      ent("DIESEL", "t1", "2026-01-01T08:00:00", 1000, 5000),
      { ...ent("GASOL", "t1", "2026-01-10T08:00:00", 500, 3000), tipoCombustivel: "g" },
    ];
    const consumosAnteriores = [consumo("esvaziamento", "t1", "2026-01-05T08:00:00", 1000)];
    const r = calcularPrecoFIFO({
      tanqueId: "t1",
      dataHora: "2026-01-15T08:00:00",
      litros: 200,
      entradas,
      transferenciasIn: [],
      consumosAnteriores,
      tipoCombustivel: "g",
    });
    expect(r.litrosSemSuprimento).toBe(0);
    expect(r.detalhamento[0].fonteId).toBe("GASOL");
    expect(r.detalhamento[0].preco).toBe(6.0);
    expect(r.detalhamento[0].saldoAntesDoConsumo).toBe(500);
  });
});

describe("montarConsumosAnteriores", () => {
  const saida = (id: string, tanqueId: string, data: string, litros: number, tipo = "d"): SaidaFifo => ({
    id,
    data,
    litros,
    tanqueId,
    tipoCombustivel: tipo,
  });
  const esvaz = (id: string, depositoId: string, dataHora: string, litros: number): EsvaziamentoFifo => ({
    id,
    depositoId,
    dataHora,
    litrosDescartados: litros,
  });

  it("une os 3 drenos e filtra por tanque + tipo", () => {
    const out = montarConsumosAnteriores({
      tanqueId: "t1",
      tipoCombustivel: "d",
      saidas: [
        saida("s1", "t1", "2026-01-02T08:00:00", 100, "d"),
        saida("s2", "t2", "2026-01-02T08:00:00", 999, "d"), // outro tanque
        saida("s3", "t1", "2026-01-03T08:00:00", 50, "g"), // outro tipo
      ],
      transferencias: [
        {
          id: "tOut",
          depositoOrigemId: "t1",
          depositoDestinoId: "x",
          dataHora: "2026-01-04T08:00:00",
          quantidadeLitros: 30,
          valorTotal: 0,
          tipoCombustivel: "d",
        },
        {
          id: "tIn",
          depositoOrigemId: "x",
          depositoDestinoId: "t1",
          dataHora: "2026-01-04T08:00:00",
          quantidadeLitros: 999,
          valorTotal: 0,
          tipoCombustivel: "d",
        },
      ],
      esvaziamentos: [esvaz("e1", "t1", "2026-01-05T08:00:00", 20)],
    });
    expect(out).toEqual([
      { tipo: "saida", tanqueId: "t1", data: "2026-01-02T08:00:00", litros: 100 },
      { tipo: "transferencia_out", tanqueId: "t1", data: "2026-01-04T08:00:00", litros: 30 },
      { tipo: "esvaziamento", tanqueId: "t1", data: "2026-01-05T08:00:00", litros: 20 },
    ]);
  });

  it("exclui a própria saída (modo edição)", () => {
    const out = montarConsumosAnteriores({
      tanqueId: "t1",
      saidas: [saida("atual", "t1", "2026-01-02T08:00:00", 100), saida("outra", "t1", "2026-01-01T08:00:00", 50)],
      transferencias: [],
      esvaziamentos: [],
      excluirSaidaId: "atual",
    });
    expect(out.map((c) => c.litros)).toEqual([50]);
  });
});

// ---------------------------------------------------------------------------
// O que é do ERP: as datas timestamptz no formato da origem
// ---------------------------------------------------------------------------

describe("datas no relógio de Rio Branco (formato da origem)", () => {
  it("timestamptz de qualquer fuso vira o relógio de Rio Branco com segundos", () => {
    expect(relogioRioBranco("2026-01-01T13:00:00+00:00")).toBe("2026-01-01T08:00:00");
    expect(relogioRioBranco("2026-01-01T13:00:07.123456+00:00")).toBe("2026-01-01T08:00:07");
    expect(relogioRioBranco("2026-01-01T08:00:00-05:00")).toBe("2026-01-01T08:00:00");
    // 03h UTC ainda é o dia anterior em Rio Branco.
    expect(relogioRioBranco("2026-01-02T03:00:00Z")).toBe("2026-01-01T22:00:00");
    expect(relogioRioBranco("lixo")).toBe("");
  });

  it("o campo datetime-local ganha ':00', como a origem faz", () => {
    expect(relogioDoCampo("2026-01-10T08:00")).toBe("2026-01-10T08:00:00");
    expect(relogioDoCampo("")).toBe("");
  });

  it("entrada no MESMO minuto da saída entra no lote (<=), consumo no mesmo minuto não drena (<)", () => {
    const movimentos = {
      entradas: [ent("A", "t1", relogioRioBranco("2026-01-10T13:00:00+00:00"), 100, 600)],
      transferencias: [],
      saidas: [{ id: "s0", tanqueId: "t1", data: relogioRioBranco("2026-01-10T13:00:00Z"), litros: 40, tipoCombustivel: "d" }],
      esvaziamentos: [],
    };
    const r = precoFifoDaSaida(movimentos, {
      tanqueId: "t1",
      dataHora: relogioDoCampo("2026-01-10T08:00"),
      litros: 10,
      tipoCombustivel: "d",
    });
    expect(r.precoMedio).toBe(6);
    expect(r.detalhamento[0].saldoAntesDoConsumo).toBe(100);
  });
});

describe("precoFifoDaSaida (o fifoResult da tela da origem)", () => {
  const movimentos = {
    entradas: [ent("A", "t1", "2026-01-01T08:00:00", 1000, 5000), ent("B", "t1", "2026-01-03T08:00:00", 1000, 6000)],
    transferencias: [
      { id: "in", depositoOrigemId: "t2", depositoDestinoId: "t1", dataHora: "2026-01-04T08:00:00", quantidadeLitros: 100, valorTotal: 700, tipoCombustivel: "d" },
      { id: "out", depositoOrigemId: "t1", depositoDestinoId: "t2", dataHora: "2026-01-02T08:00:00", quantidadeLitros: 900, valorTotal: 0, tipoCombustivel: "d" },
    ],
    saidas: [{ id: "atual", tanqueId: "t1", data: "2026-01-02T09:00:00", litros: 100, tipoCombustivel: "d" }],
    esvaziamentos: [],
  };

  it("sem litros: zero, sem chamar o FIFO", () => {
    expect(precoFifoDaSaida(movimentos, { tanqueId: "t1", dataHora: "2026-01-05T08:00:00", litros: 0 })).toEqual({
      precoMedio: 0,
      detalhamento: [],
      litrosSemSuprimento: 0,
    });
  });

  it("drena transferência de saída e saída anterior; na edição a própria saída sai do replay", () => {
    // Lote A (1000 a 5,00) - 900 transferidos - 100 da saída = 0; sobra B (6,00) e a transferência recebida.
    const novo = precoFifoDaSaida(movimentos, { tanqueId: "t1", dataHora: "2026-01-05T08:00:00", litros: 100, tipoCombustivel: "d" });
    expect(novo.detalhamento.map((p) => p.fonteId)).toEqual(["B"]);
    expect(novo.precoMedio).toBe(6);

    const edicao = precoFifoDaSaida(movimentos, {
      tanqueId: "t1",
      dataHora: "2026-01-05T08:00:00",
      litros: 200,
      tipoCombustivel: "d",
      excluirSaidaId: "atual",
    });
    // Sem a própria saída, sobram 100 L do lote A.
    expect(edicao.detalhamento.map((p) => [p.fonteId, p.litros])).toEqual([
      ["A", 100],
      ["B", 100],
    ]);
    expect(edicao.precoMedio).toBe(5.5);
  });

  it("transferência recebida sem tipo não vira lote quando a saída tem tipo (filtro estrito da origem)", () => {
    const semTipo = {
      ...movimentos,
      entradas: [],
      transferencias: [{ ...movimentos.transferencias[0], tipoCombustivel: null }],
      saidas: [],
    };
    const r = precoFifoDaSaida(semTipo, { tanqueId: "t1", dataHora: "2026-01-05T08:00:00", litros: 10, tipoCombustivel: "d" });
    expect(r.litrosSemSuprimento).toBe(10);
  });
});

describe("combustivelDaUltimaEntrada (tipo do tanque da EMT)", () => {
  it("o combustível da entrada mais nova do tanque; sem entrada, vazio", () => {
    const entradas = [
      ent("A", "t1", "2026-01-01T08:00:00", 1, 1),
      { ...ent("B", "t1", "2026-01-05T08:00:00", 1, 1), tipoCombustivel: "s500" },
      { ...ent("C", "t2", "2026-01-09T08:00:00", 1, 1), tipoCombustivel: "gasolina" },
    ];
    expect(combustivelDaUltimaEntrada(entradas, "t1")).toBe("s500");
    expect(combustivelDaUltimaEntrada(entradas, "t3")).toBe("");
  });
});
