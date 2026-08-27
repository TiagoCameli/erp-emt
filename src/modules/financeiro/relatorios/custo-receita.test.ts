import { describe, expect, it } from "vitest";

import {
  porCentro,
  porMes,
  totais,
  type LinhaCustoReceita,
} from "@/modules/financeiro/relatorios/custo-receita";

const OBRA = "11111111-1111-4111-8111-111111111111";
const EQUIPAMENTOS = "22222222-2222-4222-8222-222222222222";

function linha(
  troca: Partial<LinhaCustoReceita> & Pick<LinhaCustoReceita, "tipo" | "total">,
): LinhaCustoReceita {
  return {
    mes: "2026-07",
    centroCustoId: OBRA,
    nome: "009 - BR-364",
    codigo: null,
    retencao: 0,
    ...troca,
  };
}

/**
 * As três leituras da tela (cartões, gráfico por mês, tabela por centro) somam as
 * MESMAS linhas. O que estes testes travam é isso: se as três somas divergirem, a
 * tela mostra três verdades do mesmo dinheiro.
 */
describe("totais", () => {
  it("soma custo, receita líquida, retenção e deriva o faturado", () => {
    const t = totais([
      linha({ tipo: "a_pagar", total: 1000 }),
      linha({ tipo: "a_pagar", total: 500 }),
      linha({ tipo: "a_receber", total: 2000, retencao: 150 }),
    ]);
    expect(t.custo).toBe(1500);
    expect(t.receitaLiquida).toBe(2000);
    expect(t.retencao).toBe(150);
    // Faturado é derivado, nunca uma quarta coluna: líquido + retido.
    expect(t.receitaFaturada).toBe(2150);
    expect(t.resultado).toBe(500);
  });

  it("margem é sobre a receita LÍQUIDA, que é a base do resultado", () => {
    const t = totais([
      linha({ tipo: "a_pagar", total: 750 }),
      linha({ tipo: "a_receber", total: 1000 }),
    ]);
    expect(t.resultado).toBe(250);
    expect(t.margem).toBe(25);
  });

  it("sem receita, margem é nula e NÃO zero nem cem", () => {
    // Centro que só tem custo (carretas, equipamentos): dividir por zero diria
    // coisa que não existe, e "0%" se leria como "não sobrou nada de receita".
    const t = totais([linha({ tipo: "a_pagar", total: 900 })]);
    expect(t.receitaLiquida).toBe(0);
    expect(t.resultado).toBe(-900);
    expect(t.margem).toBeNull();
  });

  it("resultado negativo aparece negativo", () => {
    const t = totais([
      linha({ tipo: "a_pagar", total: 1200 }),
      linha({ tipo: "a_receber", total: 1000 }),
    ]);
    expect(t.resultado).toBe(-200);
    expect(t.margem).toBe(-20);
  });

  it("soma em centavos: centavo quebrado não vira dízima", () => {
    // Três linhas de 0,01 têm que dar 0,03, e não 0,030000000000000002.
    const t = totais([
      linha({ tipo: "a_receber", total: 0.01 }),
      linha({ tipo: "a_receber", total: 0.01 }),
      linha({ tipo: "a_receber", total: 0.01 }),
    ]);
    expect(t.receitaLiquida).toBe(0.03);
  });

  it("lista vazia é tudo zero, com margem nula", () => {
    const t = totais([]);
    expect(t).toEqual({
      custo: 0,
      receitaLiquida: 0,
      receitaFaturada: 0,
      retencao: 0,
      resultado: 0,
      margem: null,
    });
  });
});

describe("porMes", () => {
  it("uma linha por mês, em ordem crescente, com o resultado do mês", () => {
    const meses = porMes([
      linha({ mes: "2026-08", tipo: "a_pagar", total: 300 }),
      linha({ mes: "2026-07", tipo: "a_pagar", total: 100 }),
      linha({ mes: "2026-07", tipo: "a_receber", total: 250 }),
    ]);
    expect(meses).toEqual([
      { mes: "2026-07", custo: 100, receita: 250, resultado: 150 },
      { mes: "2026-08", custo: 300, receita: 0, resultado: -300 },
    ]);
  });

  it("soma os centros dentro do mesmo mês", () => {
    const meses = porMes([
      linha({ mes: "2026-07", tipo: "a_pagar", total: 100, centroCustoId: OBRA }),
      linha({
        mes: "2026-07",
        tipo: "a_pagar",
        total: 40,
        centroCustoId: EQUIPAMENTOS,
      }),
    ]);
    expect(meses).toEqual([
      { mes: "2026-07", custo: 140, receita: 0, resultado: -140 },
    ]);
  });

  it("o total dos meses fecha com os cartões", () => {
    // A LINHA DE CONTROLE desta suíte: se gráfico e cartão divergirem, a tela
    // mostra dois números para o mesmo dinheiro.
    const linhas = [
      linha({ mes: "2026-06", tipo: "a_pagar", total: 123.45 }),
      linha({ mes: "2026-07", tipo: "a_pagar", total: 67.89 }),
      linha({ mes: "2026-07", tipo: "a_receber", total: 1000.01 }),
      linha({ mes: "2026-08", tipo: "a_receber", total: 0.99 }),
    ];
    const t = totais(linhas);
    const meses = porMes(linhas);
    expect(meses.reduce((s, m) => s + m.custo, 0)).toBeCloseTo(t.custo, 2);
    expect(meses.reduce((s, m) => s + m.receita, 0)).toBeCloseTo(
      t.receitaLiquida,
      2,
    );
  });
});

describe("porCentro", () => {
  it("agrupa por centro, do maior para o menor", () => {
    const custos = porCentro(
      [
        linha({ tipo: "a_pagar", total: 100, centroCustoId: OBRA, nome: "Obra" }),
        linha({
          tipo: "a_pagar",
          total: 500,
          centroCustoId: EQUIPAMENTOS,
          nome: "Equipamentos",
        }),
        linha({ tipo: "a_pagar", total: 50, centroCustoId: OBRA, nome: "Obra" }),
        // Receita não entra na tabela de custo.
        linha({ tipo: "a_receber", total: 9999, centroCustoId: OBRA }),
      ],
      "a_pagar",
    );
    expect(custos).toEqual([
      {
        centroCustoId: EQUIPAMENTOS,
        nome: "Equipamentos",
        codigo: null,
        total: 500,
        retencao: 0,
      },
      {
        centroCustoId: OBRA,
        nome: "Obra",
        codigo: null,
        total: 150,
        retencao: 0,
      },
    ]);
  });

  it("na receita, carrega a retenção do centro", () => {
    const receitas = porCentro(
      [
        linha({ tipo: "a_receber", total: 1000, retencao: 75 }),
        linha({ tipo: "a_receber", total: 500, retencao: 25 }),
      ],
      "a_receber",
    );
    expect(receitas[0]?.total).toBe(1500);
    expect(receitas[0]?.retencao).toBe(100);
  });

  it("o total por centro fecha com os cartões", () => {
    const linhas = [
      linha({ tipo: "a_pagar", total: 33.33, centroCustoId: OBRA }),
      linha({ tipo: "a_pagar", total: 33.33, centroCustoId: EQUIPAMENTOS }),
      linha({ tipo: "a_pagar", total: 33.34, centroCustoId: OBRA }),
    ];
    const t = totais(linhas);
    const soma = porCentro(linhas, "a_pagar").reduce((s, c) => s + c.total, 0);
    expect(soma).toBeCloseTo(t.custo, 2);
    expect(soma).toBe(100);
  });

  it("sem linha do tipo pedido, devolve lista vazia", () => {
    expect(porCentro([linha({ tipo: "a_pagar", total: 10 })], "a_receber")).toEqual(
      [],
    );
  });
});
