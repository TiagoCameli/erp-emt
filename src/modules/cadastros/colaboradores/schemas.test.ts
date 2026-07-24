import { describe, expect, it } from "vitest";

import {
  CNH_CATEGORIAS,
  colaboradorSchema,
  ESCOLARIDADES,
  ESTADOS_CIVIS,
  paraNumero,
  RACAS_COR,
  ROTULO_CNH_CATEGORIA,
  ROTULO_ESCOLARIDADE,
  ROTULO_ESTADO_CIVIL,
  ROTULO_RACA_COR,
} from "@/modules/cadastros/colaboradores/schemas";

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

describe("colaboradorSchema — dados pessoais novos (Bloco 2)", () => {
  it("aceita o cadastro sem nenhum dos campos novos (formulário atual não os envia)", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
    });
    expect(r.success).toBe(true);
  });

  it("aceita texto opcional (rg, ctps, pis, cbo etc.) vazio como null", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      rg: "",
      rgOrgao: "",
      rgUf: "",
      ctpsNumero: "",
      ctpsSerie: "",
      ctpsUf: "",
      pis: "",
      cnhNumero: "",
      cnhValidade: "",
      dataNascimento: "",
      nomeMae: "",
      nacionalidade: "",
      tituloEleitor: "",
      reservista: "",
      cbo: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rg).toBeNull();
      expect(r.data.dataNascimento).toBeNull();
      expect(r.data.cbo).toBeNull();
    }
  });

  it("aceita todos os valores válidos de escolaridade", () => {
    for (const escolaridade of ESCOLARIDADES) {
      const r = colaboradorSchema.safeParse({
        ...base,
        salario: "",
        valorDiaria: "",
        escolaridade,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejeita escolaridade inválida", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      escolaridade: "phd_honoris_causa",
    });
    expect(r.success).toBe(false);
  });

  it("aceita todos os valores válidos de estado civil", () => {
    for (const estadoCivil of ESTADOS_CIVIS) {
      const r = colaboradorSchema.safeParse({
        ...base,
        salario: "",
        valorDiaria: "",
        estadoCivil,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejeita estado civil inválido", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      estadoCivil: "namorando",
    });
    expect(r.success).toBe(false);
  });

  it("aceita todos os valores válidos de raça/cor", () => {
    for (const racaCor of RACAS_COR) {
      const r = colaboradorSchema.safeParse({
        ...base,
        salario: "",
        valorDiaria: "",
        racaCor,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejeita raça/cor inválida", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      racaCor: "outra",
    });
    expect(r.success).toBe(false);
  });

  it("aceita todas as categorias válidas de CNH", () => {
    for (const cnhCategoria of CNH_CATEGORIAS) {
      const r = colaboradorSchema.safeParse({
        ...base,
        salario: "",
        valorDiaria: "",
        cnhCategoria,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejeita categoria de CNH inválida", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      cnhCategoria: "Z",
    });
    expect(r.success).toBe(false);
  });

  it("aceita null explícito nos 4 enums novos (campo não preenchido)", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      escolaridade: null,
      estadoCivil: null,
      racaCor: null,
      cnhCategoria: null,
    });
    expect(r.success).toBe(true);
  });

  it("tem rótulo pt-BR para cada valor dos 4 enums novos", () => {
    for (const escolaridade of ESCOLARIDADES) {
      expect(ROTULO_ESCOLARIDADE[escolaridade]).toBeTruthy();
    }
    for (const estadoCivil of ESTADOS_CIVIS) {
      expect(ROTULO_ESTADO_CIVIL[estadoCivil]).toBeTruthy();
    }
    for (const racaCor of RACAS_COR) {
      expect(ROTULO_RACA_COR[racaCor]).toBeTruthy();
    }
    for (const cnhCategoria of CNH_CATEGORIAS) {
      expect(ROTULO_CNH_CATEGORIA[cnhCategoria]).toBeTruthy();
    }
  });
});
