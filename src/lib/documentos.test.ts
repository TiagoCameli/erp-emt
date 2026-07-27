import { describe, expect, it } from "vitest";

import { apenasDigitos, formatarCnpjCpf, validarCnpjCpf } from "@/lib/documentos";

describe("formatarCnpjCpf", () => {
  it("mascara um CNPJ de 14 dígitos", () => {
    expect(formatarCnpjCpf("00000000000100")).toBe("00.000.000/0001-00");
  });

  it("mascara um CPF de 11 dígitos", () => {
    expect(formatarCnpjCpf("00000000000")).toBe("000.000.000-00");
  });

  it("é idempotente sobre um valor já mascarado", () => {
    const mascarado = "12.345.678/0001-95";
    expect(formatarCnpjCpf(mascarado)).toBe(mascarado);
  });

  it("devolve o valor original com trim quando a contagem não bate", () => {
    expect(formatarCnpjCpf("  123  ")).toBe("123");
  });
});

describe("validarCnpjCpf", () => {
  it("considera vazio ou só espaços como válido (campo opcional)", () => {
    expect(validarCnpjCpf("")).toBe(true);
    expect(validarCnpjCpf("   ")).toBe(true);
  });

  it("aceita 11 dígitos (CPF) e 14 dígitos (CNPJ), mascarados ou não", () => {
    expect(validarCnpjCpf("000.000.000-00")).toBe(true);
    expect(validarCnpjCpf("00.000.000/0001-00")).toBe(true);
    expect(validarCnpjCpf("00000000000")).toBe(true);
    expect(validarCnpjCpf("00000000000100")).toBe(true);
  });

  it("rejeita uma contagem de 13 dígitos", () => {
    expect(validarCnpjCpf("0000000000000")).toBe(false);
  });
});

describe("apenasDigitos", () => {
  it("remove tudo que não é dígito", () => {
    expect(apenasDigitos("00.000.000/0001-00")).toBe("00000000000100");
  });
});
