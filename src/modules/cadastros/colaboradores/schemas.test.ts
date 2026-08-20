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
  funcaoId: null,
  jornadaId: null,
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

describe("colaboradorSchema — funcaoId", () => {
  it("aceita funcaoId null (colaborador sem função)", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      funcaoId: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.funcaoId).toBeNull();
  });

  it("aceita um uuid válido de função", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      funcaoId: uuid,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.funcaoId).toBe(uuid);
  });

  it("rejeita funcaoId que não é um uuid", () => {
    const r = colaboradorSchema.safeParse({
      ...base,
      salario: "",
      valorDiaria: "",
      funcaoId: "Pedreiro",
    });
    expect(r.success).toBe(false);
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

  it("aceita texto opcional (rg, ctps, pis etc.) vazio como null", () => {
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
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rg).toBeNull();
      expect(r.data.dataNascimento).toBeNull();
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

describe("colaboradorSchema — gratificação e encargo individual", () => {
  const remuneracao = { ...base, salario: "3.500,00", valorDiaria: "" };

  it("aceita as duas chaves ausentes: o formulário antigo não as enviava", () => {
    const r = colaboradorSchema.safeParse(remuneracao);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gratificacao).toBeUndefined();
      expect(r.data.encargosPercentual).toBeUndefined();
    }
  });

  it("gratificação vazia vira null (a gravação troca por 0, que é o default da coluna)", () => {
    const r = colaboradorSchema.safeParse({ ...remuneracao, gratificacao: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gratificacao).toBeNull();
  });

  it("lê a gratificação em pt-BR", () => {
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      gratificacao: "1.250,50",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gratificacao).toBe(1250.5);
  });

  it("recusa gratificação com 3 casas: NUMERIC(14,2) arredondaria calado", () => {
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      gratificacao: "10,999",
    });
    expect(r.success).toBe(false);
  });

  it("recusa gratificação negativa", () => {
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      gratificacao: "-1",
    });
    expect(r.success).toBe(false);
  });

  it('encargo vazio vira null: "usa os encargos configurados na folha"', () => {
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      encargosPercentual: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.encargosPercentual).toBeNull();
  });

  it('encargo "0" vira 0, que é DIFERENTE de vazio: "esta pessoa não tem encargo"', () => {
    // As duas coisas precisam ser dizíveis. Se vazio e zero fossem a mesma,
    // cadastrar um terceiro sem encargo obrigaria a apagar a configuração de
    // todo mundo, ou o terceiro carregaria encargo de CLT.
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      encargosPercentual: "0",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.encargosPercentual).toBe(0);
  });

  it("aceita 4 casas no encargo (26,8% e 8,3333% são alíquotas reais)", () => {
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      encargosPercentual: "8,3333",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.encargosPercentual).toBe(8.3333);
  });

  it('recusa "0.5" no encargo em vez de aceitar como 5', () => {
    // Agrupamento de milhar inválido. É a razão de este campo usar o paraNumero
    // de rh/percentual e não o local: com o local, 0.5 viraria 5 e o encargo
    // sairia dez vezes maior, aprovado pelo check da coluna.
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      encargosPercentual: "0.5",
    });
    expect(r.success).toBe(false);
  });

  it("recusa encargo acima de 100", () => {
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      encargosPercentual: "101",
    });
    expect(r.success).toBe(false);
  });

  it("recusa encargo negativo", () => {
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      encargosPercentual: "-1",
    });
    expect(r.success).toBe(false);
  });

  it("aceita os números já convertidos (reparse na Server Action)", () => {
    const r = colaboradorSchema.safeParse({
      ...remuneracao,
      salario: 3500,
      valorDiaria: null,
      gratificacao: 500,
      encargosPercentual: 0,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gratificacao).toBe(500);
      expect(r.data.encargosPercentual).toBe(0);
    }
  });
});
