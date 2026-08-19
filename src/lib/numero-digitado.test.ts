import { describe, expect, it } from "vitest";

import { paraNumero } from "@/modules/compras/ordens/calculo";
import {
  formatarNumeroDigitado,
  normalizarNumeroDigitado,
  paraVirgulaDecimal,
} from "./numero-digitado";

describe("normalizarNumeroDigitado", () => {
  it("mantém o formato canônico intacto", () => {
    expect(normalizarNumeroDigitado("1234,56", 2)).toBe("1234,56");
    expect(normalizarNumeroDigitado("0,05", 2)).toBe("0,05");
    expect(normalizarNumeroDigitado("12", 2)).toBe("12");
  });

  it("tira o separador de milhar", () => {
    expect(normalizarNumeroDigitado("1.234,56", 2)).toBe("1234,56");
    expect(normalizarNumeroDigitado("1.234.567,89", 2)).toBe("1234567,89");
    expect(normalizarNumeroDigitado("1.234", 2)).toBe("1234");
  });

  it("trata ponto como decimal quando tem 1 ou 2 dígitos depois", () => {
    expect(normalizarNumeroDigitado("1234.56", 2)).toBe("1234,56");
    expect(normalizarNumeroDigitado("1234.5", 2)).toBe("1234,5");
    expect(normalizarNumeroDigitado("0.99", 2)).toBe("0,99");
  });

  it("completa a parte inteira quando começa na vírgula", () => {
    expect(normalizarNumeroDigitado(",5", 2)).toBe("0,5");
    // Vírgula sozinha não é número: fica como está e a validação reclama.
    expect(normalizarNumeroDigitado(",", 2)).toBeNull();
  });

  it("ignora espaços", () => {
    expect(normalizarNumeroDigitado("  1 234,56 ", 2)).toBe("1234,56");
  });

  it("recusa o que não é número", () => {
    expect(normalizarNumeroDigitado("", 2)).toBeNull();
    expect(normalizarNumeroDigitado("abc", 2)).toBeNull();
    expect(normalizarNumeroDigitado("12,3,4", 2)).toBeNull();
    expect(normalizarNumeroDigitado("R$ 10", 2)).toBeNull();
    expect(normalizarNumeroDigitado("-5", 2)).toBeNull();
  });

  it("recusa mais casas decimais do que a coluna aceita", () => {
    expect(normalizarNumeroDigitado("1,2345", 3)).toBeNull();
    expect(normalizarNumeroDigitado("1,23456", 3)).toBeNull();
  });

  it("em dinheiro, grupo de 3 digitos e milhar, nao decimal", () => {
    // Real nao tem tres centavos: "1,500" so pode ser mil e quinhentos. Passou a
    // importar porque a digitacao troca ponto por virgula, e quem digita "1.500"
    // agora ve "1,500" -- o caminho do ponto ja resolvia assim.
    expect(normalizarNumeroDigitado("1,500", 2)).toBe("1500");
    expect(normalizarNumeroDigitado("1.500", 2)).toBe("1500");
    expect(normalizarNumeroDigitado("12,345", 2)).toBe("12345");
    expect(normalizarNumeroDigitado("1234,567", 2)).toBe("1234567");
  });

  it("em quantidade, 3 digitos continua sendo decimal", () => {
    expect(normalizarNumeroDigitado("1,234", 3)).toBe("1,234");
    expect(normalizarNumeroDigitado("0,125", 3)).toBe("0,125");
  });

  it("parte inteira comecando em zero nao e milhar, e valor invalido", () => {
    // "0,500" em dinheiro nao e 0500: e valor que a pessoa tem que corrigir.
    expect(normalizarNumeroDigitado("0,500", 2)).toBeNull();
    expect(normalizarNumeroDigitado("0,50", 2)).toBe("0,50");
  });

  it("é idempotente", () => {
    const uma = normalizarNumeroDigitado("1.234,56", 2);
    expect(uma).not.toBeNull();
    expect(normalizarNumeroDigitado(uma!, 2)).toBe(uma);
  });
});

describe("formatarNumeroDigitado", () => {
  it("formata dinheiro com 2 casas fixas", () => {
    expect(formatarNumeroDigitado("1234,5", 2, 2)).toBe("1.234,50");
    expect(formatarNumeroDigitado("1234", 2, 2)).toBe("1.234,00");
    expect(formatarNumeroDigitado("1234.56", 2, 2)).toBe("1.234,56");
    expect(formatarNumeroDigitado("1234567,89", 2, 2)).toBe("1.234.567,89");
  });

  it("formata quantidade só com o que foi digitado", () => {
    expect(formatarNumeroDigitado("1234,5", 3)).toBe("1.234,5");
    expect(formatarNumeroDigitado("1234", 3)).toBe("1.234");
    expect(formatarNumeroDigitado("0,125", 3)).toBe("0,125");
  });

  it("devolve o texto cru quando não dá para interpretar", () => {
    expect(formatarNumeroDigitado("abc", 2, 2)).toBe("abc");
    expect(formatarNumeroDigitado("", 2, 2)).toBe("");
  });
});

describe("integração com a conversão do envio (paraNumero)", () => {
  it("o valor normalizado converte no número que o usuário viu", () => {
    const casos: [string, number][] = [
      ["1234.56", 1234.56],
      ["1.234,56", 1234.56],
      ["1234,56", 1234.56],
      ["1.234", 1234],
      [",5", 0.5],
    ];

    for (const [digitado, esperado] of casos) {
      const normalizado = normalizarNumeroDigitado(digitado, 2);
      expect(normalizado).not.toBeNull();
      expect(paraNumero(normalizado!)).toBe(esperado);
    }
  });

  it("sem normalizar, ponto decimal virava valor 100x maior", () => {
    // Comportamento de hoje, documentado: é o bug que a normalização remove.
    expect(paraNumero("1234.56")).toBe(123456);
    expect(paraNumero(normalizarNumeroDigitado("1234.56", 2)!)).toBe(1234.56);
  });
});

describe("paraVirgulaDecimal (troca na tecla)", () => {
  it("ponto do teclado numerico vira virgula", () => {
    expect(paraVirgulaDecimal("2194.56")).toBe("2194,56");
    expect(paraVirgulaDecimal("0.99")).toBe("0,99");
  });

  it("virgula continua virgula", () => {
    expect(paraVirgulaDecimal("2194,56")).toBe("2194,56");
  });

  it("o ultimo separador vence: milhar digitado sai certo", () => {
    expect(paraVirgulaDecimal("1.234,56")).toBe("1234,56");
    expect(paraVirgulaDecimal("1.234.567,89")).toBe("1234567,89");
    expect(paraVirgulaDecimal("1,234.56")).toBe("1234,56");
  });

  it("acompanha a digitacao tecla por tecla", () => {
    // O que a pessoa ve enquanto digita "1.234.567,89" no teclado numerico.
    const passos = ["1", "1.", "1.2", "1.23", "1.234", "1.234.", "1.234.5"];
    const vistos = passos.map(paraVirgulaDecimal);
    expect(vistos).toEqual(["1", "1,", "1,2", "1,23", "1,234", "1234,", "1234,5"]);
  });

  it("separador sozinho ou no fim nao atrapalha", () => {
    expect(paraVirgulaDecimal(".")).toBe(",");
    expect(paraVirgulaDecimal("12.")).toBe("12,");
    expect(paraVirgulaDecimal(".5")).toBe(",5");
    expect(paraVirgulaDecimal("")).toBe("");
  });

  it("nao valida nem limpa: texto passa igual para a pessoa poder corrigir", () => {
    expect(paraVirgulaDecimal("abc")).toBe("abc");
    expect(paraVirgulaDecimal("R$ 10")).toBe("R$ 10");
    expect(paraVirgulaDecimal("-5.5")).toBe("-5,5");
  });

  it("e idempotente", () => {
    const uma = paraVirgulaDecimal("1.234.567,89");
    expect(paraVirgulaDecimal(uma)).toBe(uma);
  });
});

describe("a corrente inteira: tecla -> saida do campo -> envio", () => {
  const digitar = (texto: string) => paraVirgulaDecimal(texto);

  it("dinheiro: o que a pessoa digita e o que o banco recebe", () => {
    const casos: [string, number][] = [
      ["2194.56", 2194.56],
      ["2194,56", 2194.56],
      ["1.234,56", 1234.56],
      ["1.234.567,89", 1234567.89],
      ["1.500", 1500],
      ["1500", 1500],
      [".5", 0.5],
    ];

    for (const [digitado, esperado] of casos) {
      const naTela = digitar(digitado);
      const aoSair = normalizarNumeroDigitado(naTela, 2);
      expect(aoSair, `digitado ${digitado} -> tela ${naTela}`).not.toBeNull();
      expect(paraNumero(aoSair!), `digitado ${digitado}`).toBe(esperado);
    }
  });

  it("quantidade com 3 casas atravessa a corrente", () => {
    const naTela = digitar("6.282");
    expect(naTela).toBe("6,282");
    expect(paraNumero(normalizarNumeroDigitado(naTela, 3)!)).toBe(6.282);
  });

  it("o defeito que isto fecha: ponto sem trocar virava 100x", () => {
    expect(paraNumero("2194.56")).toBe(219456);
    expect(paraNumero(digitar("2194.56"))).toBe(2194.56);
  });
});
