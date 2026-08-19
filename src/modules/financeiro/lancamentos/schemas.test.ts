import { describe, expect, it } from "vitest";

import {
  FILTROS_REVISAO,
  ORIGENS_LANCAMENTO,
  ROTULO_FILTRO_REVISAO,
  lancamentoFormSchema,
  lancamentoSchema,
  rotuloOrigemLancamento,
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
  numeroDocumento: "",
  parcelas: [{ valor: "", dataVencimento: "" }],
  // Centro de custo é obrigatório, e com UM a coluna de valor não aparece na
  // tela: a linha vai com o centro escolhido e o valor vazio, e o envio a
  // preenche com o total. Fixture com `rateios: []` era um lançamento que
  // fn_salvar_lancamento recusa ("nenhum custo existe sem centro de custo"),
  // então provava uma tela impossível.
  rateios: [{ centroCustoId: CENTRO, valor: "" }],
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
    // No servidor o rateio chega já com o valor resolvido pela tela, e ele tem
    // de fechar com o valor do lançamento.
    rateios: [{ centroCustoId: CENTRO, valor: 1000 }],
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

/**
 * O filtro de revisão é de escolha única, então "revisado" sem o complemento
 * deixava a pergunta mais frequente do dia ("o que ainda falta escolher conta?")
 * sem resposta em uma passada: era preciso olhar "sem conta" e depois "conta
 * parcial". Estes casos travam o par e o rótulo de cada opção.
 */
describe("filtro de revisão", () => {
  it("tem o par revisado e não revisado, além dos estados granulares", () => {
    expect(FILTROS_REVISAO).toContain("revisado");
    expect(FILTROS_REVISAO).toContain("nao_revisado");
    expect(FILTROS_REVISAO).toContain("sem_conta");
    expect(FILTROS_REVISAO).toContain("parcial");
    expect(FILTROS_REVISAO).toContain("em_revisao");
  });

  it("toda opção tem rótulo, senão o select mostra o valor cru", () => {
    for (const valor of FILTROS_REVISAO) {
      expect(ROTULO_FILTRO_REVISAO[valor]).toBeTruthy();
      // Valor cru é snake_case; rótulo é texto para gente ler.
      expect(ROTULO_FILTRO_REVISAO[valor]).not.toContain("_");
    }
  });

  it("não revisado e revisado são rótulos distintos e opostos", () => {
    expect(ROTULO_FILTRO_REVISAO.revisado).toBe("Revisado");
    expect(ROTULO_FILTRO_REVISAO.nao_revisado).toBe("Não revisado");
  });
});

describe("rótulo de origem do lançamento", () => {
  // O catálogo é a fonte única do rótulo em três telas do Financeiro: a lista de
  // lançamentos, o detalhe e a fila de aprovação de pagamentos (onde se autoriza
  // dinheiro sair). Antes da onda de correção do review do Bloco 8a, a fila
  // rotulava líquido de folha, guia de imposto e adiantamento como "Manual".
  it("cada origem do catálogo tem rótulo pt-BR próprio, e nenhuma vira Manual por acidente", () => {
    expect(ORIGENS_LANCAMENTO.map(rotuloOrigemLancamento)).toEqual([
      "Ordem de compra",
      "Manual",
      "Diária",
      "Folha de pagamento",
      "Guia da folha",
      "Adiantamento",
    ]);
  });

  it("só a origem manual é rotulada Manual", () => {
    const comRotuloManual = ORIGENS_LANCAMENTO.filter(
      (origem) => rotuloOrigemLancamento(origem) === "Manual",
    );

    expect(comRotuloManual).toEqual(["manual"]);
  });

  it("origem fora do catálogo cai no valor cru, sem quebrar a tela", () => {
    expect(rotuloOrigemLancamento("origem_que_nao_existe")).toBe(
      "origem_que_nao_existe",
    );
  });
});
