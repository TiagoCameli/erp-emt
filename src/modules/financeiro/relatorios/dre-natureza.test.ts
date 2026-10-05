import { describe, expect, it } from "vitest";

import {
  agruparDrePorNatureza,
  cartoesDoDre,
  NATUREZAS,
  type LinhaDreAgregada,
} from "@/modules/financeiro/relatorios/calculo";

/**
 * Linha do jeito que `fn_rel_dre` devolve: NUMERIC chega como string do
 * PostgREST, e é assim que os casos abaixo escrevem o valor de propósito.
 */
function linha(
  tipo: "a_receber" | "a_pagar",
  natureza: string,
  categoria: string,
  total: string,
  retencao?: string,
): LinhaDreAgregada {
  return {
    tipo,
    natureza,
    categoria,
    categoria_id: `id-${categoria}`,
    total,
    retencao,
  };
}

describe("agruparDrePorNatureza", () => {
  it("as naturezas são quatro, na ordem do relatório", () => {
    expect(NATUREZAS).toEqual([
      "operacional",
      "financeira",
      "movimentacao",
      "investimento",
    ]);
  });

  it("separa os quatro blocos e mantém cada linha no seu", () => {
    const dre = agruparDrePorNatureza([
      linha("a_receber", "operacional", "Contrato", "100000.00"),
      linha("a_pagar", "operacional", "Combustível", "30000.00"),
      linha("a_receber", "financeira", "Juros de aplicações", "500.00"),
      linha("a_pagar", "financeira", "Tarifa Bancária", "120.00"),
      linha("a_receber", "movimentacao", "Resgate de aplicação", "900000.00"),
      linha("a_pagar", "movimentacao", "Aplicação financeira", "900000.00"),
      linha("a_pagar", "investimento", "Aquisição de Equipamento", "450000.00"),
    ]);

    expect(dre.operacional.totalReceitas).toBe(100000);
    expect(dre.operacional.totalDespesas).toBe(30000);
    expect(dre.operacional.resultado).toBe(70000);

    expect(dre.financeiro.totalReceitas).toBe(500);
    expect(dre.financeiro.totalDespesas).toBe(120);
    expect(dre.financeiro.resultado).toBe(380);

    expect(dre.movimentacao.totalReceitas).toBe(900000);
    expect(dre.movimentacao.totalDespesas).toBe(900000);

    expect(dre.investimento.totalDespesas).toBe(450000);
    expect(dre.investimento.despesas.map((l) => l.categoria)).toEqual([
      "Aquisição de Equipamento",
    ]);
    // E nenhum outro bloco a recebeu.
    expect(dre.operacional.despesas.map((l) => l.categoria)).toEqual([
      "Combustível",
    ]);
  });

  it("o investimento fica FORA do resultado, por maior que seja", () => {
    // Decisão D3 (03/10/2026): comprar a escavadeira troca dinheiro por
    // máquina. Se o CAPEX entrasse, os R$ 5,2 mi de jan-set/2026 virariam
    // prejuízo das obras.
    const sem = agruparDrePorNatureza([
      linha("a_receber", "operacional", "Contrato", "100000.00"),
      linha("a_pagar", "operacional", "Combustível", "30000.00"),
    ]);
    const com = agruparDrePorNatureza([
      linha("a_receber", "operacional", "Contrato", "100000.00"),
      linha("a_pagar", "operacional", "Combustível", "30000.00"),
      linha("a_pagar", "investimento", "Compra de Terreno", "5210383.43"),
    ]);

    expect(sem.resultado).toBe(70000);
    expect(com.resultado).toBe(70000);
    expect(com.investimento.totalDespesas).toBe(5210383.43);
  });

  it("o resultado é operacional mais financeiro, e a movimentação fica fora", () => {
    const dre = agruparDrePorNatureza([
      linha("a_receber", "operacional", "Contrato", "100000.00"),
      linha("a_pagar", "operacional", "Combustível", "30000.00"),
      linha("a_receber", "financeira", "Juros de aplicações", "500.00"),
      linha("a_pagar", "financeira", "Tarifa Bancária", "120.00"),
      linha("a_receber", "movimentacao", "Resgate de aplicação", "900000.00"),
      linha("a_pagar", "movimentacao", "Aplicação financeira", "900000.00"),
    ]);

    expect(dre.resultado).toBe(70380);
  });

  it("varredura DESEQUILIBRADA não move o resultado nem um centavo", () => {
    // A linha de controle desta suíte. O caso fácil é aplicação e resgate do
    // mesmo valor: aí a movimentação se cancela sozinha e o teste passaria mesmo
    // se ela entrasse na soma. Aqui resgatou R$ 3.571.015,96 MAIS do que
    // aplicou (que é literalmente o furo medido na conta da Caixa em
    // 22/08/2026): se a movimentação entrasse no resultado, o mês viraria
    // superávit de milhões.
    const semVarredura = agruparDrePorNatureza([
      linha("a_receber", "operacional", "Contrato", "10000.00"),
      linha("a_pagar", "operacional", "Combustível", "40000.00"),
    ]);
    const comVarredura = agruparDrePorNatureza([
      linha("a_receber", "operacional", "Contrato", "10000.00"),
      linha("a_pagar", "operacional", "Combustível", "40000.00"),
      linha("a_receber", "movimentacao", "Resgate de aplicação", "8093863.71"),
      linha("a_pagar", "movimentacao", "Aplicação financeira", "4522847.75"),
    ]);

    expect(semVarredura.resultado).toBe(-30000);
    expect(comVarredura.resultado).toBe(-30000);
    // E o desequilíbrio continua VISÍVEL, no bloco dele: some do resultado, não
    // da tela.
    expect(
      comVarredura.movimentacao.totalReceitas -
        comVarredura.movimentacao.totalDespesas,
    ).toBe(3571015.96);
  });

  it("natureza desconhecida cai em operacional em vez de desaparecer", () => {
    const dre = agruparDrePorNatureza([
      linha("a_pagar", "natureza_que_ainda_nao_existe", "Alguma coisa", "700.00"),
    ]);

    expect(dre.operacional.totalDespesas).toBe(700);
    expect(dre.operacional.despesas).toHaveLength(1);
    expect(dre.financeiro.despesas).toHaveLength(0);
    expect(dre.movimentacao.despesas).toHaveLength(0);
    expect(dre.investimento.despesas).toHaveLength(0);
  });

  it("soma duas categorias diferentes e ordena da maior para a menor", () => {
    const dre = agruparDrePorNatureza([
      linha("a_pagar", "operacional", "Combustível", "1000.00"),
      linha("a_pagar", "operacional", "Pedágio", "5000.00"),
    ]);

    expect(dre.operacional.despesas.map((l) => l.categoria)).toEqual([
      "Pedágio",
      "Combustível",
    ]);
    expect(dre.operacional.totalDespesas).toBe(6000);
  });

  it("bloco sem nenhuma linha vem zerado, não indefinido", () => {
    const dre = agruparDrePorNatureza([
      linha("a_receber", "operacional", "Contrato", "10.00"),
    ]);

    expect(dre.financeiro).toEqual({
      receitas: [],
      despesas: [],
      totalReceitas: 0,
      totalDespesas: 0,
      retencaoReceitas: 0,
      resultado: 0,
    });
    expect(dre.movimentacao.resultado).toBe(0);
    expect(dre.investimento.resultado).toBe(0);
  });

  it("lista vazia devolve os quatro blocos zerados", () => {
    const dre = agruparDrePorNatureza([]);

    expect(dre.resultado).toBe(0);
    expect(dre.operacional.totalReceitas).toBe(0);
    expect(dre.movimentacao.totalDespesas).toBe(0);
  });
});

describe("retenção na fonte no DRE", () => {
  it("receita líquida é o total; bruta é total mais retenção", () => {
    const dre = agruparDrePorNatureza([
      linha("a_receber", "operacional", "Medição", "900000.00", "100000.00"),
      linha("a_receber", "operacional", "Outras receitas", "5000.00", "0"),
      linha("a_pagar", "operacional", "Combustível", "30000.00"),
    ]);

    expect(dre.operacional.totalReceitas).toBe(905000);
    expect(dre.operacional.retencaoReceitas).toBe(100000);
    // A retenção fica também na linha, para a planilha.
    const medicao = dre.operacional.receitas.find((l) => l.categoria === "Medição");
    expect(medicao?.valor).toBe(900000);
    expect(medicao?.retencao).toBe(100000);
    // O resultado é sobre a LÍQUIDA: retenção é imposto antecipado, não receita.
    expect(dre.operacional.resultado).toBe(875000);
  });

  it("linha sem a coluna (contrato antigo) conta retenção zero", () => {
    const dre = agruparDrePorNatureza([
      { tipo: "a_receber", natureza: "operacional", categoria: "Medição", categoria_id: "m", total: "10.00" },
    ]);
    expect(dre.operacional.retencaoReceitas).toBe(0);
  });
});

describe("cartoesDoDre", () => {
  // Números reais de jan-set/2026, depois das migrations de 04/10/2026.
  const dre = agruparDrePorNatureza([
    linha("a_receber", "operacional", "Medição", "47015864.76", "3511709.23"),
    linha("a_pagar", "operacional", "Custos da obra", "40549003.51"),
    linha("a_pagar", "financeira", "Tarifa Bancária", "14159.80"),
    linha("a_pagar", "investimento", "Aquisição de Equipamento", "5210383.43"),
    linha("a_pagar", "movimentacao", "Pagamento de Empréstimo", "10106200.81"),
    linha("a_receber", "movimentacao", "Resgate de aplicação", "4504677.46"),
  ]);
  const cartoes = cartoesDoDre(dre);

  it("os quatro cartões fecham ao centavo", () => {
    expect(cartoes.receitaOperacional).toBe(47015864.76);
    expect(cartoes.despesaOperacional).toBe(40549003.51);
    expect(cartoes.resultadoFinanceiro).toBe(-14159.8);
    // receita operacional - despesa operacional + resultado financeiro
    expect(cartoes.resultadoDoPeriodo).toBe(6452701.45);
    expect(
      Math.round(
        (cartoes.receitaOperacional -
          cartoes.despesaOperacional +
          cartoes.resultadoFinanceiro) *
          100,
      ) / 100,
    ).toBe(cartoes.resultadoDoPeriodo);
    // E é o mesmo resultado da tabela.
    expect(cartoes.resultadoDoPeriodo).toBe(
      Math.round(dre.resultado * 100) / 100,
    );
  });

  it("investimento e movimentação ficam fora dos quatro", () => {
    expect(cartoes.investimentosNoPeriodo).toBe(5210383.43);
    // Se o CAPEX ou a prestação entrassem, o resultado mudaria.
    expect(cartoes.resultadoDoPeriodo).toBe(
      Math.round((47015864.76 - 40549003.51 - 14159.8) * 100) / 100,
    );
  });
});
