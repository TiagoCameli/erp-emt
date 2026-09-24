import { describe, expect, it } from "vitest";

import { abaAtiva, GRUPOS_ABAS, hrefComRecorte, hrefNovo } from "./navegacao";

const ROTAS = GRUPOS_ABAS.flatMap((g) => g.abas.map((a) => a.rota));

describe("abaAtiva", () => {
  it("acende a Visão Geral só na raiz do módulo", () => {
    expect(abaAtiva("/combustivel", ROTAS)).toBe("/combustivel");
    expect(abaAtiva("/combustivel/tanques", ROTAS)).toBe("/combustivel/tanques");
  });

  it("o detalhe acende a lista de onde veio", () => {
    expect(abaAtiva("/combustivel/abastecimentos/abc", ROTAS)).toBe("/combustivel/abastecimentos");
    expect(abaAtiva("/combustivel/tanques/xyz", ROTAS)).toBe("/combustivel/tanques");
  });

  it("rota fora das abas não acende nenhuma (nem a Visão Geral)", () => {
    expect(abaAtiva("/combustivel/esvaziamentos", ROTAS)).toBeNull();
  });

  it("prefixo de texto não é prefixo de rota", () => {
    expect(abaAtiva("/combustivel/tanquesx", ROTAS)).toBeNull();
  });
});

describe("hrefComRecorte", () => {
  it("leva o recorte e larga o que é só da lista", () => {
    const atual = new URLSearchParams("modo=carretas&de=2026-09-01&ate=2026-09-23&busca=rolo&pagina=3");
    expect(hrefComRecorte("/combustivel/tanques", atual)).toBe(
      "/combustivel/tanques?modo=carretas&de=2026-09-01&ate=2026-09-23",
    );
  });

  it("mantém os valores repetidos de um filtro múltiplo", () => {
    const atual = new URLSearchParams("obra=a&obra=b&combustivel=s10");
    expect(hrefComRecorte("/combustivel", atual)).toBe("/combustivel?obra=a&obra=b&combustivel=s10");
  });

  it("sem recorte, a rota limpa", () => {
    expect(hrefComRecorte("/combustivel/entradas", new URLSearchParams("pagina=2"))).toBe("/combustivel/entradas");
  });
});

describe("hrefNovo", () => {
  it("acrescenta novo=1 com e sem recorte", () => {
    expect(hrefNovo("/combustivel/entradas", new URLSearchParams())).toBe("/combustivel/entradas?novo=1");
    expect(hrefNovo("/combustivel/abastecimentos", new URLSearchParams("modo=carretas"))).toBe(
      "/combustivel/abastecimentos?modo=carretas&novo=1",
    );
  });
});
