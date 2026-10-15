import { describe, expect, it } from "vitest";

import {
  agruparEquipamentos,
  consorciosDe,
  divergenciaDaCota,
  resumirQuitacao,
  rotuloParcelas,
  somarAquisicoes,
  type AquisicaoLinha,
} from "@/modules/financeiro/relatorios/aquisicoes";

const linha = (parcial: Partial<AquisicaoLinha>): AquisicaoLinha => ({
  tipo: "equipamento",
  grupo: "Aquisição de Equipamentos",
  centroId: "11111111-1111-4111-8111-111111111111",
  centro: "Escavadeira",
  lancamentoId: null,
  numero: null,
  descricao: null,
  fornecedor: "Fornecedor",
  primeiraCompetencia: "2026-03-01",
  lancamentos: 1,
  parcelas: null,
  parcelasPagas: null,
  parcelasAbertas: 0,
  proximoVencimento: null,
  ultimoVencimento: null,
  divida: null,
  valor: 0,
  pago: 0,
  aPagar: 0,
  ...parcial,
});

describe("somarAquisicoes", () => {
  it("soma em centavos, sem erro de ponto flutuante", () => {
    const linhas = [
      linha({ valor: 0.1, pago: 0.1, aPagar: 0 }),
      linha({ valor: 0.2, pago: 0.05, aPagar: 0.15 }),
    ];
    expect(somarAquisicoes(linhas)).toEqual({ valor: 0.3, pago: 0.15, aPagar: 0.15 });
  });

  it("lista vazia soma zero", () => {
    expect(somarAquisicoes([])).toEqual({ valor: 0, pago: 0, aPagar: 0 });
  });
});

describe("agruparEquipamentos", () => {
  it("agrupa pelo centro raiz na ordem que chegou, com subtotal, e ignora consórcio", () => {
    const grupos = agruparEquipamentos([
      linha({ grupo: "001 - Carretas EMT", centro: "Carreta A", valor: 100, pago: 40, aPagar: 60 }),
      linha({ grupo: "001 - Carretas EMT", centro: "Carreta B", valor: 50, pago: 50, aPagar: 0 }),
      linha({ grupo: "Aquisição de Equipamentos", centro: "Escavadeira", valor: 300, pago: 0, aPagar: 300 }),
      linha({ tipo: "consorcio", grupo: "Aquisição de Equipamentos", centro: "Consórcios a contemplar", valor: 999 }),
    ]);
    expect(grupos.map((g) => g.grupo)).toEqual(["001 - Carretas EMT", "Aquisição de Equipamentos"]);
    expect(grupos[0].linhas.map((l) => l.centro)).toEqual(["Carreta A", "Carreta B"]);
    expect(grupos[0].totais).toEqual({ valor: 150, pago: 90, aPagar: 60 });
    expect(grupos[1].totais).toEqual({ valor: 300, pago: 0, aPagar: 300 });
  });
});

describe("consorciosDe", () => {
  it("só as cotas", () => {
    const cota = linha({ tipo: "consorcio", numero: "L-1" });
    expect(consorciosDe([linha({}), cota])).toEqual([cota]);
  });
});

describe("rotuloParcelas", () => {
  it("pagas sobre o total", () => {
    expect(rotuloParcelas({ parcelas: 60, parcelasPagas: 3 })).toBe("3/60");
    expect(rotuloParcelas({ parcelas: 60, parcelasPagas: null })).toBe("0/60");
  });

  it("vazio quando não é cota", () => {
    expect(rotuloParcelas({ parcelas: null, parcelasPagas: null })).toBe("");
  });
});

describe("resumirQuitacao", () => {
  const LINHAS = [
    linha({ centro: "Carreta", centroId: "a", aPagar: 900.1, ultimoVencimento: "2029-12-15" }),
    linha({ centro: "Escavadeira", centroId: "b", aPagar: 600.2, ultimoVencimento: "2030-09-09", divida: "contrato" }),
    linha({ centro: "Rolo", centroId: "c", aPagar: 0, ultimoVencimento: null }),
    linha({ tipo: "consorcio", centro: "Cota 1", aPagar: 100, ultimoVencimento: "2032-09-15", divida: "cota" }),
  ];
  const r = resumirQuitacao(LINHAS);

  it("separa máquinas de consórcio, com a última parcela de cada lado", () => {
    expect(r.equipamentos).toEqual({ aPagar: 1500.3, bens: 2, quitacao: "2030-09-09" });
    expect(r.consorcios).toEqual({ aPagar: 100, cotas: 1, quitacao: "2032-09-15" });
  });

  it("aponta o bem com saldo que não está em Dívidas", () => {
    expect(r.foraDeDividas).toEqual({ nomes: ["Carreta"], aPagar: 900.1 });
  });

  it("lista só quem tem saldo, do maior para o menor", () => {
    expect(r.maiores.map((l) => l.centro)).toEqual(["Carreta", "Escavadeira", "Cota 1"]);
  });
});

describe("divergenciaDaCota", () => {
  it("lançamento x cronograma, em centavos", () => {
    expect(divergenciaDaCota({ valor: 405463.8, pago: 40546.38, aPagar: 364924.39 })).toBe(-6.97);
    expect(divergenciaDaCota({ valor: 10, pago: 4, aPagar: 6 })).toBe(0);
  });
});
