import { describe, expect, it } from "vitest";

import { acaoDaTecla } from "@/components/canonicos/grade-edicao-teclado";

const tecla = (key: string, m: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
  key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...m,
});
const fora = { posicao: { linha: 1, coluna: 1 }, editando: false, nLinhas: 3, nColunas: 3 };
const dentro = { ...fora, editando: true };

describe("acaoDaTecla", () => {
  it("setas movem e param na borda", () => {
    expect(acaoDaTecla(tecla("ArrowDown"), fora)).toEqual({ tipo: "mover", para: { linha: 2, coluna: 1 } });
    expect(acaoDaTecla(tecla("ArrowUp"), { ...fora, posicao: { linha: 0, coluna: 1 } })).toEqual({ tipo: "mover", para: { linha: 0, coluna: 1 } });
  });
  it("Tab no fim da linha vai para o começo da próxima; Shift+Tab volta", () => {
    expect(acaoDaTecla(tecla("Tab"), { ...fora, posicao: { linha: 1, coluna: 2 } })).toEqual({ tipo: "mover", para: { linha: 2, coluna: 0 } });
    expect(acaoDaTecla(tecla("Tab", { shiftKey: true }), { ...fora, posicao: { linha: 1, coluna: 0 } })).toEqual({ tipo: "mover", para: { linha: 0, coluna: 2 } });
  });
  it("Enter: fora edita, dentro confirma e desce; Shift+Enter sobe", () => {
    expect(acaoDaTecla(tecla("Enter"), fora)).toEqual({ tipo: "editar", manterTexto: true });
    expect(acaoDaTecla(tecla("Enter"), dentro)).toEqual({ tipo: "confirmar", depois: { linha: 2, coluna: 1 } });
    expect(acaoDaTecla(tecla("Enter", { shiftKey: true }), dentro)).toEqual({ tipo: "confirmar", depois: { linha: 0, coluna: 1 } });
  });
  it("Tab dentro da edição confirma e anda", () => {
    expect(acaoDaTecla(tecla("Tab"), dentro)).toEqual({ tipo: "confirmar", depois: { linha: 1, coluna: 2 } });
  });
  it("caractere começa a editar substituindo; F2 mantém; Esc cancela; Delete limpa", () => {
    expect(acaoDaTecla(tecla("7"), fora)).toEqual({ tipo: "editar", manterTexto: false, textoInicial: "7" });
    expect(acaoDaTecla(tecla("F2"), fora)).toEqual({ tipo: "editar", manterTexto: true });
    expect(acaoDaTecla(tecla("Escape"), dentro)).toEqual({ tipo: "cancelar" });
    expect(acaoDaTecla(tecla("Delete"), fora)).toEqual({ tipo: "limpar" });
  });
  it("dentro da edição, setas e caracteres são do campo", () => {
    expect(acaoDaTecla(tecla("ArrowLeft"), dentro)).toEqual({ tipo: "nada" });
    expect(acaoDaTecla(tecla("a"), dentro)).toEqual({ tipo: "nada" });
  });
  it("atalhos de árvore", () => {
    expect(acaoDaTecla(tecla("ArrowRight", { altKey: true, shiftKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "recuar" });
    expect(acaoDaTecla(tecla("ArrowLeft", { altKey: true, shiftKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "avancar" });
    expect(acaoDaTecla(tecla("ArrowUp", { altKey: true, shiftKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "acima" });
    expect(acaoDaTecla(tecla("Enter", { ctrlKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "inserir" });
    expect(acaoDaTecla(tecla("Delete", { metaKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "excluir" });
  });
  it("Ctrl+C e Ctrl+V não são tratados aqui (eventos copy/paste)", () => {
    expect(acaoDaTecla(tecla("v", { ctrlKey: true }), fora)).toEqual({ tipo: "nada" });
  });
});
