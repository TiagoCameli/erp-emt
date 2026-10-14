import { describe, expect, it } from "vitest";

import { escondeAplicacao } from "@/modules/financeiro/lancamentos/schemas";

/**
 * A lista comum de Lançamentos esconde o que a aba Aplicações gera (rendimento,
 * rendimento negativo, ajuste de abertura): não é conta a pagar nem a receber.
 * Mas os drills que somam esses lançamentos precisam deles, senão a lista abre
 * com um número diferente da célula clicada.
 */
describe("escondeAplicacao", () => {
  it("LINHA DE CONTROLE: a lista sem filtro esconde", () => {
    expect(escondeAplicacao({})).toBe(true);
    // Lista vazia não é filtro: continua escondendo.
    expect(escondeAplicacao({ categoriaIds: [], naturezas: [] })).toBe(true);
  });

  it("a origem pedida por nome mostra", () => {
    expect(escondeAplicacao({ origem: "aplicacao" })).toBe(false);
  });

  it("o drill por categoria ou natureza (DRE) mostra", () => {
    expect(escondeAplicacao({ categoriaIds: ["c"] })).toBe(false);
    expect(escondeAplicacao({ naturezas: ["financeira"] })).toBe(false);
  });

  it("o recorte (fluxo, aging) e o extrato da conta mostram", () => {
    expect(escondeAplicacao({ recorte: { tipo: "fluxo" } })).toBe(false);
    expect(escondeAplicacao({ contaBancariaId: "x" })).toBe(false);
  });
});
