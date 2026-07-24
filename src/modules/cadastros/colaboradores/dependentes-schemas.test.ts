import { describe, expect, it } from "vitest";

import {
  dependenteSchema,
  PARENTESCOS,
  ROTULO_PARENTESCO,
} from "@/modules/cadastros/colaboradores/dependentes-schemas";

const base = {
  colaboradorId: "b6f8a8e0-1c1a-4f1a-9c1a-000000000001",
  nome: "Maria da Silva",
  dataNascimento: "",
  parentesco: "filho" as const,
  cpf: "",
};

describe("dependenteSchema — validações básicas", () => {
  it("aceita um dependente válido mínimo", () => {
    const r = dependenteSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("rejeita nome vazio", () => {
    const r = dependenteSchema.safeParse({ ...base, nome: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita nome com só 1 caractere", () => {
    const r = dependenteSchema.safeParse({ ...base, nome: "A" });
    expect(r.success).toBe(false);
  });

  it("rejeita parentesco inválido", () => {
    const r = dependenteSchema.safeParse({ ...base, parentesco: "primo" });
    expect(r.success).toBe(false);
  });

  it("rejeita colaboradorId que não é uuid", () => {
    const r = dependenteSchema.safeParse({ ...base, colaboradorId: "abc" });
    expect(r.success).toBe(false);
  });

  it("aceita todos os parentescos do domínio", () => {
    for (const parentesco of PARENTESCOS) {
      const r = dependenteSchema.safeParse({ ...base, parentesco });
      expect(r.success).toBe(true);
    }
  });
});

describe("dependenteSchema — flags de IRRF e salário-família", () => {
  it("assume false por padrão quando as flags não são enviadas", () => {
    const r = dependenteSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dependenteIrrf).toBe(false);
      expect(r.data.dependenteSalarioFamilia).toBe(false);
    }
  });

  it("aceita as flags explicitamente marcadas", () => {
    const r = dependenteSchema.safeParse({
      ...base,
      dependenteIrrf: true,
      dependenteSalarioFamilia: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dependenteIrrf).toBe(true);
      expect(r.data.dependenteSalarioFamilia).toBe(true);
    }
  });
});

describe("dependenteSchema — campos opcionais", () => {
  it("aceita data de nascimento e cpf vazios como null", () => {
    const r = dependenteSchema.safeParse({ ...base, dataNascimento: "", cpf: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dataNascimento).toBeNull();
      expect(r.data.cpf).toBeNull();
    }
  });

  it("aceita data de nascimento e cpf preenchidos", () => {
    const r = dependenteSchema.safeParse({
      ...base,
      dataNascimento: "2015-03-10",
      cpf: "123.456.789-00",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dataNascimento).toBe("2015-03-10");
      expect(r.data.cpf).toBe("123.456.789-00");
    }
  });

  it("aceita id ausente (criação) e id presente (edição)", () => {
    const criacao = dependenteSchema.safeParse(base);
    expect(criacao.success).toBe(true);
    if (criacao.success) expect(criacao.data.id).toBeUndefined();

    const edicao = dependenteSchema.safeParse({
      ...base,
      id: "b6f8a8e0-1c1a-4f1a-9c1a-000000000002",
    });
    expect(edicao.success).toBe(true);
    if (edicao.success) {
      expect(edicao.data.id).toBe("b6f8a8e0-1c1a-4f1a-9c1a-000000000002");
    }
  });
});

describe("ROTULO_PARENTESCO", () => {
  it("tem rótulo pt-BR para cada parentesco do domínio", () => {
    for (const parentesco of PARENTESCOS) {
      expect(ROTULO_PARENTESCO[parentesco]).toBeTruthy();
    }
  });
});
