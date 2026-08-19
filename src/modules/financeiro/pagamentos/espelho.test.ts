import { describe, expect, it } from "vitest";

import { montarEspelhoPagamento } from "@/modules/financeiro/pagamentos/espelho";

const LINHA = {
  id: "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
  numero_parcela: 2,
  data_vencimento: "2026-07-06",
  valor: "1000.00",
  desconto: "50.00",
  juros: "20.00",
  valor_liquido: "970.00",
  status: "pago",
  data_pagamento: "2026-06-26",
  contas_bancarias: { nome: "BANCO DO BRASIL 102.124-9" },
  lancamentos: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    numero: "LAN-2026-0001",
    descricao: "REFERENTE PAGAMENTO DE SALARIO",
    valor: "3000.00",
    status: "pago",
    // Correção da revisão: sem o tipo do lançamento, um recebível em aberto
    // imprime o código cru "a_pagar" invertido (ver rotuloStatusLancamento).
    tipo: "a_pagar",
    mes_competencia: "2026-07-01",
    observacoes: null,
    fornecedores: { razao_social: "JOAO SANTIAGO DE OLIVEIRA" },
    categorias_financeiras: { nome: "Salário Mão de Obra" },
    formas_pagamento: { nome: "PIX" },
    lancamento_rateios: [
      {
        valor: "1500.00",
        centros_custo: { nome: "009 - Lote 09", codigo: "009" },
      },
      {
        valor: "1500.00",
        centros_custo: { nome: "003 - Ramal do Gama", codigo: "003" },
      },
    ],
    /*
      As TRÊS parcelas do lançamento de R$ 3.000,00, e não só a que este
      espelho imprime: é delas que sai o resumo "quanto já saiu e quanto
      falta". A fixture fecha com o pai de propósito (3 x R$ 1.000,00), porque
      fixture de dinheiro que não poderia existir no banco prova a crença de
      quem a escreveu, não o código.

      A parcela 2 é a impressa: mesmos valores da linha de cima, com desconto e
      juros, para o resumo e a parcela nunca discordarem sobre o mesmo dado.
    */
    lancamento_parcelas: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        numero_parcela: 1,
        data_vencimento: "2026-06-06",
        valor: "1000.00",
        desconto: "0.00",
        juros: "0.00",
        valor_liquido: "1000.00",
        status: "pago",
        data_pagamento: "2026-05-26",
      },
      {
        id: "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
        numero_parcela: 2,
        data_vencimento: "2026-07-06",
        valor: "1000.00",
        desconto: "50.00",
        juros: "20.00",
        valor_liquido: "970.00",
        status: "pago",
        data_pagamento: "2026-06-26",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        numero_parcela: 3,
        data_vencimento: "2026-08-06",
        valor: "1000.00",
        desconto: "0.00",
        juros: "0.00",
        valor_liquido: "1000.00",
        status: "pendente",
        data_pagamento: null,
      },
    ],
  },
};

describe("montarEspelhoPagamento", () => {
  it("traz a parcela paga com desconto, juros e líquido", () => {
    const espelho = montarEspelhoPagamento(LINHA);
    expect(espelho.numeroParcela).toBe(2);
    expect(espelho.valor).toBe(1000);
    expect(espelho.desconto).toBe(50);
    expect(espelho.juros).toBe(20);
    expect(espelho.valorLiquido).toBe(970);
    expect(espelho.contaNome).toBe("BANCO DO BRASIL 102.124-9");
    expect(espelho.dataPagamento).toBe("2026-06-26");
  });

  it("o líquido fecha com as partes impressas ao lado", () => {
    // Trava a semântica de 11/08/2026: valor - desconto + juros. Se o papel
    // mostrar partes que não somam o líquido, quem lê perde a confiança no
    // documento inteiro.
    const espelho = montarEspelhoPagamento(LINHA);
    expect(espelho.valor - espelho.desconto + espelho.juros).toBe(
      espelho.valorLiquido,
    );
  });

  it("carrega o cabeçalho do lançamento pai, porque parcela sozinha não comprova nada", () => {
    const espelho = montarEspelhoPagamento(LINHA);
    expect(espelho.lancamentoId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(espelho.lancamentoNumero).toBe("LAN-2026-0001");
    expect(espelho.fornecedorNome).toBe("JOAO SANTIAGO DE OLIVEIRA");
    expect(espelho.categoriaNome).toBe("Salário Mão de Obra");
    expect(espelho.formaPagamentoNome).toBe("PIX");
    expect(espelho.lancamentoValor).toBe(3000);
    expect(espelho.lancamentoDescricao).toBe("REFERENTE PAGAMENTO DE SALARIO");
    // O tipo do lançamento precisa vir junto: é o dado que
    // rotuloStatusLancamento exige para não imprimir "a_pagar" cru num
    // recebível em aberto (correção da revisão da task).
    expect(espelho.lancamentoTipo).toBe("a_pagar");
    expect(espelho.lancamentoStatus).toBe("pago");
  });

  it("traz o rateio do lançamento pai, somando o valor dele", () => {
    const espelho = montarEspelhoPagamento(LINHA);
    expect(espelho.rateios).toHaveLength(2);
    expect(espelho.rateios.reduce((soma, r) => soma + r.valor, 0)).toBe(
      espelho.lancamentoValor,
    );
  });

  it("rateio sem centro de custo cai no mesmo texto que a planilha e a OC usam", () => {
    // "Sem centro de custo", igual ao espelho de lançamento e ao de OC: os três
    // descrevem a mesma ausência e não podem divergir entre si.
    const espelho = montarEspelhoPagamento({
      ...LINHA,
      lancamentos: {
        ...LINHA.lancamentos,
        lancamento_rateios: [{ valor: "1000.00", centros_custo: null }],
      },
    });
    expect(espelho.rateios[0].centroNome).toBe("Sem centro de custo");
  });

  it("o título do papel identifica lançamento e parcela juntos", () => {
    expect(montarEspelhoPagamento(LINHA).titulo).toBe(
      "LAN-2026-0001 parcela 2",
    );
  });

  it("lançamento sem número ainda gera título utilizável", () => {
    const espelho = montarEspelhoPagamento({
      ...LINHA,
      lancamentos: { ...LINHA.lancamentos, numero: null },
    });
    expect(espelho.titulo).toBe("sem número parcela 2");
  });

  it("parcela sem conta e sem data de pagamento não quebra", () => {
    const espelho = montarEspelhoPagamento({
      ...LINHA,
      contas_bancarias: null,
      data_pagamento: null,
    });
    expect(espelho.contaNome).toBeNull();
    expect(espelho.dataPagamento).toBeNull();
  });

  it("parcela sem lançamento pai devolve nulo em vez de estourar", () => {
    // Não deve acontecer (a FK garante), mas o papel não pode ser a tela que
    // descobre isso com um erro de runtime na frente do usuário.
    const espelho = montarEspelhoPagamento({ ...LINHA, lancamentos: null });
    expect(espelho.lancamentoNumero).toBeNull();
    expect(espelho.fornecedorNome).toBeNull();
    expect(espelho.lancamentoStatus).toBeNull();
    expect(espelho.lancamentoTipo).toBeNull();
    expect(espelho.rateios).toEqual([]);
  });

  it("converte dinheiro de texto sem passar por float", () => {
    const espelho = montarEspelhoPagamento({ ...LINHA, valor: "1234.56" });
    expect(espelho.valor).toBe(1234.56);
  });

  it("a soma do rateio vem das linhas, não do valor do lançamento", () => {
    // Rateio que NÃO fecha com o pai de propósito (700 + 500 = 1.200 contra um
    // lançamento de 3.000): é essa divergência que o total impresso tem que
    // mostrar. Ecoar `lancamentoValor` na linha de total esconderia a
    // divergência exatamente onde ela apareceria.
    const espelho = montarEspelhoPagamento({
      ...LINHA,
      lancamentos: {
        ...LINHA.lancamentos,
        valor: "3000.00",
        lancamento_rateios: [
          {
            valor: "700.00",
            centros_custo: { nome: "009 - Lote 09", codigo: "009" },
          },
          {
            valor: "500.00",
            centros_custo: { nome: "003 - Ramal do Gama", codigo: "003" },
          },
        ],
      },
    });
    expect(espelho.somaRateios).toBe(1200);
    expect(espelho.somaRateios).not.toBe(espelho.lancamentoValor);
  });

  it("rateio que fecha soma o mesmo que o lançamento", () => {
    const espelho = montarEspelhoPagamento(LINHA);
    expect(espelho.somaRateios).toBe(3000);
  });

  it("parcela sem lançamento pai soma zero em vez de estourar", () => {
    expect(
      montarEspelhoPagamento({ ...LINHA, lancamentos: null }).somaRateios,
    ).toBe(0);
  });
});

describe("resumo do lançamento no espelho do pagamento", () => {
  it("diz quantas parcelas foram pagas, quanto saiu e quanto falta", () => {
    const espelho = montarEspelhoPagamento(LINHA);
    const resumo = espelho.resumoParcelas;
    if (!resumo) throw new Error("o resumo não deveria ser nulo com pai");

    // Duas pagas de três: é a pergunta que quem assina o pagamento faz e que o
    // papel não respondia.
    expect(resumo.pagas.quantidade).toBe(2);
    expect(resumo.aPagar.quantidade).toBe(1);
    expect(resumo.total.quantidade).toBe(3);

    // Pagas somam o LÍQUIDO (1.000,00 + 970,00), que é o dinheiro que saiu da
    // conta, e não o valor de face. Esta é a linha de controle do teste: se
    // alguém trocar a base por `valor`, o número vira 2.000,00 e o teste cai.
    expect(resumo.pagas.valor).toBe(1970);
    // Em aberto soma o VALOR, que é a dívida.
    expect(resumo.aPagar.valor).toBe(1000);
    expect(resumo.total.valor).toBe(2970);

    expect(resumo.proximoVencimento).toBe("2026-08-06");
    expect(resumo.ultimoPagamento).toBe("2026-06-26");
  });

  it("o resumo e a parcela impressa contam a mesma parcela", () => {
    // A parcela deste espelho está DENTRO do resumo do lançamento. Se a
    // consulta trouxesse só as irmãs, "2 de 3 pagas" excluiria justamente a
    // que o papel afirma ter sido paga.
    const espelho = montarEspelhoPagamento(LINHA);
    const resumo = espelho.resumoParcelas;
    if (!resumo) throw new Error("o resumo não deveria ser nulo com pai");
    expect(resumo.pagas.valor).toBeGreaterThanOrEqual(espelho.valorLiquido);
  });

  it("sem lançamento pai o resumo é nulo, e não um bloco de zeros", () => {
    // Zero em "já pago" e "em aberto" seria lido como "nada pago, nada a
    // pagar", que é uma afirmação; nulo faz o papel omitir o bloco.
    const orfa = { ...LINHA, lancamentos: null };
    expect(montarEspelhoPagamento(orfa).resumoParcelas).toBeNull();
  });
});
