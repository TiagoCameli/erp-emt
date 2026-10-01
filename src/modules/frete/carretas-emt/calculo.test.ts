import { describe, expect, it } from "vitest";

import {
  CHAVE_FROTA,
  CHAVE_OUTRAS,
  grupoDaCategoria,
  mesesEntre,
  montarPainel,
  normalizarPlaca,
  periodoPadrao,
  rotuloMes,
} from "./calculo";
import { paraDadosCarretas } from "./dados";
import { base, RAIZ } from "./fixture-carretas";

const FILTRO = { de: "2026-08", ate: "2026-09", placa: "" };

describe("utilitários", () => {
  it("normaliza placa, rotula e enumera meses", () => {
    expect(normalizarPlaca("sqs 7e-01")).toBe("SQS7E01");
    expect(rotuloMes("2026-09")).toBe("set/26");
    expect(mesesEntre("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("agrupa as categorias reais das carretas", () => {
    expect(grupoDaCategoria("Salário Mão de Obra")).toBe("mao_de_obra");
    expect(grupoDaCategoria("Vale Alimentação Mão de Obra")).toBe("mao_de_obra");
    expect(grupoDaCategoria("13º Salário Mão de Obra")).toBe("mao_de_obra");
    expect(grupoDaCategoria("Rescisões Trabalhistas Mão de Obra")).toBe("mao_de_obra");
    expect(grupoDaCategoria("Manutenção de equipamentos")).toBe("manutencao");
    expect(grupoDaCategoria("Combustível")).toBe("combustivel");
    expect(grupoDaCategoria("IPVA")).toBe("documentacao");
    expect(grupoDaCategoria("Aquisição de Equipamento")).toBe("aquisicao");
    expect(grupoDaCategoria("Outras despesas")).toBe("outros");
    expect(grupoDaCategoria("Hospedagem")).toBe("outros");
  });

  it("abre do primeiro mês com frete ou gasto até hoje, sem deixar a parcela puxar", () => {
    expect(periodoPadrao(base(), "2026-09")).toEqual({ de: "2026-07", ate: "2026-09" });
  });
});

describe("montarPainel, frota inteira", () => {
  const painel = montarPainel(base(), FILTRO, "2026-09");
  const porChave = Object.fromEntries(painel.desempenhos.map((d) => [d.chave, d]));

  it("soma a produção por carreta e põe a placa desconhecida à parte", () => {
    expect(porChave.SQS7E01?.viagens).toBe(15);
    expect(porChave.SQS7E01?.producao).toBe(150000.1);
    expect(porChave.SQU9C94?.producao).toBe(8000.2);
    expect(porChave[CHAVE_OUTRAS]?.producao).toBe(3000);
    expect(painel.placasNaoReconhecidas).toEqual(["SQS7E71"]);
    expect(painel.total.producao).toBe(161000.3);
    expect(painel.total.viagens).toBe(21);
  });

  it("custo operacional = gasto sem aquisição + diesel; aquisição vai para investimento", () => {
    // SQS7E01: 5.000 + 12.000,30 + 6.394,70 de diesel (o combustível de julho está fora).
    expect(porChave.SQS7E01?.custoOperacional).toBe(23395);
    expect(porChave.SQS7E01?.diesel).toBe(6394.7);
    expect(porChave.SQU9C94?.custoOperacional).toBe(3000);
    expect(porChave.SQU9C94?.investimento).toBe(20000);
    expect(porChave[CHAVE_FROTA]?.custoOperacional).toBe(1000);
    expect(painel.total.custoOperacional).toBe(27395);
  });

  it("a parcela do período entra no resultado final, paga ou não", () => {
    // SQS7E01 em ago-set: L1 10.000 + 10.000, L2 10.000 + 10.000.
    expect(porChave.SQS7E01?.parcelas).toBe(40000);
    expect(porChave.SQS7E01?.resultadoOperacional).toBe(126605.1);
    expect(porChave.SQS7E01?.resultadoFinal).toBe(86605.1);
    expect(porChave.SQU9C94?.resultadoFinal).toBe(-34999.8);
    expect(painel.total.parcelas).toBe(60000);
  });

  it("a posição do financiamento é a de hoje, com atraso e próxima parcela", () => {
    const f = porChave.SQS7E01!.financiamento;
    expect(f.contratado).toBe(90000);
    expect(f.pago).toBe(30000);
    // L1: set 10.000 + out 30.000; L2 (metade dela): ago 10.000 + out 10.000.
    expect(f.saldo).toBe(60000);
    // Agosto da L2 venceu e não foi paga.
    expect(f.emAtraso).toBe(10000);
    // Setembro da L1 vence no mês atual.
    expect(f.proximoMes).toBe("2026-09");
    expect(f.proximaParcela).toBe(10000);
    expect(f.parcelasPagas).toBe(3);
    expect(f.parcelasTotal).toBe(9);
  });

  it("conta as parcelas do contrato de duas carretas uma vez só no total", () => {
    const l2 = painel.contratos.find((k) => k.lancamentoId === "L2")!;
    expect(l2.placas).toEqual(["SQS7E01", "SQU9C94"]);
    expect(l2.contratado).toBe(60000);
    expect(l2.parcelasTotal).toBe(3);
    expect(l2.parcelasPagas).toBe(1);
    expect(l2.saldo).toBe(40000);
    expect(painel.total.financiamento.parcelasTotal).toBe(9);
    expect(painel.total.financiamento.parcelasPagas).toBe(3);
  });

  it("monta a série mensal com a mesma conta do resumo", () => {
    expect(painel.meses.map((m) => m.mes)).toEqual(["2026-08", "2026-09"]);
    const set = painel.meses[1]!;
    expect(set.viagens).toBe(11);
    expect(set.producaoPorCarreta.SQS7E01).toBe(50000.1);
    expect(set.viagensPorCarreta[CHAVE_OUTRAS]).toBe(2);
    expect(set.custoOperacional).toBe(22395);
    expect(set.investimento).toBe(20000);
    expect(set.parcelas).toBe(30000);
    const somaMeses = painel.meses.reduce((s, m) => s + Math.round(m.resultadoFinal * 100), 0) / 100;
    expect(somaMeses).toBe(painel.total.resultadoFinal);
    expect(painel.meses.at(-1)?.resultadoAcumulado).toBe(painel.total.resultadoFinal);
    expect(painel.meses.at(-1)?.operacionalAcumulado).toBe(painel.total.resultadoOperacional);
  });

  it("indicadores por viagem, tonelada e km", () => {
    const a = porChave.SQS7E01!;
    expect(a.producaoPorViagem).toBeCloseTo(10000.0067, 3);
    expect(a.producaoPorTonelada).toBeCloseTo(200.0001, 3);
    expect(a.custoPorKm).toBeCloseTo(23395 / 6000, 6);
    expect(a.mesesRodando).toBe(2);
    expect(a.margemOperacional).toBeCloseTo(126605.1 / 150000.1, 6);
    expect(porChave[CHAVE_FROTA]?.margemOperacional).toBeNull();
  });
});

describe("montarPainel, uma carreta", () => {
  it("recorta tudo pela placa e deixa de fora a frota e a placa desconhecida", () => {
    const painel = montarPainel(base(), { ...FILTRO, placa: "squ 9c94" }, "2026-09");
    expect(painel.desempenhos.map((d) => d.chave)).toEqual(["SQU9C94"]);
    expect(painel.total.producao).toBe(8000.2);
    expect(painel.total.custoOperacional).toBe(3000);
    expect(painel.total.financiamento.contratado).toBe(30000);
    expect(painel.contratos.map((k) => k.lancamentoId)).toEqual(["L2"]);
    expect(painel.meses[1]?.viagensPorCarreta).toEqual({ SQU9C94: 4 });
  });
});

describe("montarPainel, por tipo de transporte", () => {
  it("recorta só a produção; gasto e parcela continuam os da carreta inteira", () => {
    const todos = montarPainel(base(), FILTRO, "2026-09");
    const painel = montarPainel(base(), { ...FILTRO, tipo: "transferencia" }, "2026-09");
    // Transferências: SQU9C94 (4 viagens, 8.000,20) e a placa errada (2 viagens, 3.000).
    expect(painel.total.viagens).toBe(6);
    expect(painel.total.producao).toBe(11000.2);
    expect(painel.desempenhos.find((d) => d.chave === "SQS7E01")?.viagens).toBe(0);
    expect(painel.total.custoOperacional).toBe(todos.total.custoOperacional);
    expect(painel.total.parcelas).toBe(todos.total.parcelas);
    expect(painel.meses[1]?.viagensPorCarreta).toEqual({ SQU9C94: 4, [CHAVE_OUTRAS]: 2 });
  });
});

describe("paraDadosCarretas", () => {
  it("lê os números em texto da RPC", () => {
    const dados = paraDadosCarretas({
      raiz_id: RAIZ,
      carretas: [{ centro_id: "cc-a", nome: "X", placa: "SQS7E01" }],
      fretes: [{ placa: "SQS7E01", mes: "2026-09", tipo: "material", viagens: 3, toneladas: "150.5000", km: "900.0000", valor: "30000.10" }],
      gastos: [{ centro_id: "cc-a", mes: "2026-09", categoria: null, valor: "10.00", pago: "0.00" }],
      contratos: [],
      parcelas: [{ lancamento_id: "L", centro_id: "cc-a", mes: "2026-09", paga: true, quantidade: 1, valor: "5.55" }],
      diesel: [],
    });
    expect(dados?.fretes[0]).toMatchObject({ toneladas: 150.5, valor: 30000.1, viagens: 3 });
    expect(dados?.gastos[0]?.categoria).toBe("Sem categoria");
    expect(dados?.parcelas[0]).toMatchObject({ paga: true, valor: 5.55 });
  });

  it("recusa formato inesperado", () => {
    expect(paraDadosCarretas(null)).toBeNull();
    expect(paraDadosCarretas({ carretas: [] })).toBeNull();
  });
});
