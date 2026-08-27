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
    // `operacional` por default: era a ÚNICA natureza que a RPC devolvia antes de
    // 27/08/2026, e é sobre ela que todos os testes abaixo foram escritos. Assim
    // eles continuam medindo exatamente o que mediam, e a movimentação é testada
    // à parte, pedindo explicitamente.
    natureza: "operacional",
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
      movimentacaoEntrada: 0,
      movimentacaoSaida: 0,
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

/**
 * O empréstimo tomado (natureza `movimentacao`) tem de APARECER sem ENTRAR.
 *
 * O caso real: em 27/08/2026 o Tiago abriu este relatório no centro Empréstimos e
 * viu custo de R$ 2.843.964,90 com receita R$ 0,00 — a entrada de R$ 4.261.910,46
 * era invisível porque a RPC só trazia natureza operacional. Trazer a
 * movimentação resolve o "não aparece"; o que estes testes travam é o outro lado,
 * que é pior: ela não pode virar receita, porque aí o centro passaria a parecer
 * lucrativo com dinheiro que precisa ser devolvido.
 */
describe("movimentação de dívida", () => {
  const emprestimo = {
    tipo: "a_receber" as const,
    total: 4261910.46,
    natureza: "movimentacao" as const,
  };

  it("aparece no seu próprio par de números", () => {
    const t = totais([linha(emprestimo)]);
    expect(t.movimentacaoEntrada).toBe(4261910.46);
    expect(t.movimentacaoSaida).toBe(0);
  });

  it("NÃO entra em receita, resultado nem margem", () => {
    const t = totais([
      linha({ tipo: "a_pagar", total: 2843964.9 }),
      linha(emprestimo),
    ]);
    expect(t.receitaLiquida).toBe(0);
    expect(t.custo).toBe(2843964.9);
    expect(t.resultado).toBe(-2843964.9);
    // Margem null e não zero: zero se leria como "não sobrou nada da receita",
    // e não há receita nenhuma neste centro.
    expect(t.margem).toBeNull();
  });

  it("LINHA DE CONTROLE: a mesma linha como operacional MUDA o resultado", () => {
    // Sem esta, o teste acima passaria também se `totais` estivesse ignorando a
    // linha por outro motivo qualquer — um erro de tipo, um filtro errado. Aqui a
    // única diferença entre os dois cenários é a natureza, e ela tem de bastar
    // para virar o resultado de -2,84 mi para +1,42 mi.
    const comoMovimentacao = totais([
      linha({ tipo: "a_pagar", total: 2843964.9 }),
      linha(emprestimo),
    ]);
    const comoOperacional = totais([
      linha({ tipo: "a_pagar", total: 2843964.9 }),
      linha({ ...emprestimo, natureza: "operacional" }),
    ]);
    expect(comoMovimentacao.resultado).toBe(-2843964.9);
    expect(comoOperacional.resultado).toBe(1417945.56);
    expect(comoMovimentacao.resultado).not.toBe(comoOperacional.resultado);
  });

  it("o gráfico por mês ignora a movimentação", () => {
    const meses = porMes([
      linha({ tipo: "a_receber", total: 1000, mes: "2026-07" }),
      linha({ ...emprestimo, mes: "2026-07" }),
    ]);
    expect(meses).toHaveLength(1);
    expect(meses[0]?.receita).toBe(1000);
  });

  it("a tabela por centro traz operacional por default e movimentação a pedido", () => {
    const linhas = [
      linha({ tipo: "a_receber", total: 1000 }),
      linha(emprestimo),
    ];
    expect(porCentro(linhas, "a_receber")[0]?.total).toBe(1000);
    expect(porCentro(linhas, "a_receber", "movimentacao")[0]?.total).toBe(
      4261910.46,
    );
  });

  it("soma dois empréstimos em centavos, sem resto de float", () => {
    const t = totais([
      linha({ ...emprestimo, total: 963910.46 }),
      linha({ ...emprestimo, total: 2298000.0 }),
      linha({ ...emprestimo, total: 1000000.0 }),
    ]);
    expect(t.movimentacaoEntrada).toBe(4261910.46);
  });
});
