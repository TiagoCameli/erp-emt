import { describe, expect, it } from "vitest";

import {
  agruparDrePorNatureza,
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
): LinhaDreAgregada {
  return {
    tipo,
    natureza,
    categoria,
    categoria_id: `id-${categoria}`,
    total,
  };
}

describe("agruparDrePorNatureza", () => {
  it("separa os três blocos e mantém cada linha no seu", () => {
    const dre = agruparDrePorNatureza([
      linha("a_receber", "operacional", "Contrato", "100000.00"),
      linha("a_pagar", "operacional", "Combustível", "30000.00"),
      linha("a_receber", "financeira", "Juros de aplicações", "500.00"),
      linha("a_pagar", "financeira", "Tarifa Bancária", "120.00"),
      linha("a_receber", "movimentacao", "Resgate de aplicação", "900000.00"),
      linha("a_pagar", "movimentacao", "Aplicação financeira", "900000.00"),
    ]);

    expect(dre.operacional.totalReceitas).toBe(100000);
    expect(dre.operacional.totalDespesas).toBe(30000);
    expect(dre.operacional.resultado).toBe(70000);

    expect(dre.financeiro.totalReceitas).toBe(500);
    expect(dre.financeiro.totalDespesas).toBe(120);
    expect(dre.financeiro.resultado).toBe(380);

    expect(dre.movimentacao.totalReceitas).toBe(900000);
    expect(dre.movimentacao.totalDespesas).toBe(900000);
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
      resultado: 0,
    });
    expect(dre.movimentacao.resultado).toBe(0);
  });

  it("lista vazia devolve os três blocos zerados", () => {
    const dre = agruparDrePorNatureza([]);

    expect(dre.resultado).toBe(0);
    expect(dre.operacional.totalReceitas).toBe(0);
    expect(dre.movimentacao.totalDespesas).toBe(0);
  });
});
