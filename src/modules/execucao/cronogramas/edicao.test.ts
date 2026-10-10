import { describe, expect, it } from "vitest";

import { camposDaCelula, linhasNovasDoBloco, montarLote, mudancasParaLote, type AtividadeGrade, type ContextoEdicao } from "@/modules/execucao/cronogramas/edicao";

const ctx: ContextoEdicao = {
  servicos: [{ id: "s1", codigo: "EST-01" }],
  unidades: [{ id: "u1", sigla: "m" }, { id: "u2", sigla: "m³" }],
  locais: [{ id: "l1", codigo: "A" }, { id: "l2", codigo: "B" }],
  codigoDaLinha: (n) => ({ 1: "1", 2: "1.1" })[n],
};
const a = (p: Partial<AtividadeGrade>): AtividadeGrade => ({
  id: "x", codigo: "1.1", nome: "Estacas", tipo: "atividade", paiId: "r", paiCodigo: "1", ordem: 1, servicoId: null, servicoCodigo: null,
  quantidade: null, unidadeId: null, unidadeSigla: null, produtividade: null, modoDuracao: "digitada", duracaoDias: 1,
  inicioCedo: null, fimCedo: null, folgaTotal: null, critica: null, predecessoras: [], locais: [], observacao: null, versao: "v1", ...p,
});

describe("camposDaCelula", () => {
  it.each([
    ["nome", " Estacas raiz ", { nome: "Estacas raiz" }],
    ["tipo", "Marco", { tipo: "marco" }],
    ["servico", "est-01", { servico_id: "s1" }],
    ["servico", "", { servico_id: null }],
    ["unidade", "M³", { unidade_id: "u2" }],
    ["quantidade", "1.234,5", { quantidade: "1234.5" }],
    ["modo", "Produtividade", { modo_duracao: "por_produtividade" }],
    ["duracao", "5", { duracao_dias: 5, modo_duracao: "digitada" }],
    ["predecessoras", "#2TI+2", { predecessoras: [{ codigo: "1.1", tipo: "TI", atraso: 2 }] }],
    ["locais", "A; b", { locais: ["l1", "l2"] }],
  ])("%s = %j", (coluna, texto, campos) => {
    expect(camposDaCelula(coluna, texto, ctx)).toEqual({ ok: true, campos });
  });

  it.each([
    ["codigo", " ", "Informe o código"],
    ["tipo", "Fase", "Tipo deve ser Resumo, Atividade ou Marco"],
    ["servico", "XYZ", "Serviço XYZ não está na biblioteca"],
    ["duracao", "2,5", "Duração em dias inteiros"],
    ["locais", "Z", "Local Z não existe nesta obra"],
  ])("%s = %j recusa", (coluna, texto, erro) => {
    expect(camposDaCelula(coluna, texto, ctx)).toEqual({ ok: false, erro });
  });
});

describe("montarLote", () => {
  it("junta as mudanças da mesma linha numa linha do lote, com id e versão", () => {
    const porId = new Map([["x", a({})]]);
    expect(montarLote([
      { idLinha: "x", idColuna: "nome", texto: "Estacas raiz" },
      { idLinha: "x", idColuna: "duracao", texto: "4" },
    ], porId, ctx)).toEqual({ ok: true, linhas: [{ id: "x", versao: "v1", nome: "Estacas raiz", duracao_dias: 4, modo_duracao: "digitada" }] });
  });

  it("o primeiro erro diz a linha", () => {
    const porId = new Map([["x", a({})]]);
    expect(montarLote([{ idLinha: "x", idColuna: "tipo", texto: "Fase" }], porId, ctx))
      .toEqual({ ok: false, erro: "Linha 1.1: Tipo deve ser Resumo, Atividade ou Marco" });
  });
});

describe("linhasNovasDoBloco", () => {
  it("bloco colado abaixo da última linha vira linhas novas na raiz, com código gerado quando não vem", () => {
    const existentes = [a({ id: "r", codigo: "1", paiId: null, paiCodigo: null, tipo: "resumo", ordem: 1 })];
    // A partir de "nome", a 8ª posição do bloco (índice 7) cai em "duracao" (COLUNAS_EDITAVEIS[1 + 7]).
    expect(linhasNovasDoBloco([["Limpeza", "", "", "", "", "", "", "2"]], "nome", existentes, ctx)).toEqual({
      ok: true,
      linhas: [{ codigo: "2", pai_codigo: "", ordem: 2, nome: "Limpeza", duracao_dias: 2, modo_duracao: "digitada" }],
    });
  });

  it("se o bloco começa na coluna código, usa o código colado", () => {
    expect(linhasNovasDoBloco([["9", "Pintura"]], "codigo", [], ctx)).toEqual({
      ok: true,
      linhas: [{ codigo: "9", pai_codigo: "", ordem: 1, nome: "Pintura" }],
    });
  });
});

describe("mudancasParaLote", () => {
  it("leva id e versão de cada linha mexida", () => {
    const porId = new Map([["x", a({})], ["y", a({ id: "y", versao: "v9" })]]);
    expect(mudancasParaLote([{ id: "x", pai_codigo: "2", ordem: 1 }, { id: "y", tipo: "resumo" }], porId)).toEqual([
      { id: "x", versao: "v1", pai_codigo: "2", ordem: 1 },
      { id: "y", versao: "v9", tipo: "resumo" },
    ]);
  });
});
