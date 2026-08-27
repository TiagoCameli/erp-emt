import { describe, expect, it } from "vitest";

import {
  apenasDigitos,
  formatarCep,
  formatarCnpjCpf,
  formatarTelefone,
  validarCep,
  validarCnpjCpf,
  validarCpf,
  validarTelefone,
} from "@/lib/documentos";

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

describe("validarCpf", () => {
  it("considera vazio como válido (campo opcional)", () => {
    expect(validarCpf("")).toBe(true);
    expect(validarCpf("   ")).toBe(true);
  });

  it("aceita 11 dígitos, mascarados ou não", () => {
    expect(validarCpf("111.444.777-35")).toBe(true);
    expect(validarCpf("11144477735")).toBe(true);
  });

  it("REJEITA 14 dígitos, ao contrário de validarCnpjCpf", () => {
    // É a diferença entre as duas funções, e o motivo de esta existir: num campo
    // de pessoa, 14 dígitos é campo trocado, não uma alternativa válida.
    expect(validarCnpjCpf("00000000000100")).toBe(true);
    expect(validarCpf("00000000000100")).toBe(false);
  });

  it("rejeita 10 dígitos (faltou um número)", () => {
    expect(validarCpf("1114447773")).toBe(false);
  });
});

describe("formatarTelefone", () => {
  it("mascara celular de 11 dígitos com o nono dígito", () => {
    expect(formatarTelefone("68999991234")).toBe("(68) 99999-1234");
  });

  it("mascara fixo de 10 dígitos", () => {
    expect(formatarTelefone("6832234567")).toBe("(68) 3223-4567");
  });

  it("é idempotente sobre um valor já mascarado", () => {
    expect(formatarTelefone("(68) 99999-1234")).toBe("(68) 99999-1234");
  });

  it("devolve o valor com trim quando a contagem não bate", () => {
    // Número sem DDD (9 dígitos) não ganha máscara: mascarar como se tivesse DDD
    // transformaria 99999-1234 em "(99) 9991-234" e inventaria um DDD.
    expect(formatarTelefone("  999991234  ")).toBe("999991234");
  });
});

describe("validarTelefone", () => {
  it("considera vazio como válido (campo opcional)", () => {
    expect(validarTelefone("")).toBe(true);
  });

  it("aceita 10 (fixo) e 11 (celular)", () => {
    expect(validarTelefone("(68) 3223-4567")).toBe(true);
    expect(validarTelefone("(68) 99999-1234")).toBe(true);
  });

  it("rejeita número sem DDD", () => {
    expect(validarTelefone("999991234")).toBe(false);
  });
});

describe("formatarCep e validarCep", () => {
  it("mascara 8 dígitos", () => {
    expect(formatarCep("69900000")).toBe("69900-000");
  });

  it("é idempotente sobre um valor já mascarado", () => {
    expect(formatarCep("69900-000")).toBe("69900-000");
  });

  it("deixa o valor cru quando a contagem não bate", () => {
    expect(formatarCep("6990")).toBe("6990");
  });

  it("valida vazio e 8 dígitos, rejeita 7", () => {
    expect(validarCep("")).toBe(true);
    expect(validarCep("69.900-000")).toBe(true);
    expect(validarCep("6990000")).toBe(false);
  });
});
