import { describe, expect, it } from "vitest";

import {
  COLUNA_DO_BANCO,
  DIRECAO_PADRAO,
  ORDEM_PADRAO,
  lerOrdenacao,
  ordenacaoParaUrl,
} from "@/modules/financeiro/lancamentos/ordenacao";

describe("lerOrdenacao", () => {
  it("aceita coluna conhecida e as duas direções", () => {
    expect(lerOrdenacao("valor", "asc")).toEqual({
      ordem: "valor",
      direcao: "asc",
    });
    expect(lerOrdenacao("dataVencimento", "desc")).toEqual({
      ordem: "dataVencimento",
      direcao: "desc",
    });
  });

  it("coluna desconhecida cai no padrão, não em erro", () => {
    // A URL é editável e é compartilhada por link. Ordem inventada não pode
    // derrubar a tela nem virar `order` cru no banco.
    expect(lerOrdenacao("fornecedorNome", "asc")).toEqual({
      ordem: ORDEM_PADRAO,
      direcao: DIRECAO_PADRAO,
    });
    expect(lerOrdenacao("id; drop table", "asc")).toEqual({
      ordem: ORDEM_PADRAO,
      direcao: DIRECAO_PADRAO,
    });
    expect(lerOrdenacao(undefined, undefined)).toEqual({
      ordem: ORDEM_PADRAO,
      direcao: DIRECAO_PADRAO,
    });
  });

  it("direção inválida com coluna válida cai em desc, sem perder a coluna", () => {
    expect(lerOrdenacao("valor", "crescente")).toEqual({
      ordem: "valor",
      direcao: "desc",
    });
  });
});

describe("COLUNA_DO_BANCO", () => {
  it("só tem coluna que existe na tabela lancamentos", () => {
    // Fornecedor e Categoria são join, e Revisão e os valores pago/aberto/vencido
    // são calculados no app: nenhum deles pode entrar aqui, senão o `.order()`
    // vira erro do PostgREST em runtime, com a tela em branco.
    expect(Object.values(COLUNA_DO_BANCO).sort()).toEqual([
      "data_compra",
      "data_vencimento",
      "descricao",
      "mes_competencia",
      "numero",
      "numero_documento",
      "status",
      "tipo",
      "valor",
    ]);
  });

  it("nenhuma coluna do banco é usada por duas ordens diferentes", () => {
    const doBanco = Object.values(COLUNA_DO_BANCO);
    expect(new Set(doBanco).size).toBe(doBanco.length);
  });

  it("a ordem padrão está no catálogo", () => {
    expect(COLUNA_DO_BANCO[ORDEM_PADRAO]).toBeDefined();
  });
});

describe("ordenacaoParaUrl", () => {
  it("o padrão não vai para a URL, para o link ficar limpo", () => {
    expect(ordenacaoParaUrl(ORDEM_PADRAO, DIRECAO_PADRAO)).toEqual({});
  });

  it("direção diferente do padrão vai, mesmo na coluna padrão", () => {
    expect(ordenacaoParaUrl(ORDEM_PADRAO, "asc")).toEqual({
      ordem: ORDEM_PADRAO,
      direcao: "asc",
    });
  });

  it("coluna diferente do padrão vai com a direção", () => {
    expect(ordenacaoParaUrl("valor", "desc")).toEqual({
      ordem: "valor",
      direcao: "desc",
    });
  });
});
