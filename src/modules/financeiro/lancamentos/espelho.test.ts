import { describe, expect, it } from "vitest";

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
