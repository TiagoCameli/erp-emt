import { describe, expect, it } from "vitest";

import { paraNumero } from "@/modules/compras/ordens/calculo";
import {
  formatarNumeroDigitado,
  normalizarNumeroDigitado,
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
    expect(normalizarNumeroDigitado("1,234", 2)).toBeNull();
    expect(normalizarNumeroDigitado("1,234", 3)).toBe("1,234");
    expect(normalizarNumeroDigitado("1,2345", 3)).toBeNull();
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
