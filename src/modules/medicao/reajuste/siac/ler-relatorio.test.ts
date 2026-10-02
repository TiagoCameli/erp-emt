// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { extrairTextoPdf } from "./extrair";
import { conferirRelatorio, ErroRelatorioSiac, lerRelatorioSiac, numeroSiac, type PedacoTexto, type RelatorioSiac } from "./ler-relatorio";

/** PDF real do SIAC: 4ª medição do L09 (CT 00615/2025), processado em 19/03/2026. */
const PDF = path.join(__dirname, "__fixtures__", "siac-l09-4a.pdf");

// grupo, código SICRO, unidade, valor a PI líquido, fator, reajuste (todas as 45 linhas, na ordem do PDF)
const LINHAS: [string, string, string, string, string, string][] = [
  ["1,0", "55072", "MES", "4759.76", "0.0445", "211.80"],
  ["2,2", "29083", "T", "320.57", "-0.1487", "-47.66"],
  ["2,2", "51269", "M²", "85.46", "0.0148", "1.26"],
  ["2,2", "60112", "T", "6138.18", "-0.1763", "-1082.16"],
  ["2,2", "86522", "M³", "136.85", "0.0148", "2.02"],
  ["2,2", "90224", "M³", "1202.56", "0.0073", "8.77"],
  ["2,2", "93793", "M³", "7100.28", "0.0073", "51.83"],
  ["2,2", "200134", "T", "211.64", "0.0148", "3.13"],
  ["2,2", "201005", "T", "2716.26", "0.0148", "40.20"],
  ["2,2", "290300", "M³", "2954.53", "0.0148", "43.72"],
  ["2,2", "322022", "M²", "63.54", "0.0148", "0.94"],
  ["2,2", "517556", "T", "7669.29", "0.0148", "113.50"],
  ["2,2", "517557", "M³", "21984.55", "0.0148", "325.37"],
  ["2,2", "517560", "M³", "47137.21", "0.0073", "344.10"],
  ["2,2", "6011205", "L", "25.15", "0.0148", "0.37"],
  ["2,5", "49299", "T/KM", "2419.26", "0.0445", "107.65"],
  ["2,5", "49401", "T/KM", "170.04", "0.0445", "7.56"],
  ["2,5", "517573", "T/KM", "115555.33", "0.0445", "5142.21"],
  ["3,3", "86324", "M²", "0.00", "0.0073", "0.00"],
  ["3,3", "92446", "M", "0.00", "0.0389", "0.00"],
  ["3,5", "49321", "H", "5928.96", "0.0155", "91.89"],
  ["3,5", "91396", "UN/DIA", "147.85", "0.0155", "2.29"],
  ["3,5", "91826", "UN/DIA", "289.02", "0.0155", "4.47"],
  ["3,5", "517521", "M²", "9797.23", "0.0155", "151.85"],
  ["3,6", "517557", "M³", "0.00", "0.0148", "0.00"],
  ["3,6", "517560", "M³", "0.00", "0.0073", "0.00"],
  ["3,7", "49299", "T/KM", "0.00", "0.0445", "0.00"],
  ["3,7", "517573", "T/KM", "0.00", "0.0445", "0.00"],
  ["4,0", "29083", "T", "28278.31", "-0.1487", "-4204.98"],
  ["4,0", "55025", "M³", "107705.68", "0.0445", "4792.90"],
  ["4,0", "60112", "T", "539026.36", "-0.1763", "-95030.34"],
  ["4,0", "200134", "T", "18669.65", "0.0148", "276.31"],
  ["4,0", "201005", "T", "238529.31", "0.0148", "3530.23"],
  ["4,0", "322022", "M²", "5595.77", "0.0148", "82.81"],
  ["4,0", "517555", "T", "648424.49", "0.0148", "9596.68"],
  ["4,0", "6011205", "L", "2119.46", "0.0148", "31.36"],
  ["4,1", "49299", "T/KM", "45666.57", "0.0445", "2032.16"],
  ["4,1", "517573", "T/KM", "676664.24", "0.0445", "30111.55"],
  ["7,0", "51837", "UND", "0.00", "0.0581", "0.00"],
  ["7,0", "52482", "UND", "3959.97", "-0.0085", "-33.65"],
  ["7,0", "517561", "M²", "0.00", "0.0581", "0.00"],
  ["7,0", "517562", "M²", "0.00", "0.0581", "0.00"],
  ["7,1", "49401", "T/KM", "0.00", "0.0445", "0.00"],
  ["7,1", "517573", "T/KM", "0.00", "0.0445", "0.00"],
  ["8,0", "49408", "%", "64852.93", "0.0504", "3268.58"],
];

// grupo, linhas, SUBTOTAL valor a PI acumulado, líquido, reajuste
const GRUPOS: [string, number, string, string, string][] = [
  ["1,0", 1, "59761.51", "4759.76", "211.80"],
  ["2,2", 14, "97746.07", "97746.07", "-194.61"],
  ["2,5", 3, "118144.63", "118144.63", "5257.42"],
  ["3,3", 2, "15206.15", "0.00", "0.00"],
  ["3,5", 4, "33561.59", "16163.06", "250.50"],
  ["3,6", 2, "1799269.66", "0.00", "0.00"],
  ["3,7", 2, "2588470.65", "0.00", "0.00"],
  ["4,0", 8, "3219773.37", "1588349.03", "-80925.03"],
  ["4,1", 2, "1464247.65", "722330.81", "32143.71"],
  ["7,0", 4, "917027.66", "3959.97", "-33.65"],
  ["7,1", 2, "107186.08", "0.00", "0.00"],
  ["8,0", 1, "261358.52", "64852.93", "3268.58"],
];

let paginas: PedacoTexto[][];
let relatorio: RelatorioSiac;

beforeAll(async () => {
  paginas = await extrairTextoPdf(new Uint8Array(await readFile(PDF)));
  relatorio = lerRelatorioSiac(paginas);
});

describe("relatório SIAC real (4ª do L09)", () => {
  it("lê as 3 páginas e o cabeçalho", () => {
    expect(paginas).toHaveLength(3);
    expect(relatorio.cabecalho).toEqual({
      contratoTexto: "24 00615/2025 - CONSÓRCIO EMT-COLORADO I",
      medicaoNumero: 4,
      medicaoTipo: "PROVISÓRIA",
      situacao: "definitivo",
      periodoInicio: "2026-02-01",
      periodoFim: "2026-02-28",
      dataBase: "2025-01-01",
      processadoEm: "2026-03-19",
    });
  });

  it("lê os 14 índices, cada um uma vez (as páginas repetem a tabela)", () => {
    expect(relatorio.indices.map((i) => i.sigla)).toEqual([
      "ADLOC", "ASFDIL", "CAPT", "CONSER", "DRENAG", "EMUL", "EMUMOD", "INCC", "ISAOAE", "MOB", "OAE-SA", "OCMA", "PAVIM", "SIN-H",
    ]);
    expect(relatorio.indices.find((i) => i.sigla === "CAPT")).toEqual({ sigla: "CAPT", i0: "1086.06", i1: "894.632", k: "-0.1763" });
    expect(relatorio.indices.find((i) => i.sigla === "ASFDIL")).toEqual({ sigla: "ASFDIL", i0: "1032.86", i1: "0.000", k: "-1.0000" });
    expect(relatorio.indices.find((i) => i.sigla === "INCC")).toEqual({ sigla: "INCC", i0: "1169.11", i1: "1237.03", k: "0.0581" });
  });

  it("lê as 45 linhas na ordem, com grupo, código, unidade, valor a PI líquido, fator e reajuste", () => {
    expect(relatorio.linhas.map((l) => [l.grupo, l.codigo, l.unidade, l.valorPiLiquido, l.fator, l.reajuste])).toEqual(LINHAS);
    expect(relatorio.linhas.filter((l) => l.valorPiLiquido !== "0.00")).toHaveLength(34);
  });

  it("junta a descrição de várias linhas, inclusive a que passa para a página seguinte", () => {
    const porChave = new Map(relatorio.linhas.map((l) => [`${l.grupo}|${l.codigo}`, l]));
    expect(porChave.get("2,2|93793")?.descricao).toBe(
      "ENROCAMENTO DE PEDRA ESPALHADA E COMPACTADA MECANICAMENTE - PEDRA DE MÃO COMERCIAL - FORNECIMENTO E ASSENTAMENTO",
    );
    expect(porChave.get("3,3|92446")?.descricao).toBe("TUBO PEAD PARA DRENAGEM - D = 400 MM - FORNECIMENTO E INSTALAÇÃO");
    expect(porChave.get("4,0|60112")).toMatchObject({
      descricao: "AQUISIÇÃO DE CAP 50/70",
      precoUnitario: "5641.7149",
      quantidadeAcumulada: "193.677",
      valorPiAcumulado: "1092670.40",
    });
    expect(porChave.get("3,7|517573")?.quantidadeAcumulada).toBe("3530768.7");
  });

  it("lê os 12 grupos com SUBTOTAL e a SOMA: -40.021,28 sobre 2.616.306,26", () => {
    expect(relatorio.grupos.map((g) => [g.grupo, g.linhas.length, g.subtotal.valorPiAcumulado, g.subtotal.valorPiLiquido, g.subtotal.reajuste])).toEqual(GRUPOS);
    expect(relatorio.grupos[1].descricao).toBe("CONSERVAÇÃO CORRETIVA DE PASSIVO EXISTENTE - REPARO PROFUNDO");
    expect(relatorio.soma).toEqual({ valorPiAcumulado: "10681753.54", valorPiLiquido: "2616306.26", reajuste: "-40021.28" });
  });

  it("as linhas somam os SUBTOTAIS e os SUBTOTAIS somam a SOMA", () => {
    expect(conferirRelatorio(relatorio)).toEqual([]);
  });

  it("aponta linha que não soma o SUBTOTAL e SUBTOTAL que não soma a SOMA", () => {
    const errado = structuredClone(relatorio);
    errado.grupos[7].linhas[2].reajuste = "-95030.35";
    errado.grupos[0].subtotal.reajuste = "211.81";
    expect(conferirRelatorio(errado)).toEqual([
      "Grupo 1,0: as linhas somam 211,80 de reajuste e o SUBTOTAL diz 211,81",
      "Grupo 4,0: as linhas somam -80.925,04 de reajuste e o SUBTOTAL diz -80.925,03",
      "Os SUBTOTAIS somam -40.021,27 de reajuste e a SOMA diz -40.021,28",
    ]);
  });
});

describe("numeroSiac e recusas", () => {
  it("troca o formato pt-BR pelo do banco sem passar por float", () => {
    expect(numeroSiac("1.092.670,40")).toBe("1092670.40");
    expect(numeroSiac("-95.030,34")).toBe("-95030.34");
    expect(numeroSiac("0,0073")).toBe("0.0073");
    expect(numeroSiac("3.530.768,7")).toBe("3530768.7");
    expect(() => numeroSiac("1.23,4")).toThrow(ErroRelatorioSiac);
  });

  it("recusa PDF que não é o Resumo da Medição", () => {
    expect(() => lerRelatorioSiac([[{ texto: "NOTA FISCAL", x: 30, y: 30 }]])).toThrow(
      "A página 1 não tem a tabela do Resumo da Medição. Este PDF é o relatório SIAC?",
    );
  });
});
