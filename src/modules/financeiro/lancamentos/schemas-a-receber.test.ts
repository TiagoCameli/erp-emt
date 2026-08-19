import { describe, expect, it } from "vitest";

import {
  lancamentoFormSchema,
  lancamentoSchema,
  rotuloStatusLancamento,
} from "@/modules/financeiro/lancamentos/schemas";

const CENTRO = "33333333-3333-4333-8333-333333333333";
const CLIENTE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONTA = "55555555-5555-4555-8555-555555555555";

/** Formulário a PAGAR válido, no estado de parcela única (o mais comum). */
const formAPagar = {
  tipo: "a_pagar" as const,
  formaPagamentoId: "",
  condicaoPagamentoId: "",
  descricao: "Combustível julho",
  valor: "1.000,00",
  dataCompra: "2026-07-10",
  mesCompetencia: "2026-07",
  dataVencimento: "2026-08-10",
  observacoes: "",
  numeroDocumento: "",
  parcelas: [{ valor: "", dataVencimento: "" }],
  rateios: [{ centroCustoId: CENTRO, valor: "" }],
};

/** O mesmo formulário como A RECEBER, com a trinca que só ele exige. */
const formAReceber = {
  ...formAPagar,
  tipo: "a_receber" as const,
  descricao: "Medição 7 da BR-364 lote 4",
  clienteId: CLIENTE,
  contaBancariaId: CONTA,
  numeroDocumento: "MED-07/2026",
};

/**
 * O que só o a receber exige: pagador, conta de destino e número do documento.
 *
 * As três regras existem em DOIS lugares (aqui e em fn_salvar_lancamento), e é
 * de propósito: o banco é a barreira real, o schema é o que faz o erro aparecer
 * no campo em vez de subir como toast cru do Postgres.
 *
 * A prova que mais importa é a linha de controle: o a pagar NÃO passa a exigir
 * nada disso. Sem ela, apertar o a receber poderia ter quebrado calado a tela
 * mais usada do módulo e todos os casos acima continuariam verdes.
 */
describe("a receber exige o que o a pagar não exige", () => {
  it("aceita o recebimento completo", () => {
    const r = lancamentoFormSchema.safeParse(formAReceber);
    expect(r.success).toBe(true);
  });

  it("recusa sem quem está pagando, apontando o campo", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formAReceber,
      clienteId: "",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const erro = r.error.issues.find(
      (issue) => issue.path.join(".") === "clienteId",
    );
    expect(erro?.message).toBe("Informe quem está pagando");
  });

  it("recusa sem a conta em que o dinheiro entra, apontando o campo", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formAReceber,
      contaBancariaId: "",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const erro = r.error.issues.find(
      (issue) => issue.path.join(".") === "contaBancariaId",
    );
    expect(erro?.message).toBe("Escolha a conta em que o dinheiro vai entrar");
  });

  it("recusa sem número do documento, e só espaço não conta como número", () => {
    for (const numeroDocumento of ["", "   "]) {
      const r = lancamentoFormSchema.safeParse({
        ...formAReceber,
        numeroDocumento,
      });
      expect(r.success).toBe(false);
      if (r.success) continue;
      const erro = r.error.issues.find(
        (issue) => issue.path.join(".") === "numeroDocumento",
      );
      expect(erro?.message).toBe("Informe o número do documento");
    }
  });

  it("LINHA DE CONTROLE: o a pagar segue válido sem nada disso", () => {
    const r = lancamentoFormSchema.safeParse(formAPagar);
    expect(r.success).toBe(true);
  });
});

describe("a receber no schema de servidor", () => {
  const receberServidor = {
    tipo: "a_receber" as const,
    descricao: "Medição 7 da BR-364 lote 4",
    valor: 1000,
    dataCompra: "2026-07-10",
    mesCompetencia: "2026-07-01",
    dataVencimento: "2026-08-10",
    clienteId: CLIENTE,
    contaBancariaId: CONTA,
    numeroDocumento: "MED-07/2026",
    parcelas: [{ valor: 1000, dataVencimento: "2026-08-10" }],
    rateios: [{ centroCustoId: CENTRO, valor: 1000 }],
  };

  it("aceita o recebimento completo", () => {
    expect(lancamentoSchema.safeParse(receberServidor).success).toBe(true);
  });

  it("recusa a falta de cada um dos três", () => {
    for (const campo of [
      "clienteId",
      "contaBancariaId",
      "numeroDocumento",
    ] as const) {
      const r = lancamentoSchema.safeParse({
        ...receberServidor,
        [campo]: undefined,
      });
      expect(r.success, `deveria recusar sem ${campo}`).toBe(false);
    }
  });

  it("LINHA DE CONTROLE: o MESMO payload como a pagar passa sem os três", () => {
    const r = lancamentoSchema.safeParse({
      ...receberServidor,
      tipo: "a_pagar" as const,
      clienteId: undefined,
      contaBancariaId: undefined,
      numeroDocumento: undefined,
    });
    expect(r.success).toBe(true);
  });
});

/**
 * Centro de custo é obrigatório. A lista vazia era aceita pelo formulário e
 * recusada pelo banco: quem lançava sem centro levava o raise do Postgres num
 * toast, sem campo apontado.
 */
describe("centro de custo obrigatório", () => {
  it("o formulário recusa a lista vazia, apontando o rateio", () => {
    const r = lancamentoFormSchema.safeParse({ ...formAPagar, rateios: [] });
    expect(r.success).toBe(false);
    if (r.success) return;
    const erro = r.error.issues.find(
      (issue) => issue.path.join(".") === "rateios",
    );
    expect(erro?.message).toBe("Escolha o centro de custo");
  });

  it("com UM centro, o valor da linha pode vir vazio (o envio usa o total)", () => {
    const r = lancamentoFormSchema.safeParse({
      ...formAPagar,
      rateios: [{ centroCustoId: CENTRO, valor: "" }],
    });
    expect(r.success).toBe(true);
  });

  it("com DOIS, a soma volta a ser cobrada", () => {
    const naoFecha = lancamentoFormSchema.safeParse({
      ...formAPagar,
      rateios: [
        { centroCustoId: CENTRO, valor: "600,00" },
        { centroCustoId: CENTRO, valor: "300,00" },
      ],
    });
    expect(naoFecha.success).toBe(false);

    const fecha = lancamentoFormSchema.safeParse({
      ...formAPagar,
      rateios: [
        { centroCustoId: CENTRO, valor: "600,00" },
        { centroCustoId: CENTRO, valor: "400,00" },
      ],
    });
    expect(fecha.success).toBe(true);
  });

  it("o servidor também recusa a lista vazia", () => {
    const r = lancamentoSchema.safeParse({
      tipo: "a_pagar" as const,
      descricao: "Combustível julho",
      valor: 1000,
      dataCompra: "2026-07-10",
      mesCompetencia: "2026-07-01",
      parcelas: [{ valor: 1000, dataVencimento: "2026-08-10" }],
      rateios: [],
    });
    expect(r.success).toBe(false);
  });
});

/**
 * Recebível quitado é "Recebido", não "Pago": quem paga é o cliente. O status no
 * banco é o mesmo ('pago') para os dois tipos, então o rótulo é a única coisa que
 * separa os dois na tela — e a exportação para Excel usa esta mesma função, senão
 * a planilha contradiz a lista.
 */
describe("rótulo de status por tipo", () => {
  it("traduz os dois estados do a receber", () => {
    expect(rotuloStatusLancamento("a_pagar", "a_receber")).toBe("A receber");
    expect(rotuloStatusLancamento("pago", "a_receber")).toBe("Recebido");
  });

  it("LINHA DE CONTROLE: o a pagar continua dizendo A pagar e Pago", () => {
    expect(rotuloStatusLancamento("a_pagar", "a_pagar")).toBe("A pagar");
    expect(rotuloStatusLancamento("pago", "a_pagar")).toBe("Pago");
  });

  it("os status que não dependem do tipo dizem o mesmo nos dois", () => {
    for (const tipo of ["a_pagar", "a_receber"] as const) {
      expect(rotuloStatusLancamento("previsto", tipo)).toBe("Previsto");
      expect(rotuloStatusLancamento("cancelado", tipo)).toBe("Cancelado");
    }
  });
});
