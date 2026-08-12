import { describe, expect, it } from "vitest";

import {
  lerOrdenacao,
  ordemValida,
  ordenacaoParaUrl,
  proximaOrdenacao,
} from "@/modules/financeiro/lancamentos/ordenacao";

describe("proximaOrdenacao", () => {
  it("primeiro clique numa coluna: crescente", () => {
    expect(proximaOrdenacao(null, "valor")).toEqual({
      coluna: "valor",
      descendente: false,
    });
  });

  it("segundo clique na mesma coluna: decrescente", () => {
    expect(
      proximaOrdenacao({ coluna: "valor", descendente: false }, "valor"),
    ).toEqual({ coluna: "valor", descendente: true });
  });

  it("terceiro clique na mesma coluna: volta ao padrão", () => {
    expect(
      proximaOrdenacao({ coluna: "valor", descendente: true }, "valor"),
    ).toBeNull();
  });

  it("clicar em outra coluna começa o ciclo dela, crescente", () => {
    // Não herda o "decrescente" da coluna anterior: quem clica numa coluna nova
    // espera começar do começo.
    expect(
      proximaOrdenacao({ coluna: "valor", descendente: true }, "numero"),
    ).toEqual({ coluna: "numero", descendente: false });
  });

  it("o ciclo inteiro fecha em três cliques", () => {
    let estado = proximaOrdenacao(null, "dataVencimento");
    expect(estado).toEqual({ coluna: "dataVencimento", descendente: false });
    estado = proximaOrdenacao(estado, "dataVencimento");
    expect(estado).toEqual({ coluna: "dataVencimento", descendente: true });
    estado = proximaOrdenacao(estado, "dataVencimento");
    expect(estado).toBeNull();
  });
});

describe("lerOrdenacao", () => {
  it("lê coluna e sentido da URL", () => {
    expect(lerOrdenacao("valor", "desc")).toEqual({
      coluna: "valor",
      descendente: true,
    });
    expect(lerOrdenacao("valor", undefined)).toEqual({
      coluna: "valor",
      descendente: false,
    });
  });

  it("ignora coluna que a listagem não sabe ordenar", () => {
    // URL editada à mão, ou link antigo de uma coluna que saiu: volta ao padrão
    // em vez de estourar na cara de quem só queria abrir a tela.
    expect(lerOrdenacao("fornecedorNome", "asc")).toBeNull();
    expect(lerOrdenacao("valor; drop table lancamentos", "asc")).toBeNull();
    expect(lerOrdenacao(undefined, "desc")).toBeNull();
    expect(lerOrdenacao(["valor"], "desc")).toBeNull();
  });

  it("sentido que não é desc é tratado como crescente", () => {
    expect(lerOrdenacao("valor", "qualquer-coisa")?.descendente).toBe(false);
  });
});

describe("ordenacaoParaUrl", () => {
  it("crescente grava só a coluna, sem sujar a URL com o padrão", () => {
    expect(ordenacaoParaUrl({ coluna: "valor", descendente: false })).toEqual({
      ordem: "valor",
      dir: null,
      pagina: null,
    });
  });

  it("decrescente grava o sentido", () => {
    expect(ordenacaoParaUrl({ coluna: "valor", descendente: true })).toEqual({
      ordem: "valor",
      dir: "desc",
      pagina: null,
    });
  });

  it("voltar ao padrão apaga os dois parâmetros", () => {
    expect(ordenacaoParaUrl(null)).toEqual({
      ordem: null,
      dir: null,
      pagina: null,
    });
  });

  it("qualquer mudança de ordem volta para a primeira página", () => {
    // Ordenar muda quem está na página 1; ficar na página 7 da ordem anterior
    // seria cair num lugar que ninguém pediu.
    for (const caso of [
      null,
      { coluna: "valor" as const, descendente: false },
      { coluna: "valor" as const, descendente: true },
    ]) {
      expect(ordenacaoParaUrl(caso).pagina).toBeNull();
    }
  });
});

describe("ordemValida", () => {
  it("aceita as colunas ordenáveis", () => {
    expect(ordemValida("status")).toBe("status");
    expect(ordemValida("revisao")).toBe("revisao");
  });

  it("recusa o resto", () => {
    expect(ordemValida("origem")).toBeNull();
    expect(ordemValida(42)).toBeNull();
    expect(ordemValida(null)).toBeNull();
  });
});
