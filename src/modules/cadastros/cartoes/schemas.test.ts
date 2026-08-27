import { describe, expect, it } from "vitest";

import {
  cartaoDoTextoRapido,
  cartaoSchema,
  rotuloDoCartao,
} from "@/modules/cadastros/cartoes/schemas";

/** Um cartão válido, para variar um campo por vez. */
const VALIDO = {
  nome: "Cartão obra",
  ultimosDigitos: "4829",
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

/**
 * O cadastro rápido feito de dentro da OC: a pessoa digita no combo e o cartão
 * nasce do texto. O que se prova aqui é que ele nunca nasce sem identificar o
 * cartão, e que o final extraído é o certo.
 */
describe("cartaoDoTextoRapido", () => {
  it("tira o final do texto e usa o texto como nome", () => {
    expect(cartaoDoTextoRapido("Cartão obra 7712")).toEqual({
      nome: "Cartão obra 7712",
      ultimosDigitos: "7712",
    });
  });

  it("só os dígitos vira 'Cartão 4829'", () => {
    expect(cartaoDoTextoRapido("4829")).toEqual({
      nome: "Cartão 4829",
      ultimosDigitos: "4829",
    });
  });

  it("pega o ÚLTIMO grupo de dígitos, não o primeiro", () => {
    // "Cartão 2 final 4829" tem que dar 4829. Pegar o primeiro grupo daria um
    // cartão chamado "final 2", que não existe.
    expect(cartaoDoTextoRapido("Cartão 2 final 4829")?.ultimosDigitos).toBe(
      "4829",
    );
  });

  it("de um grupo longo pega os quatro últimos", () => {
    expect(cartaoDoTextoRapido("Cartão 4111111111114829")?.ultimosDigitos).toBe(
      "4829",
    );
  });

  it("recusa texto sem quatro dígitos", () => {
    expect(cartaoDoTextoRapido("Cartão obra")).toBeNull();
    expect(cartaoDoTextoRapido("Cartão 482")).toBeNull();
    expect(cartaoDoTextoRapido("")).toBeNull();
  });

  it("CONTROLE: dígitos separados não contam como um final", () => {
    // "48 29" não é um cartão terminado em 4829: são dois números soltos. Aceitar
    // isso criaria um cartão com final inventado a partir de ruído.
    expect(cartaoDoTextoRapido("Cartão 48 29")).toBeNull();
  });
});
