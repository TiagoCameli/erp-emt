import { describe, expect, it } from "vitest";

import {
  adicionarItemRescisaoSchema,
  editarItemRescisaoSchema,
  gerarRescisaoSchema,
  motivoRescisaoSchema,
} from "./schemas";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OUTRO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";

function base(extra: Record<string, unknown> = {}) {
  return {
    colaboradorId: ID,
    tipo: "sem_justa_causa",
    aviso: "indenizado",
    dataDesligamento: "2026-09-15",
    dataAviso: "",
    saldoFgts: "",
    feriasVencidasPeriodos: "0",
    remuneracaoBase: "",
    dataVencimento: "",
    observacao: "",
    ...extra,
  };
}

describe("gerarRescisaoSchema", () => {
  it("aceita o caso mínimo e resolve os vazios", () => {
    const resultado = gerarRescisaoSchema.safeParse(base());
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    // Vazio no FGTS é ZERO (não informou = não há multa a calcular), mas vazio
    // na base é NULL (usa o salário do cadastro). São coisas diferentes e o
    // schema tem de as manter diferentes.
    expect(resultado.data.saldoFgts).toBe(0);
    expect(resultado.data.remuneracaoBase).toBeNull();
    expect(resultado.data.dataAviso).toBeNull();
    expect(resultado.data.observacao).toBeNull();
  });

  it("recusa aviso que não existe no tipo escolhido", () => {
    const resultado = gerarRescisaoSchema.safeParse(
      base({ tipo: "justa_causa", aviso: "indenizado" }),
    );
    expect(resultado.success).toBe(false);
    if (resultado.success) return;
    expect(resultado.error.issues[0]?.path).toEqual(["aviso"]);
  });

  it("recusa aviso indenizado num pedido de demissão", () => {
    // Quem pede demissão não recebe aviso indenizado da empresa.
    expect(
      gerarRescisaoSchema.safeParse(
        base({ tipo: "pedido_demissao", aviso: "indenizado" }),
      ).success,
    ).toBe(false);
  });

  it("aceita aviso não cumprido no pedido de demissão", () => {
    expect(
      gerarRescisaoSchema.safeParse(
        base({ tipo: "pedido_demissao", aviso: "nao_cumprido" }),
      ).success,
    ).toBe(true);
  });

  it("recusa aviso depois do desligamento", () => {
    const resultado = gerarRescisaoSchema.safeParse(
      base({ dataAviso: "2026-09-20" }),
    );
    expect(resultado.success).toBe(false);
    if (resultado.success) return;
    expect(resultado.error.issues[0]?.path).toEqual(["dataAviso"]);
  });

  it("lê o valor em pt-BR sem multiplicar por dez", () => {
    // "12.000,00" com ponto de milhar: sem o parser que valida o agrupamento,
    // "12.000" viraria 12 e a multa do FGTS sairia mil vezes menor.
    const resultado = gerarRescisaoSchema.safeParse(
      base({ saldoFgts: "12.000,00" }),
    );
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.saldoFgts).toBe(12000);
  });

  it("recusa mais de duas casas no dinheiro", () => {
    expect(
      gerarRescisaoSchema.safeParse(base({ saldoFgts: "1000,555" })).success,
    ).toBe(false);
  });

  it("recusa base zerada, que não é o mesmo que base vazia", () => {
    // Vazio = "usa o cadastro". Zero digitado = "esta pessoa não recebe nada",
    // que a RPC recusaria depois de o usuário preencher a tela inteira.
    expect(
      gerarRescisaoSchema.safeParse(base({ remuneracaoBase: "0" })).success,
    ).toBe(false);
  });

  it("recusa período de férias fracionado", () => {
    expect(
      gerarRescisaoSchema.safeParse(base({ feriasVencidasPeriodos: "1,5" }))
        .success,
    ).toBe(false);
  });

  it("recusa um número absurdo de períodos vencidos", () => {
    // Quem trabalha desde 2010 tem 16 períodos aquisitivos completos e nenhuma
    // férias registrada no sistema. Aceitar "16" digitado por engano pagaria
    // dezesseis salários.
    expect(
      gerarRescisaoSchema.safeParse(base({ feriasVencidasPeriodos: "16" }))
        .success,
    ).toBe(false);
  });

  it("recusa data de desligamento vazia", () => {
    expect(
      gerarRescisaoSchema.safeParse(base({ dataDesligamento: "" })).success,
    ).toBe(false);
  });
});

describe("editarItemRescisaoSchema", () => {
  it("aceita zero: é assim que se tira uma verba calculada da conta", () => {
    const resultado = editarItemRescisaoSchema.safeParse({
      itemId: ID,
      valor: "0",
    });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.valor).toBe(0);
  });

  it("recusa valor negativo", () => {
    expect(
      editarItemRescisaoSchema.safeParse({ itemId: ID, valor: "-10" }).success,
    ).toBe(false);
  });
});

describe("adicionarItemRescisaoSchema", () => {
  it("aceita um desconto livre", () => {
    const resultado = adicionarItemRescisaoSchema.safeParse({
      rescisaoId: OUTRO_ID,
      descricao: "  Pensão alimentícia  ",
      natureza: "desconto",
      valor: "300,00",
    });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.descricao).toBe("Pensão alimentícia");
    expect(resultado.data.valor).toBe(300);
  });

  it("recusa natureza inventada", () => {
    expect(
      adicionarItemRescisaoSchema.safeParse({
        rescisaoId: OUTRO_ID,
        descricao: "Alguma coisa",
        natureza: "outro",
        valor: "10",
      }).success,
    ).toBe(false);
  });

  it("recusa descrição em branco", () => {
    expect(
      adicionarItemRescisaoSchema.safeParse({
        rescisaoId: OUTRO_ID,
        descricao: "   ",
        natureza: "desconto",
        valor: "10",
      }).success,
    ).toBe(false);
  });
});

describe("motivoRescisaoSchema", () => {
  it("recusa motivo só de espaço", () => {
    expect(
      motivoRescisaoSchema.safeParse({ rescisaoId: ID, motivo: "   " }).success,
    ).toBe(false);
  });

  it("aceita e apara o motivo", () => {
    const resultado = motivoRescisaoSchema.safeParse({
      rescisaoId: ID,
      motivo: "  valor errado  ",
    });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.motivo).toBe("valor errado");
  });
});
