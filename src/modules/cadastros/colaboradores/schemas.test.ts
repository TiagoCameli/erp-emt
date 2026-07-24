import { describe, expect, it } from "vitest";

import { colaboradorSchema, paraNumero } from "@/modules/cadastros/colaboradores/schemas";

const base = {
  nome: "Jose da Silva",
  cpf: "",
  funcao: "",
  vinculo: "clt" as const,
  obraId: null,
  centroCustoId: null,
  dataAdmissao: "",
  telefone: "",
  ativo: true,
  banco: "",
  agencia: "",
  conta: "",
  chavePix: "",
  tipoConta: null,
};

describe("paraNumero (colaboradores)", () => {
  it("converte texto pt-BR com milhar e decimal", () => {
    expect(paraNumero("3.500,00")).toBe(3500);
  });

  it("texto não numérico vira NaN", () => {
    expect(Number.isNaN(paraNumero("abc"))).toBe(true);
  });
});

describe("colaboradorSchema — salário e diária (dinheiro opcional)", () => {
  it("aceita salário vazio como null (campo opcional)", () => {
    const r = colaboradorSchema.safeParse({ ...base, salario: "", valorDiaria: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.salario).toBeNull();
      expect(r.data.valorDiaria).toBeNull();
    }
  });

  it("converte string digitada (pt-BR) em número", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "3.500,00",
      valorDiaria: "150,50",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.salario).toBe(3500);
      expect(r.data.valorDiaria).toBe(150.5);
    }
  });

  it("rejeita valor negativo", () => {
    const r = colaboradorSchema.safeParse({ ...base, salario: "-10", valorDiaria: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita mais de 2 casas decimais", () => {
    const r = colaboradorSchema.safeParse({ ...base, salario: "10,999", valorDiaria: "" });
    expect(r.success).toBe(false);
  });

  it("é idempotente: reparse do número já convertido continua válido", () => {
    const primeiro = colaboradorSchema.safeParse({
      ...base,
      salario: "3.500,00",
      valorDiaria: "",
    });
    expect(primeiro.success).toBe(true);
    if (!primeiro.success) return;

    // Simula a Server Action revalidando o ColaboradorInput já processado
    // (o mesmo objeto chega a `colaboradorSchema.safeParse` de novo).
    const segundo = colaboradorSchema.safeParse(primeiro.data);
    expect(segundo.success).toBe(true);
    if (segundo.success) expect(segundo.data.salario).toBe(3500);
  });
});

describe("colaboradorSchema — dados bancários", () => {
  it("aceita dados bancários vazios como null", () => {
    const r = colaboradorSchema.safeParse({ ...base, salario: "", valorDiaria: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.banco).toBeNull();
      expect(r.data.agencia).toBeNull();
      expect(r.data.conta).toBeNull();
      expect(r.data.chavePix).toBeNull();
      expect(r.data.tipoConta).toBeNull();
    }
  });

  it("aceita banco/agência/conta/pix preenchidos e tipo de conta válido", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      banco: "Banco do Brasil",
      agencia: "1234",
      conta: "00056-7",
      chavePix: "jose@email.com",
      tipoConta: "corrente",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.banco).toBe("Banco do Brasil");
      expect(r.data.tipoConta).toBe("corrente");
    }
  });

  it("rejeita tipo de conta inválido", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      tipoConta: "investimento",
    });
    expect(r.success).toBe(false);
  });
});
