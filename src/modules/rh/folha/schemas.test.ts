import { describe, expect, it } from "vitest";

import { editarItemFolhaSchema } from "@/modules/rh/folha/schemas";

const ITEM = "11111111-1111-4111-8111-111111111111";

/** Payload mínimo válido, para cada teste mexer só no que ele mede. */
function base(overrides: Record<string, unknown> = {}) {
  return {
    itemId: ITEM,
    salarioBase: "2.000,00",
    gratificacao: "",
    desconto: "",
    // Vazio = o desconto não foi informado por horas. O campo sempre vai (a
    // tela sempre manda), e é o valor dele que pode ser nulo.
    descontoHoras: "",
    ...overrides,
  };
}

describe("editarItemFolhaSchema — desconto vazio vale zero", () => {
  // Aqui havia três testes defendendo a distinção entre vazio (null, "sem
  // desconto") e zero ("tem, e é 0%"). Ela existia porque o desconto era um
  // parâmetro de configuração — um percentual — e não o resultado. Com valor não
  // sobrou o que distinguir: R$ 0,00 é R$ 0,00, e quem marca a linha como mexida
  // à mão (o que o Regerar consulta) é `editado_manualmente`, não o desconto.
  it("desconto vazio vira 0", () => {
    const r = editarItemFolhaSchema.safeParse(base({ desconto: "" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.desconto).toBe(0);
  });

  it("desconto null vira 0 (o caminho do reparse na Server Action)", () => {
    const r = editarItemFolhaSchema.safeParse(base({ desconto: null }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.desconto).toBe(0);
  });

  it("os três jeitos de dizer nada dão o mesmo zero", () => {
    for (const nada of ["", null, "0"]) {
      const r = editarItemFolhaSchema.safeParse(base({ desconto: nada }));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.desconto).toBe(0);
    }
  });

  it("O CASO QUE ORIGINOU A MUDANÇA: 121,57 atravessa intacto", () => {
    // 7,5% de R$ 1.621,00 é 121,575, a metade exata do centavo: o percentual
    // arredondava para 121,58 e o contracheque paga 121,57. Se o schema
    // arredondar, truncar ou recalcular qualquer coisa aqui, o centavo volta.
    const r = editarItemFolhaSchema.safeParse(
      base({ salarioBase: "1.621,00", desconto: "121,57" }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.desconto).toBe(121.57);
      expect(r.data.desconto).not.toBe(121.58);
    }
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

  it('recusa "0.5" no desconto em vez de aceitar como 5', () => {
    // Agrupamento de milhar inválido (grupo de 1 dígito). Sem esta trava, quem
    // digita 0.5 querendo R$ 0,50 desconta R$ 5,00 — dez vezes mais, aprovado
    // pelo check da coluna e por qualquer refine de faixa.
    const r = editarItemFolhaSchema.safeParse(base({ desconto: "0.5" }));
    expect(r.success).toBe(false);
  });

  it("recusa 3 casas no desconto: agora é dinheiro, e NUMERIC(14,2) arredondaria calado", () => {
    // Quando era percentual, 4 casas eram legítimas (8,3333% é alíquota real).
    // Virou dinheiro: 2 casas, porque centavo é a unidade em que o desconto sai
    // do salário. Aceitar a terceira casa aqui devolveria pela porta do schema
    // exatamente o arredondamento silencioso que esta frente foi tirar.
    const r = editarItemFolhaSchema.safeParse(base({ desconto: "8,3333" }));
    expect(r.success).toBe(false);
  });

  it("aceita as 2 casas do centavo", () => {
    const r = editarItemFolhaSchema.safeParse(base({ desconto: "1.234,56" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.desconto).toBe(1234.56);
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

  it("recusa desconto negativo", () => {
    const r = editarItemFolhaSchema.safeParse(base({ desconto: "-1" }));
    expect(r.success).toBe(false);
  });

  it("aceita desconto maior que o salário: quem recusa é o banco, com o número na mão", () => {
    // O percentual tinha teto de 100 e isso, sozinho, impedia o desconto de
    // passar do salário. Em reais não há teto natural, e o schema não tem como
    // saber o teto: ele depende de INSS e IRRF, que só existem no banco. Então
    // a trava mora na fn_editar_item_folha, que recusa dizendo quanto sobrava.
    // Aceitar aqui é deliberado — o schema valida FORMA, não regra de negócio
    // que depende de outras linhas.
    const r = editarItemFolhaSchema.safeParse(
      base({ salarioBase: "1.000,00", desconto: "99.999,00" }),
    );
    expect(r.success).toBe(true);
  });

  it("recusa item que não é uuid", () => {
    const r = editarItemFolhaSchema.safeParse(base({ itemId: "nao-e-uuid" }));
    expect(r.success).toBe(false);
  });
});

describe("editarItemFolhaSchema — horas não trabalhadas", () => {
  it("vazio é null: o desconto não foi informado por horas", () => {
    const r = editarItemFolhaSchema.safeParse(base({ descontoHoras: "" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.descontoHoras).toBeNull();
  });

  it("zero NÃO é vazio: é uma declaração de zero hora", () => {
    // A distinção existe porque a coluna é nullable de propósito: nulo é "não
    // disseram o motivo", zero é "disseram, e foi zero".
    const r = editarItemFolhaSchema.safeParse(base({ descontoHoras: "0" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.descontoHoras).toBe(0);
  });

  it("aceita meia hora e um quarto de hora", () => {
    for (const [texto, esperado] of [
      ["0,5", 0.5],
      ["0,25", 0.25],
      ["8", 8],
      ["8,5", 8.5],
    ] as const) {
      const r = editarItemFolhaSchema.safeParse(base({ descontoHoras: texto }));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.descontoHoras).toBe(esperado);
    }
  });

  it("recusa negativo", () => {
    const r = editarItemFolhaSchema.safeParse(base({ descontoHoras: "-1" }));
    expect(r.success).toBe(false);
  });

  it("recusa mais que o mês inteiro", () => {
    // 200 é o mês; 201 é erro de digitação, não falta.
    expect(
      editarItemFolhaSchema.safeParse(base({ descontoHoras: "200" })).success,
    ).toBe(true);
    const r = editarItemFolhaSchema.safeParse(base({ descontoHoras: "201" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain("0 a 200");
    }
  });

  it("recusa 3 casas decimais: a coluna guarda 2", () => {
    // 8,255 seria arredondado pela coluna sem ninguém avisar.
    const r = editarItemFolhaSchema.safeParse(base({ descontoHoras: "8,255" }));
    expect(r.success).toBe(false);
  });

  it("lê o decimal com vírgula, igual ao resto do app", () => {
    const r = editarItemFolhaSchema.safeParse(base({ descontoHoras: "12,34" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.descontoHoras).toBe(12.34);
  });

  it("horas e valor são independentes: o schema não exige coerência", () => {
    // De propósito. O contracheque pode dizer "8h, R$ 64,83" e os dois números
    // vão como vieram — foi o meio centavo do percentual que ensinou isso.
    const r = editarItemFolhaSchema.safeParse(
      base({ salarioBase: "1.621,00", descontoHoras: "8", desconto: "64,83" }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.descontoHoras).toBe(8);
      expect(r.data.desconto).toBe(64.83);
    }
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
      desconto: 121.57,
      descontoHoras: 8,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.salarioBase).toBe(1621);
      expect(r.data.gratificacao).toBe(500);
      expect(r.data.desconto).toBe(121.57);
      expect(r.data.descontoHoras).toBe(8);
    }
  });

  it("aceita gratificação 0 como número no reparse (e não confunde com vazio)", () => {
    const r = editarItemFolhaSchema.safeParse({
      itemId: ITEM,
      salarioBase: 1621,
      gratificacao: 0,
      desconto: 0,
      descontoHoras: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gratificacao).toBe(0);
      expect(r.data.desconto).toBe(0);
    }
  });
});
