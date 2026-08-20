import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";

import { resumirParcelas } from "@/modules/financeiro/lancamentos/espelho";

import { montarEspelhoLancamento } from "@/modules/financeiro/lancamentos/espelho";

const LINHA = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  numero: "LAN-2026-0001",
  descricao: "REFERENTE ABASTECIMENTO",
  valor: "1000.00",
  status: "pago",
  tipo: "a_pagar",
  data_compra: "2026-08-01",
  data_vencimento: "2026-08-12",
  mes_competencia: "2026-08-01",
  observacoes: "Documento: 123",
  fornecedores: { razao_social: "AUTO POSTO PROGRESSO" },
  categorias_financeiras: { nome: "Combustível" },
  formas_pagamento: { nome: "PIX" },
  // Uma forma: o cabeçalho guarda ela e o bloco espelha o total.
  lancamento_formas: [{ valor: "1000.00", formas_pagamento: { nome: "PIX" } }],
  lancamento_parcelas: [
    {
      id: "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
      numero_parcela: 1,
      data_vencimento: "2026-08-12",
      valor: "1000.00",
      desconto: "50.00",
      juros: "20.00",
      valor_liquido: "970.00",
      status: "pago",
      data_pagamento: "2026-08-12",
      contas_bancarias: { nome: "BANCO DO BRASIL 102.124-9" },
    },
  ],
  lancamento_rateios: [
    {
      valor: "600.00",
      centros_custo: { nome: "009 - Lote 09", codigo: "009" },
    },
    {
      valor: "400.00",
      centros_custo: { nome: "Escritório Central", codigo: null },
    },
  ],
};

describe("montarEspelhoLancamento", () => {
  it("traz o cabeçalho com fornecedor, categoria e forma", () => {
    const espelho = montarEspelhoLancamento(LINHA);
    expect(espelho.numero).toBe("LAN-2026-0001");
    expect(espelho.fornecedorNome).toBe("AUTO POSTO PROGRESSO");
    expect(espelho.categoriaNome).toBe("Combustível");
    expect(espelho.formaPagamentoNome).toBe("PIX");
    expect(espelho.valor).toBe(1000);
  });

  it("traz as parcelas com desconto, juros e líquido", () => {
    const [parcela] = montarEspelhoLancamento(LINHA).parcelas;
    expect(parcela.valor).toBe(1000);
    expect(parcela.desconto).toBe(50);
    expect(parcela.juros).toBe(20);
    expect(parcela.valorLiquido).toBe(970);
    expect(parcela.contaNome).toBe("BANCO DO BRASIL 102.124-9");
  });

  it("carrega o tipo do lançamento, senão o rótulo do status sai invertido para um lançamento a receber", () => {
    // A montagem só precisa TRANSPORTAR o tipo: quem decide o rótulo
    // ("A receber" em vez do código cru) é rotuloStatusLancamento, na página.
    // Sem o tipo aqui, a página não tem como chamar essa função direito.
    const espelho = montarEspelhoLancamento({ ...LINHA, tipo: "a_receber" });
    expect(espelho.tipo).toBe("a_receber");
  });

  it("o rateio soma o valor do lançamento", () => {
    const espelho = montarEspelhoLancamento(LINHA);
    const soma = espelho.rateios.reduce((total, r) => total + r.valor, 0);
    expect(soma).toBe(espelho.valor);
  });

  it("ordena as parcelas por número, para o papel sair na ordem do carnê", () => {
    const espelho = montarEspelhoLancamento({
      ...LINHA,
      lancamento_parcelas: [
        { ...LINHA.lancamento_parcelas[0], numero_parcela: 2 },
        { ...LINHA.lancamento_parcelas[0], numero_parcela: 1 },
      ],
    });
    expect(espelho.parcelas.map((p) => p.numeroParcela)).toEqual([1, 2]);
  });

  it("sem fornecedor, categoria ou forma não quebra: cai em nulo", () => {
    const espelho = montarEspelhoLancamento({
      ...LINHA,
      fornecedores: null,
      categorias_financeiras: null,
      formas_pagamento: null,
    });
    expect(espelho.fornecedorNome).toBeNull();
    expect(espelho.categoriaNome).toBeNull();
    expect(espelho.formaPagamentoNome).toBeNull();
  });

  it("pago por duas formas, o papel diz a divisão em vez de ficar em branco", () => {
    // O cabeçalho vai NULO de propósito num lançamento de várias formas. Sem
    // esta linha o espelho imprimiria "Forma de pagamento: —" num documento que
    // tem duas, e quem lê no papel não tem para onde clicar.
    const espelho = montarEspelhoLancamento({
      ...LINHA,
      formas_pagamento: null,
      lancamento_formas: [
        { valor: "200.00", formas_pagamento: { nome: "Dinheiro" } },
        { valor: "800.00", formas_pagamento: { nome: "Boleto" } },
      ],
    });
    // Maior primeiro, e com o valor de cada uma.
    expect(espelho.formaPagamentoNome).toBe(
      `Boleto ${formatarBRL(800)} + Dinheiro ${formatarBRL(200)}`,
    );
  });

  it("acima de três formas vira a contagem: o espelho é de uma folha", () => {
    const espelho = montarEspelhoLancamento({
      ...LINHA,
      formas_pagamento: null,
      lancamento_formas: [
        { valor: "250.00", formas_pagamento: { nome: "Dinheiro" } },
        { valor: "250.00", formas_pagamento: { nome: "Boleto" } },
        { valor: "250.00", formas_pagamento: { nome: "PIX" } },
        { valor: "250.00", formas_pagamento: { nome: "TED" } },
      ],
    });
    expect(espelho.formaPagamentoNome).toBe("4 formas de pagamento");
  });

  it("LINHA DE CONTROLE: com UMA forma, quem manda é o cabeçalho", () => {
    // Se a divisão vazasse para o caso comum, todo espelho passaria a imprimir
    // "PIX R$ 1.000,00" onde sempre imprimiu "PIX".
    expect(montarEspelhoLancamento(LINHA).formaPagamentoNome).toBe("PIX");
  });

  it("lançamento sem parcela e sem rateio sai com listas vazias, não com erro", () => {
    const espelho = montarEspelhoLancamento({
      ...LINHA,
      lancamento_parcelas: [],
      lancamento_rateios: [],
    });
    expect(espelho.parcelas).toEqual([]);
    expect(espelho.rateios).toEqual([]);
  });

  it("converte dinheiro de texto para número sem passar por float do banco", () => {
    // O PostgREST devolve numeric como string de propósito. Number() aqui é o
    // único ponto de conversão, e é sobre o texto exato do banco.
    const espelho = montarEspelhoLancamento({ ...LINHA, valor: "1234.56" });
    expect(espelho.valor).toBe(1234.56);
  });
});

/** Parcela já no formato do espelho, para exercitar o resumo sem passar pelo banco. */
function parcela(
  overrides: Partial<
    ReturnType<typeof montarEspelhoLancamento>["parcelas"][number]
  > = {},
) {
  return {
    id: "p",
    numeroParcela: 1,
    dataVencimento: "2026-08-12",
    valor: 1000,
    desconto: 0,
    juros: 0,
    valorLiquido: 1000,
    status: "pendente" as const,
    dataPagamento: null,
    contaNome: null,
    ...overrides,
  };
}

describe("resumirParcelas", () => {
  it("pagas somam o LÍQUIDO, em aberto somam o VALOR", () => {
    // As duas bases são diferentes de propósito, e são as mesmas dos KPIs da
    // tela de Lançamentos. No banco hoje: 23 das 6.858 parcelas pagas têm
    // líquido diferente do valor (20 com desconto, 3 com juros), somando
    // R$ 30.810,30 de diferença. Somar o valor nas pagas mentiria sobre o
    // caixa; somar o líquido nas em aberto trocaria a dívida por uma projeção.
    const resumo = resumirParcelas([
      parcela({ id: "1", status: "pago", valor: 1000, desconto: 50, valorLiquido: 950 }),
      parcela({ id: "2", status: "pendente", valor: 1000, valorLiquido: 1000 }),
    ]);
    expect(resumo.pagas).toEqual({ quantidade: 1, valor: 950 });
    expect(resumo.aPagar).toEqual({ quantidade: 1, valor: 1000 });
    expect(resumo.total).toEqual({ quantidade: 2, valor: 1950 });
  });

  it("em_revisao continua sendo dívida viva, não some do resumo", () => {
    // Usa `ehParcelaAberta`, cuja regra é "não pago e não cancelado": revisão
    // é pedido de ajuste, não baixa. Escrever `!== "pago"` aqui faria o papel
    // discordar do filtro de atraso e do resumo do cabeçalho.
    const resumo = resumirParcelas([
      parcela({ id: "1", status: "em_revisao", valor: 300 }),
      parcela({ id: "2", status: "aprovado", valor: 200 }),
    ]);
    expect(resumo.aPagar).toEqual({ quantidade: 2, valor: 500 });
    expect(resumo.pagas.quantidade).toBe(0);
  });

  it("cancelada não é paga nem devida, e ainda assim o total fecha", () => {
    // Sem o grupo de canceladas, a linha de total do papel deixaria de bater
    // com as linhas impressas acima dela na primeira parcela cancelada.
    const resumo = resumirParcelas([
      parcela({ id: "1", status: "pago", valorLiquido: 400 }),
      parcela({ id: "2", status: "pendente", valor: 300 }),
      parcela({ id: "3", status: "cancelado", valor: 100 }),
    ]);
    expect(resumo.pagas.quantidade).toBe(1);
    expect(resumo.aPagar.quantidade).toBe(1);
    expect(resumo.canceladas).toEqual({ quantidade: 1, valor: 100 });
    expect(resumo.total).toEqual({ quantidade: 3, valor: 800 });
  });

  it("próximo vencimento é o mais ANTIGO em aberto, e ignora as pagas", () => {
    const resumo = resumirParcelas([
      // Paga com vencimento antigo: não pode ser escolhida.
      parcela({ id: "1", status: "pago", dataVencimento: "2026-01-05", dataPagamento: "2026-01-05" }),
      parcela({ id: "2", status: "pendente", dataVencimento: "2026-10-05" }),
      parcela({ id: "3", status: "pendente", dataVencimento: "2026-09-05" }),
    ]);
    expect(resumo.proximoVencimento).toBe("2026-09-05");
  });

  it("último pagamento é o mais RECENTE entre as pagas", () => {
    const resumo = resumirParcelas([
      parcela({ id: "1", status: "pago", dataPagamento: "2026-07-10" }),
      parcela({ id: "2", status: "pago", dataPagamento: "2026-08-10" }),
    ]);
    expect(resumo.ultimoPagamento).toBe("2026-08-10");
  });

  it("sem parcela em aberto ou sem parcela paga devolve nulo, não data errada", () => {
    const tudoPago = resumirParcelas([
      parcela({ status: "pago", dataPagamento: "2026-07-10" }),
    ]);
    expect(tudoPago.proximoVencimento).toBeNull();

    const nadaPago = resumirParcelas([parcela()]);
    expect(nadaPago.ultimoPagamento).toBeNull();

    const semParcela = resumirParcelas([]);
    expect(semParcela.total).toEqual({ quantidade: 0, valor: 0 });
    expect(semParcela.proximoVencimento).toBeNull();
    expect(semParcela.ultimoPagamento).toBeNull();
  });

  it("parcela em aberto sem data de vencimento não vira 'sem próximo vencimento'", () => {
    // Nulo é descartado da comparação, não escolhido como menor: uma parcela
    // sem data não pode apagar a data das outras.
    const resumo = resumirParcelas([
      parcela({ id: "1", status: "pendente", dataVencimento: null }),
      parcela({ id: "2", status: "pendente", dataVencimento: "2026-09-05" }),
    ]);
    expect(resumo.proximoVencimento).toBe("2026-09-05");
  });
});
