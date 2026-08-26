import { describe, expect, it } from "vitest";

import {
  ESCOPO_TUDO,
  incluiAnteriores,
  lerEscopoDaUrl,
} from "@/modules/financeiro/contas-bancarias/extrato-escopo";

/**
 * A página LÊ este parâmetro e o seletor da tabela ESCREVE nele. Os dois usando a
 * mesma função é o que evita o defeito calado: seletor grava um valor que a
 * página não reconhece, a tela volta ao padrão e nada avisa.
 */
describe("escopo do extrato na URL", () => {
  it("ausente é o padrão: só o movimento que forma o saldo", () => {
    expect(lerEscopoDaUrl(undefined)).toBe("saldo");
    expect(incluiAnteriores(lerEscopoDaUrl(undefined))).toBe(false);
  });

  it("'tudo' pede o histórico inteiro", () => {
    expect(lerEscopoDaUrl(ESCOPO_TUDO)).toBe(ESCOPO_TUDO);
    expect(incluiAnteriores(lerEscopoDaUrl(ESCOPO_TUDO))).toBe(true);
  });

  it("valor desconhecido cai no padrão, não em tela vazia", () => {
    // URL colada à mão, link antigo, typo. Escopo inválido não pode virar
    // extrato de zero linha: cai no padrão, que é o que a pessoa esperava ver.
    expect(lerEscopoDaUrl("historico")).toBe("saldo");
    expect(lerEscopoDaUrl("")).toBe("saldo");
    expect(lerEscopoDaUrl("TUDO")).toBe("saldo");
  });

  it("chave repetida na URL usa o primeiro valor", () => {
    // `?escopo=tudo&escopo=saldo` é o que um formulário mandaria. Next entrega
    // array, e ignorar isso faria a leitura comparar contra "tudo,saldo".
    expect(lerEscopoDaUrl([ESCOPO_TUDO, "saldo"])).toBe(ESCOPO_TUDO);
    expect(lerEscopoDaUrl(["saldo", ESCOPO_TUDO])).toBe("saldo");
  });

  it("array vazio cai no padrão", () => {
    expect(lerEscopoDaUrl([])).toBe("saldo");
  });
});
