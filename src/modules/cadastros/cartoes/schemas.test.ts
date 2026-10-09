import { describe, expect, it } from "vitest";

import {
  cartaoSchema,
  rotuloDoCartao,
} from "@/modules/cadastros/cartoes/schemas";

/** Um cartão válido, para variar um campo por vez. */
const VALIDO = {
  nome: "Cartão obra",
  ultimosDigitos: "4829",
  contaBancariaId: "9a3c1d7e-5b2f-4e8a-9c6d-1f2e3a4b5c6d",
  bandeira: "Visa",
  banco: "Banco do Brasil",
  diaFechamento: "25",
  diaVencimento: "5",
  ativo: true,
};

function parse(troca: Partial<typeof VALIDO>) {
  return cartaoSchema.safeParse({ ...VALIDO, ...troca });
}

function mensagens(resultado: ReturnType<typeof parse>): string[] {
  return resultado.success
    ? []
    : resultado.error.issues.map((problema) => problema.message);
}

describe("cartaoSchema", () => {
  it("aceita o cartão completo", () => {
    const r = parse({});
    expect(r.success).toBe(true);
  });

  it("recusa cartão sem conta bancária: a fatura é paga por uma conta", () => {
    expect(mensagens(parse({ contaBancariaId: "" }))).toContain(
      "Escolha a conta bancária do cartão",
    );
  });

  it("aceita sem bandeira, banco e dias: são conferência de fatura, não cadastro", () => {
    const r = parse({
      bandeira: "",
      banco: "",
      diaFechamento: "",
      diaVencimento: "",
    });
    expect(r.success).toBe(true);
  });

  describe("os quatro dígitos", () => {
    it("limpa o ruído do que foi colado", () => {
      const r = parse({ ultimosDigitos: "**** 4829" });
      expect(r.success && r.data.ultimosDigitos).toBe("4829");
    });

    it("aceita 'final 4829'", () => {
      const r = parse({ ultimosDigitos: "final 4829" });
      expect(r.success && r.data.ultimosDigitos).toBe("4829");
    });

    it("recusa três dígitos", () => {
      expect(mensagens(parse({ ultimosDigitos: "482" }))).toContain(
        "Informe os quatro últimos dígitos do cartão",
      );
    });

    it("recusa o cartão inteiro: mais de quatro dígitos não é 'os quatro últimos'", () => {
      // Guardar número de cartão inteiro num ERP de obra é o que esta trava
      // existe para impedir. 16 dígitos não viram "os 4 últimos" em silêncio.
      expect(
        mensagens(parse({ ultimosDigitos: "4111111111114829" })),
      ).toContain("Informe os quatro últimos dígitos do cartão");
    });

    it("recusa vazio", () => {
      expect(mensagens(parse({ ultimosDigitos: "" }))).toContain(
        "Informe os quatro últimos dígitos do cartão",
      );
    });

    it("CONTROLE: quatro dígitos com espaço em volta passam", () => {
      // Sem este caso, a trava acima passaria também numa versão que recusasse
      // tudo, e o teste não estaria provando nada.
      const r = parse({ ultimosDigitos: "  4829  " });
      expect(r.success && r.data.ultimosDigitos).toBe("4829");
    });
  });

  describe("os dias da fatura", () => {
    it("aceita vazio: nem todo mundo sabe de cor", () => {
      expect(parse({ diaFechamento: "", diaVencimento: "" }).success).toBe(
        true,
      );
    });

    it("aceita 1 e 31, as pontas", () => {
      expect(parse({ diaFechamento: "1", diaVencimento: "31" }).success).toBe(
        true,
      );
    });

    it("recusa 0 e 32", () => {
      expect(mensagens(parse({ diaFechamento: "0" }))).toContain(
        "Informe um dia entre 1 e 31",
      );
      expect(mensagens(parse({ diaVencimento: "32" }))).toContain(
        "Informe um dia entre 1 e 31",
      );
    });

    it("recusa texto", () => {
      expect(mensagens(parse({ diaFechamento: "dia 5" }))).toContain(
        "Informe um dia entre 1 e 31",
      );
    });
  });

  it("recusa nome curto demais para identificar o cartão", () => {
    expect(mensagens(parse({ nome: "C" }))).toContain(
      "O nome precisa ter pelo menos 2 caracteres",
    );
  });

  it("ativo nasce true quando a tela não manda", () => {
    const { ativo: _ativo, ...semAtivo } = VALIDO;
    const r = cartaoSchema.safeParse(semAtivo);
    expect(r.success && r.data.ativo).toBe(true);
  });
});

describe("rotuloDoCartao", () => {
  it("monta o rótulo que aparece no combo e no documento", () => {
    expect(
      rotuloDoCartao({ nome: "Cartão obra", ultimosDigitos: "7712" }),
    ).toBe("Cartão obra (7712)");
  });
});
