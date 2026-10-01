import { describe, expect, it } from "vitest";

import {
  compararRevisoes,
  glosaDoItem,
  linhasDaRevisao,
  medidaParaCampo,
  quantidadeAprovadaParaBanco,
  resumirAprovacao,
  rotulosDosItens,
  type ItemCongelado,
  type RotuloItem,
} from "@/modules/medicao/medicoes/aprovacao";

/**
 * Regras puras da aprovação (Task 4): a quantidade aprovada digitada em pt-BR vira texto com ponto
 * para a RPC (vazio é 0, ambíguo é recusado como no colar), a glosa só de exibição (medida menos
 * aprovada, exata) e a comparação item a item de duas revisões congeladas.
 */

const ROTULOS: RotuloItem[] = [
  { itemId: "i1", codigo: "01.01", descricao: "CBUQ", unidade: "t" },
  { itemId: "i2", codigo: "01.02", descricao: "Pintura de ligação", unidade: "m²" },
];

describe("quantidadeAprovadaParaBanco", () => {
  it.each([
    ["1.234,5", "1234.5"],
    ["1234,5", "1234.5"],
    ["27", "27"],
    ["0,0001", "0.0001"],
    ["1,234", "1.234"],
    ["0", "0"],
  ])("%s vira %s", (entrada, saida) => {
    expect(quantidadeAprovadaParaBanco(entrada)).toEqual({ valor: saida });
  });

  it("campo vazio vira 0", () => {
    expect(quantidadeAprovadaParaBanco("")).toEqual({ valor: "0" });
    expect(quantidadeAprovadaParaBanco("   ")).toEqual({ valor: "0" });
  });

  it("número ambíguo é recusado como no colar", () => {
    const r = quantidadeAprovadaParaBanco("1.234");
    expect(r).toEqual({ erro: expect.stringContaining("ambíguo") });
  });

  it.each(["-1", "abc", "1,23456"])("%s é recusado", (entrada) => {
    expect(quantidadeAprovadaParaBanco(entrada)).toHaveProperty("erro");
  });
});

describe("medidaParaCampo e glosaDoItem", () => {
  it("a medida do banco vira o valor cru do campo, sem zeros sobrando", () => {
    expect(medidaParaCampo("28.5000")).toBe("28,5");
    expect(medidaParaCampo("29")).toBe("29");
  });

  it("glosa é medida menos aprovada, exata; inválida é nula", () => {
    expect(glosaDoItem("29", "27")).toBe("2");
    expect(glosaDoItem("0.3", "0,1")).toBe("0.2");
    expect(glosaDoItem("29", "")).toBe("29");
    expect(glosaDoItem("29", "1.234")).toBeNull();
  });
});

const CONGELADOS: ItemCongelado[] = [
  { revisaoId: "r0", itemId: "i1", quantidade: "28" },
  { revisaoId: "r1", itemId: "i1", quantidade: "29" },
  { revisaoId: "r1", itemId: "i2", quantidade: "2.5" },
  { revisaoId: "r1", itemId: "i9", quantidade: "1" },
];

describe("linhasDaRevisao", () => {
  it("só os itens da revisão, na ordem da planilha, com rótulo; item sem rótulo vai no fim", () => {
    expect(linhasDaRevisao(CONGELADOS, "r1", ROTULOS)).toEqual([
      { ...ROTULOS[0], medida: "29" },
      { ...ROTULOS[1], medida: "2.5" },
      { itemId: "i9", codigo: null, descricao: null, unidade: null, medida: "1" },
    ]);
  });
});

describe("resumirAprovacao", () => {
  const linhas = linhasDaRevisao(CONGELADOS, "r1", ROTULOS).slice(0, 2);

  it("campo vazio vira 0, aparece entre os zerados e na glosa", () => {
    const r = resumirAprovacao(linhas, { i1: "27" });
    expect(r.erros).toEqual({});
    expect(r.itens).toEqual([
      { itemId: "i1", quantidade: "27" },
      { itemId: "i2", quantidade: "0" },
    ]);
    expect(r.zerados.map((l) => l.itemId)).toEqual(["i2"]);
    expect(r.glosas).toEqual([
      { linha: linhas[0], glosa: "2" },
      { linha: linhas[1], glosa: "2.5" },
    ]);
  });

  it("tudo como medido: sem zerado e sem glosa", () => {
    const r = resumirAprovacao(linhas, { i1: "29", i2: "2,5" });
    expect(r.zerados).toEqual([]);
    expect(r.glosas).toEqual([]);
  });

  it("valor inválido vira erro do campo", () => {
    const r = resumirAprovacao(linhas, { i1: "1.234", i2: "-1" });
    expect(Object.keys(r.erros)).toEqual(["i1", "i2"]);
  });
});

describe("compararRevisoes", () => {
  it("quantidade congelada de cada uma e a diferença (para menos de); ausente é 0", () => {
    expect(compararRevisoes(CONGELADOS, "r0", "r1", ROTULOS)).toEqual([
      { ...ROTULOS[0], de: "28", para: "29", diferenca: "1" },
      { ...ROTULOS[1], de: "0", para: "2.5", diferenca: "2.5" },
      { itemId: "i9", codigo: null, descricao: null, unidade: null, de: "0", para: "1", diferenca: "1" },
    ]);
  });

  it("ao contrário, a diferença fica negativa", () => {
    expect(compararRevisoes(CONGELADOS, "r1", "r0", ROTULOS)[0]).toMatchObject({ de: "29", para: "28", diferenca: "-1" });
  });
});

describe("rotulosDosItens", () => {
  it("itens do detalhe primeiro, extras que faltam depois, sem repetir", () => {
    const itens = [
      { itemId: "i1", codigo: "01.01", descricao: "CBUQ", unidade: "t", qtdMedida: "1", ajustes: null, qtdAprovada: null, glosa: null, valor: null },
    ];
    expect(
      rotulosDosItens(itens, [
        { itemId: "i1", codigo: "x", descricao: "x", unidade: null },
        { itemId: "i9", codigo: "09.01", descricao: "Saiu no aditivo", unidade: "m" },
      ]),
    ).toEqual([ROTULOS[0], { itemId: "i9", codigo: "09.01", descricao: "Saiu no aditivo", unidade: "m" }]);
  });
});
