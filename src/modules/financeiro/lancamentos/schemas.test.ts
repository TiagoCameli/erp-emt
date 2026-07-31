import { describe, expect, it } from "vitest";

import {
  lancamentoFormSchema,
  lancamentoSchema,
} from "@/modules/financeiro/lancamentos/schemas";

const CENTRO = "33333333-3333-4333-8333-333333333333";

/** Formulário válido no estado de parcela única (o mais comum). */
const formBase = {
  tipo: "a_pagar" as const,
  formaPagamentoId: "",
  condicaoPagamentoId: "",
  descricao: "Combustível julho",
  valor: "1.000,00",
  dataCompra: "2026-07-10",
  mesCompetencia: "2026-07",
  dataVencimento: "2026-08-10",
  observacoes: "",
  parcelas: [{ valor: "", dataVencimento: "" }],
  rateios: [],
};

/**
 * Vencimento e Parcelas são excludentes na tela, e o schema precisa acompanhar:
 * com uma parcela a tabela não aparece, a linha fica em branco e quem manda são
 * os campos Valor e Vencimento do cabeçalho. Exigir valor na linha escondida
 * travaria o formulário num campo que ninguém vê.
 */
describe("lancamentoFormSchema, parcela única", () => {
  it("aceita a linha de parcela em branco quando existe só uma", () => {
    const r = lancamentoFormSchema.safeParse(formBase);
    expect(r.success).toBe(true);
  });

  it("não cobra que a parcela única feche com o valor, porque ela é derivada", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formBase,
      parcelas: [{ valor: "1,00", dataVencimento: "" }],
    });
    expect(r.success).toBe(true);
  });

  it("aceita parcela única sem vencimento (a coluna é nullable no banco)", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formBase,
      dataVencimento: "",
    });
    expect(r.success).toBe(true);
  });
});

describe("lancamentoFormSchema, duas ou mais parcelas", () => {
  it("aceita quando a soma das parcelas fecha com o valor", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formBase,
      parcelas: [
        { valor: "600,00", dataVencimento: "2026-08-10" },
        { valor: "400,00", dataVencimento: "2026-09-10" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("recusa quando a soma das parcelas não fecha com o valor", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formBase,
      parcelas: [
        { valor: "600,00", dataVencimento: "2026-08-10" },
        { valor: "300,00", dataVencimento: "2026-09-10" },
      ],
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.message).toBe(
      "A soma das parcelas precisa ser igual ao valor",
    );
    expect(r.error.issues[0]?.path).toEqual(["parcelas"]);
  });

  it("volta a exigir valor em cada parcela, apontando a linha errada", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formBase,
      parcelas: [
        { valor: "1.000,00", dataVencimento: "2026-08-10" },
        { valor: "", dataVencimento: "2026-09-10" },
      ],
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const erroDaLinha = r.error.issues.find(
      (issue) => issue.path.join(".") === "parcelas.1.valor",
    );
    expect(erroDaLinha?.message).toBe("Informe um valor válido");
  });

  it("aceita parcela sem vencimento no meio de várias (vai para o fim da numeração)", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formBase,
      parcelas: [
        { valor: "600,00", dataVencimento: "2026-08-10" },
        { valor: "400,00", dataVencimento: "" },
      ],
    });
    expect(r.success).toBe(true);
  });
});

/**
 * O schema de servidor recebe o array já montado pela tela (com a parcela única
 * derivada do cabeçalho), então nele a soma continua obrigatória sempre: é a
 * segunda barreira antes da RPC, que também revalida.
 */
describe("lancamentoSchema, servidor", () => {
  const servidorBase = {
    tipo: "a_pagar" as const,
    descricao: "Combustível julho",
    valor: 1000,
    dataCompra: "2026-07-10",
    mesCompetencia: "2026-07-01",
    dataVencimento: "2026-08-10",
    parcelas: [{ valor: 1000, dataVencimento: "2026-08-10" }],
    rateios: [],
  };

  it("aceita a parcela única derivada do cabeçalho", () => {
    const r = lancamentoSchema.safeParse(servidorBase);
    expect(r.success).toBe(true);
  });

  it("recusa soma de parcelas que não fecha, mesmo com uma parcela só", () => {
    const r = lancamentoSchema.safeParse({
      ...servidorBase,
      parcelas: [{ valor: 999, dataVencimento: "2026-08-10" }],
    });
    expect(r.success).toBe(false);
  });

  it("não exige número da parcela (quem numera é o banco)", () => {
    const r = lancamentoSchema.safeParse(servidorBase);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.parcelas[0]).not.toHaveProperty("numeroParcela");
  });

  it("recusa rateio que não fecha com o valor", () => {
    const r = lancamentoSchema.safeParse({
      ...servidorBase,
      rateios: [{ centroCustoId: CENTRO, valor: 900 }],
    });
    expect(r.success).toBe(false);
  });
});
