import { describe, expect, it } from "vitest";

import {
  lancamentoFormSchema,
  lancamentoSchema,
} from "@/modules/financeiro/lancamentos/schemas";

const CENTRO = "33333333-3333-4333-8333-333333333333";
const BOLETO = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaa1111";
const DINHEIRO = "bbbb2222-bbbb-4bbb-8bbb-bbbbbbbb2222";

/**
 * Formulário a pagar de R$ 10.000 dividido em DUAS formas: R$ 6.000 no boleto,
 * em 3 parcelas, e R$ 4.000 em dinheiro, em 1. É o exemplo que o Tiago deu.
 */
const formDuasFormas = {
  tipo: "a_pagar" as const,
  formaPagamentoId: "",
  condicaoPagamentoId: "",
  descricao: "Peças do caminhão",
  valor: "10.000,00",
  dataCompra: "2026-08-10",
  mesCompetencia: "2026-08",
  dataVencimento: "",
  numeroDocumento: "",
  observacoes: "",
  eDivida: false,
  parcelas: [
    { valor: "2.000,00", dataVencimento: "2026-09-10", formaPagamentoId: BOLETO },
    { valor: "2.000,00", dataVencimento: "2026-10-10", formaPagamentoId: BOLETO },
    { valor: "2.000,00", dataVencimento: "2026-11-10", formaPagamentoId: BOLETO },
    { valor: "4.000,00", dataVencimento: "2026-09-05", formaPagamentoId: DINHEIRO },
  ],
  rateios: [{ centroCustoId: CENTRO, valor: "" }],
  formas: [
    { formaPagamentoId: BOLETO, valor: "6.000,00" },
    { formaPagamentoId: DINHEIRO, valor: "4.000,00" },
  ],
};

/** O mesmo lançamento no formato do servidor (valores já coeridos). */
const servidorDuasFormas = {
  tipo: "a_pagar" as const,
  descricao: "Peças do caminhão",
  valor: 10000,
  dataCompra: "2026-08-10",
  mesCompetencia: "2026-08-01",
  parcelas: [
    { valor: 2000, dataVencimento: "2026-09-10", formaPagamentoId: BOLETO },
    { valor: 2000, dataVencimento: "2026-10-10", formaPagamentoId: BOLETO },
    { valor: 2000, dataVencimento: "2026-11-10", formaPagamentoId: BOLETO },
    { valor: 4000, dataVencimento: "2026-09-05", formaPagamentoId: DINHEIRO },
  ],
  rateios: [{ centroCustoId: CENTRO, valor: 10000 }],
  formas: [
    { formaPagamentoId: BOLETO, valor: 6000 },
    { formaPagamentoId: DINHEIRO, valor: 4000 },
  ],
};

/**
 * As duas somas que fazem o modelo de duas camadas ser honesto.
 *
 * As mesmas regras vivem em `fn_salvar_lancamento` e em duas constraint triggers
 * do banco. Aqui elas existem para o erro aparecer no CAMPO, e não como um raise
 * do Postgres num toast. Cada bloco tem uma linha de controle: a forma única, que
 * é o caso de 5.050 dos 5.930 lançamentos, não pode ter sido endurecida junto.
 */
describe("formulário com duas ou mais formas de pagamento", () => {
  it("aceita a divisão que fecha nos dois níveis", () => {
    const r = lancamentoFormSchema.safeParse(formDuasFormas);
    expect(r.success).toBe(true);
  });

  it("recusa quando a soma das FORMAS não fecha com o valor", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formDuasFormas,
      formas: [
        { formaPagamentoId: BOLETO, valor: "6.000,00" },
        { formaPagamentoId: DINHEIRO, valor: "3.000,00" },
      ],
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const erro = r.error.issues.find(
      (issue) => issue.path.join(".") === "formas",
    );
    expect(erro?.message).toBe(
      "A soma das formas precisa ser igual ao valor do lançamento",
    );
  });

  it("recusa quando as PARCELAS de uma forma não fecham com ela, apontando a forma", () => {
    // Boleto declara 6.000 mas as parcelas dele somam 5.000. O total do
    // lançamento continua fechando (a diferença foi para o dinheiro), então só a
    // soma por forma pega este caso — é exatamente o que ela existe para pegar.
    const r = lancamentoFormSchema.safeParse({
      ...formDuasFormas,
      parcelas: [
        { valor: "2.000,00", dataVencimento: "2026-09-10", formaPagamentoId: BOLETO },
        { valor: "2.000,00", dataVencimento: "2026-10-10", formaPagamentoId: BOLETO },
        { valor: "1.000,00", dataVencimento: "2026-11-10", formaPagamentoId: BOLETO },
        { valor: "5.000,00", dataVencimento: "2026-09-05", formaPagamentoId: DINHEIRO },
      ],
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const erro = r.error.issues.find((issue) =>
      issue.path.join(".").startsWith("formas."),
    );
    expect(erro?.message).toBe(
      "As parcelas desta forma não fecham com o valor dela",
    );
  });

  it("recusa a mesma forma duas vezes", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formDuasFormas,
      formas: [
        { formaPagamentoId: BOLETO, valor: "6.000,00" },
        { formaPagamentoId: BOLETO, valor: "4.000,00" },
      ],
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(
      r.error.issues.some((issue) =>
        issue.message.includes("mesma forma aparece duas vezes"),
      ),
    ).toBe(true);
  });

  it("recusa parcela que não diz de qual forma é", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formDuasFormas,
      parcelas: [
        ...formDuasFormas.parcelas.slice(0, 3),
        { valor: "4.000,00", dataVencimento: "2026-09-05", formaPagamentoId: "" },
      ],
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const erro = r.error.issues.find(
      (issue) => issue.path.join(".") === "parcelas.3.formaPagamentoId",
    );
    expect(erro?.message).toBe("Escolha a forma desta parcela");
  });

  it("LINHA DE CONTROLE: com UMA forma nada disso é cobrado", () => {
    // Uma forma leva o total, a coluna de valor dela não está na tela e a
    // parcela única vem do cabeçalho. Se este caso passar a ser recusado, a tela
    // mais usada do módulo para de salvar.
    const r = lancamentoFormSchema.safeParse({
      ...formDuasFormas,
      parcelas: [{ valor: "", dataVencimento: "", formaPagamentoId: BOLETO }],
      dataVencimento: "2026-09-10",
      formas: [{ formaPagamentoId: BOLETO, valor: "" }],
    });
    expect(r.success).toBe(true);
  });

  it("LINHA DE CONTROLE: lançamento sem forma nenhuma segue válido", () => {
    // É o estado dos 880 lançamentos antigos e de tudo o que o RH e a aprovação
    // de OC criam: sem forma declarada, o banco roteia pelo cabeçalho.
    const r = lancamentoFormSchema.safeParse({
      ...formDuasFormas,
      parcelas: [{ valor: "", dataVencimento: "", formaPagamentoId: "" }],
      dataVencimento: "2026-09-10",
      formas: [],
    });
    expect(r.success).toBe(true);
  });
});

describe("servidor: as mesmas duas somas", () => {
  it("aceita a divisão que fecha nos dois níveis", () => {
    expect(lancamentoSchema.safeParse(servidorDuasFormas).success).toBe(true);
  });

  it("recusa a soma das formas fora do valor", () => {
    const r = lancamentoSchema.safeParse({
      ...servidorDuasFormas,
      formas: [
        { formaPagamentoId: BOLETO, valor: 6000 },
        { formaPagamentoId: DINHEIRO, valor: 3000 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("recusa as parcelas de uma forma fora do valor dela", () => {
    const r = lancamentoSchema.safeParse({
      ...servidorDuasFormas,
      parcelas: [
        { valor: 2000, dataVencimento: "2026-09-10", formaPagamentoId: BOLETO },
        { valor: 2000, dataVencimento: "2026-10-10", formaPagamentoId: BOLETO },
        { valor: 1000, dataVencimento: "2026-11-10", formaPagamentoId: BOLETO },
        { valor: 5000, dataVencimento: "2026-09-05", formaPagamentoId: DINHEIRO },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("recusa parcela apontando forma que não está na lista", () => {
    const r = lancamentoSchema.safeParse({
      ...servidorDuasFormas,
      parcelas: [
        { valor: 6000, dataVencimento: "2026-09-10", formaPagamentoId: BOLETO },
        {
          valor: 4000,
          dataVencimento: "2026-09-05",
          formaPagamentoId: "cccc3333-cccc-4ccc-8ccc-cccccccc3333",
        },
      ],
      formas: [
        { formaPagamentoId: BOLETO, valor: 6000 },
        { formaPagamentoId: DINHEIRO, valor: 4000 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("recusa forma no RECEBIMENTO: quem paga ali é o cliente", () => {
    const r = lancamentoSchema.safeParse({
      ...servidorDuasFormas,
      tipo: "a_receber" as const,
      clienteId: "dddd4444-dddd-4ddd-8ddd-dddddddd4444",
      contaBancariaId: "eeee5555-eeee-4eee-8eee-eeeeeeee5555",
      numeroDocumento: "MED-07/2026",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(
      r.error.issues.some((issue) =>
        issue.message.includes("Recebimento não tem forma de pagamento"),
      ),
    ).toBe(true);
  });

  it("LINHA DE CONTROLE: sem formas o servidor não cobra nada disso", () => {
    const r = lancamentoSchema.safeParse({
      ...servidorDuasFormas,
      parcelas: [{ valor: 10000, dataVencimento: "2026-09-10" }],
      formas: [],
    });
    expect(r.success).toBe(true);
  });
});
