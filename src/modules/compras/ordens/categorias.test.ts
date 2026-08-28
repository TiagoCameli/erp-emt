import { describe, expect, it } from "vitest";

import {
  categoriasDaOrdem,
  rotuloCategorias,
  rotuloCategoriasDaOrdem,
} from "@/modules/compras/ordens/categorias";

const MATERIAL = "11111111-1111-4111-8111-111111111111";
const PECAS = "22222222-2222-4222-8222-222222222222";

function item(
  categoriaCustoId: string | null,
  subtotal: number,
  nome = "-",
) {
  return {
    categoriaCustoId,
    categoriaCustoNome: categoriaCustoId ? nome : null,
    subtotal,
  };
}

describe("categoriasDaOrdem", () => {
  it("ordem com uma categoria devolve uma linha com o total dela", () => {
    const r = categoriasDaOrdem([
      item(MATERIAL, 600, "Materiais"),
      item(MATERIAL, 400, "Materiais"),
    ]);

    expect(r).toEqual([{ id: MATERIAL, nome: "Materiais", valor: 1000 }]);
  });

  /**
   * O caso que motivou o bloco: uma compra que junta material de obra e peça de
   * equipamento. Antes disto a ordem registrava UMA categoria, escolhida à mão, e
   * a aprovação a trocava pela de maior valor -- os R$ 400 de peça entravam no
   * DRE como material.
   */
  it("ordem com categorias diferentes devolve as duas, da maior para a menor", () => {
    const r = categoriasDaOrdem([
      item(PECAS, 400, "Peças e manutenção"),
      item(MATERIAL, 600, "Materiais"),
    ]);

    expect(r.map((c) => [c.nome, c.valor])).toEqual([
      ["Materiais", 600],
      ["Peças e manutenção", 400],
    ]);
  });

  /**
   * Item sem categoria não é uma categoria: ele é o item que TRAVA a aprovação, e
   * quem cobra é o aviso de "sem categoria de custo". Contá-lo aqui faria uma
   * ordem incompleta parecer uma ordem com duas categorias, e o rótulo diria "2
   * categorias" para uma compra que ainda não classifica nada.
   */
  it("item sem categoria fica fora da lista", () => {
    const r = categoriasDaOrdem([
      item(MATERIAL, 600, "Materiais"),
      item(null, 400),
    ]);

    expect(r).toEqual([{ id: MATERIAL, nome: "Materiais", valor: 600 }]);
  });

  it("ordem sem item classificado devolve lista vazia", () => {
    expect(categoriasDaOrdem([item(null, 100)])).toEqual([]);
  });

  /**
   * Valor igual não pode deixar a ordem das duas ao sabor de qual item chegou
   * primeiro: a tela mostra "Materiais, Peças" num carregamento e "Peças,
   * Materiais" no outro, e quem confere acha que algo mudou.
   */
  it("desempata pelo nome quando o valor é igual", () => {
    const comPecasPrimeiro = categoriasDaOrdem([
      item(PECAS, 500, "Peças e manutenção"),
      item(MATERIAL, 500, "Materiais"),
    ]);
    const comMaterialPrimeiro = categoriasDaOrdem([
      item(MATERIAL, 500, "Materiais"),
      item(PECAS, 500, "Peças e manutenção"),
    ]);

    expect(comPecasPrimeiro).toEqual(comMaterialPrimeiro);
    expect(comPecasPrimeiro[0]!.nome).toBe("Materiais");
  });
});

describe("rótulo das categorias", () => {
  it("uma categoria: o nome dela", () => {
    expect(rotuloCategorias([{ id: MATERIAL, nome: "Materiais", valor: 10 }])).toBe(
      "Materiais",
    );
  });

  it("duas ou mais: a contagem, nunca o nome de uma delas", () => {
    const rotulo = rotuloCategorias([
      { id: MATERIAL, nome: "Materiais", valor: 600 },
      { id: PECAS, nome: "Peças e manutenção", valor: 400 },
    ]);

    expect(rotulo).toBe("2 categorias");
    expect(rotulo).not.toContain("Materiais");
  });

  it("nenhuma: nulo, para a tela desenhar o vazio dela", () => {
    expect(rotuloCategorias([])).toBeNull();
  });

  it("o rótulo do campo acompanha o plural", () => {
    expect(rotuloCategoriasDaOrdem([])).toBe("Categoria do custo");
    expect(
      rotuloCategoriasDaOrdem([{ id: MATERIAL, nome: "Materiais", valor: 1 }]),
    ).toBe("Categoria do custo");
    expect(
      rotuloCategoriasDaOrdem([
        { id: MATERIAL, nome: "Materiais", valor: 1 },
        { id: PECAS, nome: "Peças", valor: 1 },
      ]),
    ).toBe("Categorias do custo");
  });
});
