import { describe, expect, it } from "vitest";

import { mensagensDeErro } from "@/components/canonicos/submeter-com-aviso";

/**
 * A varredura da árvore de `formState.errors`.
 *
 * O que importa aqui é a ORDEM (a primeira mensagem é a que vai para o toast) e
 * não estourar em cima do `ref`, que é o nó do DOM e é cíclico.
 */
describe("mensagensDeErro", () => {
  it("acha mensagem em campo simples", () => {
    expect(
      mensagensDeErro({
        descricao: { type: "too_small", message: "Descreva a compra" },
      }),
    ).toEqual(["Descreva a compra"]);
  });

  it("desce em array com índice e em objeto aninhado", () => {
    const erros = {
      formas: {
        message: "A soma das formas precisa fechar com o total",
        "0": { valor: { message: "Informe um valor maior que zero" } },
      },
      centrosCusto: {
        "0": {
          insumos: { "1": { insumoId: { message: "Selecione o insumo" } } },
        },
      },
    };
    expect(mensagensDeErro(erros)).toEqual([
      "A soma das formas precisa fechar com o total",
      "Informe um valor maior que zero",
      "Selecione o insumo",
    ]);
  });

  it("lê o erro de raiz de field array (root), que é onde o resolver o coloca", () => {
    const erros = { parcelas: { root: { message: "Faltam R$ 100,00" } } };
    expect(mensagensDeErro(erros)).toEqual(["Faltam R$ 100,00"]);
  });

  it("não entra no ref, que é cíclico", () => {
    const elemento: Record<string, unknown> = { name: "campo" };
    elemento.self = elemento;
    expect(() =>
      mensagensDeErro({ nome: { message: "Informe o nome", ref: elemento } }),
    ).not.toThrow();
    expect(
      mensagensDeErro({ nome: { message: "Informe o nome", ref: elemento } }),
    ).toEqual(["Informe o nome"]);
  });

  it("ignora mensagem vazia e nó sem mensagem", () => {
    expect(
      mensagensDeErro({ a: { message: "" }, b: { type: "required" } }),
    ).toEqual([]);
  });

  it("devolve lista vazia para entrada que não é objeto", () => {
    expect(mensagensDeErro(undefined)).toEqual([]);
    expect(mensagensDeErro("erro")).toEqual([]);
  });
});
