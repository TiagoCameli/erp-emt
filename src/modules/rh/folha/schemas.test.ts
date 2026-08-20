import { describe, expect, it } from "vitest";

import { editarItemFolhaSchema } from "@/modules/rh/folha/schemas";

const ITEM = "11111111-1111-4111-8111-111111111111";

/** Payload mínimo válido, para cada teste mexer só no que ele mede. */
function base(overrides: Record<string, unknown> = {}) {
  return {
    itemId: ITEM,
    salarioBase: "2.000,00",
    gratificacao: "",
    encargosPercentual: "",
    ...overrides,
  };
}

describe("editarItemFolhaSchema — percentual vazio não é zero", () => {
  it("percentual vazio vira null: a linha volta a usar os encargos da config", () => {
    const r = editarItemFolhaSchema.safeParse(base({ encargosPercentual: "" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.encargosPercentual).toBeNull();
  });

  it("percentual null vira null (o caminho do reparse na Server Action)", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ encargosPercentual: null }),
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.encargosPercentual).toBeNull();
  });

  it('percentual "0" vira 0, e 0 é DIFERENTE de vazio: é "esta pessoa não tem encargo"', () => {
    const r = editarItemFolhaSchema.safeParse(base({ encargosPercentual: "0" }));
    expect(r.success).toBe(true);
    // A distinção é o que faz um terceiro entrar na folha sem encargo sem
    // apagar a configuração de todo mundo. Se as duas virassem a mesma coisa,
    // ou o terceiro carregaria encargo de CLT, ou a folha inteira ficaria sem
    // encargo — e as duas versões passariam por qualquer teste que só olhasse
    // "é falsy".
    if (r.success) expect(r.data.encargosPercentual).toBe(0);
  });
});

describe("editarItemFolhaSchema — gratificação", () => {
  it("gratificação vazia vira 0", () => {
    const r = editarItemFolhaSchema.safeParse(base({ gratificacao: "" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gratificacao).toBe(0);
  });

  it("aceita gratificação com salário base zero: mês em que a pessoa só recebe gratificação", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ salarioBase: "0", gratificacao: "500,00" }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.salarioBase).toBe(0);
      expect(r.data.gratificacao).toBe(500);
    }
  });

  it("recusa salário base e gratificação os dois zero: linha de R$ 0,00 não existe na folha", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ salarioBase: "0", gratificacao: "0" }),
    );
    expect(r.success).toBe(false);
  });

  it("recusa salário base e gratificação os dois vazios pelo mesmo motivo", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ salarioBase: "0", gratificacao: "" }),
    );
    expect(r.success).toBe(false);
  });
});

describe("editarItemFolhaSchema — parsing pt-BR", () => {
  it("lê o milhar com ponto e o decimal com vírgula", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ salarioBase: "12.345,67", gratificacao: "1.000,00" }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.salarioBase).toBe(12345.67);
      expect(r.data.gratificacao).toBe(1000);
    }
  });

  it('recusa "0.5" no percentual em vez de aceitar como 5', () => {
    // Agrupamento de milhar inválido (grupo de 1 dígito). Sem esta trava, quem
    // digita 0.5 querendo 0,5% cadastra 5% e o encargo sai dez vezes maior,
    // aprovado pelo check da coluna e por qualquer refine de faixa.
    const r = editarItemFolhaSchema.safeParse(
      base({ encargosPercentual: "0.5" }),
    );
    expect(r.success).toBe(false);
  });

  it("aceita 4 casas no percentual (8,3333% é alíquota real)", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ encargosPercentual: "8,3333" }),
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.encargosPercentual).toBe(8.3333);
  });

  it("recusa 5 casas no percentual: a coluna NUMERIC(7,4) arredondaria calada", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ encargosPercentual: "8,33333" }),
    );
    expect(r.success).toBe(false);
  });

  it("recusa 3 casas no dinheiro: NUMERIC(14,2) arredondaria calado", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ salarioBase: "2.000,555" }),
    );
    expect(r.success).toBe(false);
  });
});

describe("editarItemFolhaSchema — faixas", () => {
  it("recusa salário base negativo", () => {
    const r = editarItemFolhaSchema.safeParse(base({ salarioBase: "-1" }));
    expect(r.success).toBe(false);
  });

  it("recusa gratificação negativa", () => {
    const r = editarItemFolhaSchema.safeParse(base({ gratificacao: "-1" }));
    expect(r.success).toBe(false);
  });

  it("recusa percentual acima de 100", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ encargosPercentual: "101" }),
    );
    expect(r.success).toBe(false);
  });

  it("aceita percentual 100 (o limite do check da coluna)", () => {
    const r = editarItemFolhaSchema.safeParse(
      base({ encargosPercentual: "100" }),
    );
    expect(r.success).toBe(true);
  });

  it("recusa item que não é uuid", () => {
    const r = editarItemFolhaSchema.safeParse(base({ itemId: "nao-e-uuid" }));
    expect(r.success).toBe(false);
  });
});

describe("editarItemFolhaSchema — reparse na Server Action", () => {
  it("aceita os números já convertidos, sem virar string de novo", () => {
    // A action valida o Input já processado: se o schema só aceitasse string,
    // o reparse quebraria em runtime com o build verde.
    const r = editarItemFolhaSchema.safeParse({
      itemId: ITEM,
      salarioBase: 1621,
      gratificacao: 500,
      encargosPercentual: 10,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.salarioBase).toBe(1621);
      expect(r.data.gratificacao).toBe(500);
      expect(r.data.encargosPercentual).toBe(10);
    }
  });

  it("aceita gratificação 0 como número no reparse (e não confunde com vazio)", () => {
    const r = editarItemFolhaSchema.safeParse({
      itemId: ITEM,
      salarioBase: 1621,
      gratificacao: 0,
      encargosPercentual: 0,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gratificacao).toBe(0);
      expect(r.data.encargosPercentual).toBe(0);
    }
  });
});
