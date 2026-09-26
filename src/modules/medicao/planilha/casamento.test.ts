import { describe, expect, it } from "vitest";

import { casarComVersaoAnterior, chaveDoItem, type LinhaAnterior } from "./casamento";
import type { LinhaImportada } from "./montagem";

const nova = (ordem: number, codigo: string, descricao: string, preco: string | null, qtd: string | null, tipo?: "titulo" | "servico"): LinhaImportada => {
  const t = tipo ?? (preco ? "servico" : "titulo");
  return {
    ordem, linhaOrigem: ordem, codigo, paiOrdem: null, descricao, unidade: preco ? "un" : null,
    tipo: t, precoUnitario: preco, quantidadePrevista: qtd, valorPlanilha: null,
  };
};
const antiga = (itemId: string, codigo: string, descricao: string, preco: string | null, qtd: string | null): LinhaAnterior => ({
  itemId, codigo, descricao, unidade: preco ? "un" : null, tipo: preco ? "servico" : "titulo", precoUnitario: preco, quantidadePrevista: qtd,
});

describe("casarComVersaoAnterior", () => {
  const anteriores = [
    antiga("i1", "01", "Grupo", null, null),
    antiga("i2", "01.01", "Roçada manual", "0.335", "10"),
    antiga("i3", "01.02", "Capina", "2", "5"),
    antiga("i4", "01.03", "Sai no aditivo", "1", "1"),
  ];

  it("casa por código, descrição e unidade, e classifica a mudança", () => {
    const r = casarComVersaoAnterior([
      nova(1, "01", "Grupo", null, null),
      nova(2, "01.01", "Roçada  MANUAL", "0.4", "12"),
      nova(3, "01.02", "Capina", "2", "5"),
      nova(4, "01.04", "Serviço novo", "3", "1"),
    ], anteriores);
    expect(r.linhas.map((c) => [c.ordem, c.itemId, c.situacao])).toEqual([
      [1, "i1", "igual"], [2, "i2", "mudou_quantidade_e_preco"], [3, "i3", "igual"], [4, null, "novo"],
    ]);
    expect(r.sairam.map((s) => s.itemId)).toEqual(["i4"]);
  });

  it("chave repetida na versão anterior fica ambígua até o usuário escolher", () => {
    const dup = [antiga("a", "02.02", "CAP", "30", "1"), antiga("b", "02.02", "CAP", "30", "1")];
    const r = casarComVersaoAnterior([nova(1, "02.02", "CAP", "30", "1")], dup);
    expect(r.linhas[0]).toEqual({ ordem: 1, itemId: null, situacao: "ambiguo", candidatos: ["a", "b"] });
    const escolhido = casarComVersaoAnterior([nova(1, "02.02", "CAP", "30", "1")], dup, { 1: "b" });
    expect(escolhido.linhas[0]).toMatchObject({ itemId: "b", situacao: "igual" });
    expect(escolhido.sairam.map((s) => s.itemId)).toEqual(["a"]);
  });

  it("um item anterior não casa com duas linhas novas", () => {
    const r = casarComVersaoAnterior([nova(1, "01.02", "Capina", "2", "5"), nova(2, "01.02", "Capina", "2", "6")], anteriores);
    expect(r.linhas.map((c) => c.itemId)).toEqual(["i3", null]);
    expect(r.linhas[1].situacao).toBe("novo");
  });

  it("a escolha do usuário pode marcar como novo o que casaria sozinho", () => {
    const r = casarComVersaoAnterior([nova(1, "01.02", "Capina", "2", "5")], anteriores, { 1: null });
    expect(r.linhas[0]).toMatchObject({ itemId: null, situacao: "novo" });
  });

  it("a chave ignora caixa e espaço repetido", () => {
    expect(chaveDoItem("01.01", " Roçada   Manual ", "un")).toBe(chaveDoItem("01.01", "roçada manual", "un"));
  });

  it("duas linhas com escolha apontando para o mesmo itemId ficam ambíguas", () => {
    const r = casarComVersaoAnterior(
      [nova(1, "01.02", "Capina", "2", "5"), nova(2, "01.02", "Capina", "3", "6")],
      anteriores,
      { 1: "i3", 2: "i3" }
    );
    expect(r.linhas[0]).toEqual({ ordem: 1, itemId: null, situacao: "ambiguo", candidatos: ["i3"] });
    expect(r.linhas[1]).toEqual({ ordem: 2, itemId: null, situacao: "ambiguo", candidatos: ["i3"] });
    expect(r.sairam.map((s) => s.itemId)).toEqual(["i1", "i2", "i4"]);
  });

  it("escolha com ordem que não existe em novas é ignorada (stale)", () => {
    const r = casarComVersaoAnterior([nova(1, "01.02", "Capina", "2", "5")], anteriores, { 999: "i2" });
    expect(r.linhas[0]).toMatchObject({ itemId: "i3", situacao: "igual" });
    expect(r.sairam.map((s) => s.itemId)).toEqual(["i1", "i2", "i4"]);
  });

  it("mudança de tipo (serviço -> título) é detectada", () => {
    const r = casarComVersaoAnterior(
      [nova(1, "01.02", "Capina", "2", "5", "titulo")],
      anteriores
    );
    expect(r.linhas[0]).toMatchObject({ itemId: "i3", situacao: "mudou_tipo" });
  });

  it("mudança de tipo tem precedência sobre quantidade e preço", () => {
    const r = casarComVersaoAnterior(
      [nova(1, "01.02", "Capina", "3", "10", "titulo")],
      anteriores
    );
    expect(r.linhas[0]).toMatchObject({ itemId: "i3", situacao: "mudou_tipo" });
  });

  it("escolha apontando para itemId inexistente fica ambígua com key candidatos", () => {
    const r = casarComVersaoAnterior(
      [nova(1, "01.02", "Capina", "2", "5")],
      anteriores,
      { 1: "item_inexistente" }
    );
    expect(r.linhas[0]).toEqual({ ordem: 1, itemId: null, situacao: "ambiguo", candidatos: ["i3"] });
  });

  it("escolha apontando para itemId inexistente sem key candidatos fica ambígua com array vazio", () => {
    const r = casarComVersaoAnterior(
      [nova(1, "99.99", "Inexistente", "1", "1")],
      anteriores,
      { 1: "inexistente_id" }
    );
    expect(r.linhas[0]).toEqual({ ordem: 1, itemId: null, situacao: "ambiguo", candidatos: [] });
  });

  it("decimal igual em diferentes formatos (10 vs 10.0)", () => {
    const r = casarComVersaoAnterior(
      [nova(1, "01.01", "Roçada manual", "10", "10")],
      [antiga("i1", "01.01", "Roçada manual", "10.0", "10.00")]
    );
    expect(r.linhas[0]).toMatchObject({ itemId: "i1", situacao: "igual" });
  });

  it("probe: linha sem escolha não rouba item da linha com escolha explícita", () => {
    const r = casarComVersaoAnterior(
      [
        nova(1, "01.02", "Capina", "2", "5"),
        nova(2, "01.02", "Capina", "2", "5"),
      ],
      [antiga("i3", "01.02", "Capina", "2", "5")],
      { 2: "i3" }
    );
    expect(r.linhas[0].itemId).not.toBe("i3");
    expect(r.linhas[0].situacao).toBe("novo");
    expect(r.linhas[1]).toMatchObject({ itemId: "i3", situacao: "igual" });
    const itemIds = r.linhas.map((c) => c.itemId).filter((id): id is string => id !== null);
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  it("sem duplicados de itemId em cenário misto (auto + escolha + ambíguo)", () => {
    const r = casarComVersaoAnterior(
      [
        nova(1, "01.01", "Roçada manual", "0.335", "10"),
        nova(2, "01.02", "Capina", "2", "5"),
        nova(3, "01.02", "Capina", "2", "6"),
        nova(4, "01.03", "Novo", "1", "1"),
      ],
      anteriores,
      { 2: "i3", 3: "i3" }
    );
    const itemIds = r.linhas.map((c) => c.itemId).filter((id): id is string => id !== null);
    expect(new Set(itemIds).size).toBe(itemIds.length);
    expect(itemIds).toContain("i2");
    expect(itemIds).not.toContain("i3");
  });
});
