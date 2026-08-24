import { describe, expect, it } from "vitest";

import {
  descontoCabeNaOrdem,
  totalComAjustes,
  totalEmCentavos,
  SEM_AJUSTES,
  type AjustesDaOrdem,
} from "@/modules/compras/ordens/calculo";
import { ordemCompraSchema } from "@/modules/compras/ordens/schemas";

/**
 * O desconto da OC e a distribuição dele pelos centros de custo.
 *
 * O desconto NÃO é aplicado item a item: ele entra no total, e quem o distribui
 * é `fn_aprovar_ordem_compra`, que rateia cada fatia por
 *
 *   round(bruto_da_fatia * valor_total / soma_dos_brutos, 2)
 *
 * Como `valor_total` já vem com o desconto subtraído, cada centro absorve a
 * parte proporcional ao que representa na ordem. Os testes abaixo reproduzem
 * essa mesma conta em TypeScript para travá-la: se alguém mudar a fórmula do
 * banco sem mudar aqui, a prévia da tela passa a mentir.
 */

const CENTRO_A = "11111111-1111-4111-8111-111111111111";
const CENTRO_B = "22222222-2222-4222-8222-222222222222";
const INSUMO = "33333333-3333-4333-8333-333333333333";

function ajustes(troca: Partial<AjustesDaOrdem> = {}): AjustesDaOrdem {
  return { ...SEM_AJUSTES, ...troca };
}

/** A MESMA conta que fn_aprovar_ordem_compra faz para cada fatia. */
function rateio(brutosPorCentro: number[], totalDaOrdem: number): number[] {
  const somaBrutos = brutosPorCentro.reduce((s, b) => s + b, 0);
  return brutosPorCentro.map((bruto) =>
    somaBrutos === 0
      ? 0
      : Math.round((bruto * totalDaOrdem * 100) / somaBrutos) / 100,
  );
}

describe("total da OC com desconto", () => {
  it("o desconto subtrai do total", () => {
    const itens = [{ quantidade: 1, precoUnitario: 10000 }];
    expect(totalComAjustes(itens, ajustes({ desconto: 1000 }))).toBe(9000);
  });

  it("os quatro ajustes entram na mesma conta que o banco faz", () => {
    // round(soma + frete + outras + impostos - desconto, 2)
    const itens = [{ quantidade: 2, precoUnitario: 500 }];
    expect(
      totalComAjustes(
        itens,
        ajustes({ frete: 100, outrasDespesas: 50, impostos: 25, desconto: 75 }),
      ),
    ).toBe(1100);
  });

  /**
   * O caso que motivou `totalEmCentavos` virar fonte única: com preço de quatro
   * casas (combustível), arredondar item a item e arredondar uma vez no fim dão
   * resultados diferentes. O banco arredonda uma vez, então é essa a conta.
   */
  it("arredonda uma vez no fim, não item a item", () => {
    const itens = [
      { quantidade: 1, precoUnitario: 7500.01618 },
      { quantidade: 1, precoUnitario: 2500.00797 },
    ];
    // 10.000,02415 → 10.000,02; arredondando por item daria 7.500,02 + 2.500,01
    expect(totalComAjustes(itens, SEM_AJUSTES)).toBe(10000.02);
  });

  it("desconto igual ao total zera a ordem, e isso ainda cabe", () => {
    const itens = [{ quantidade: 1, precoUnitario: 500 }];
    expect(totalEmCentavos(itens, ajustes({ desconto: 500 }))).toBe(0);
    expect(descontoCabeNaOrdem(itens, ajustes({ desconto: 500 }))).toBe(true);
  });

  it("desconto maior que o total NÃO cabe", () => {
    const itens = [{ quantidade: 1, precoUnitario: 500 }];
    expect(descontoCabeNaOrdem(itens, ajustes({ desconto: 500.01 }))).toBe(
      false,
    );
  });

  /**
   * O frete entra ANTES do desconto na conta, então um desconto maior que os
   * itens ainda pode caber se houver frete. É o caso da nota que cobra frete e
   * dá desconto no material.
   */
  it("o frete sustenta um desconto maior que os itens", () => {
    const itens = [{ quantidade: 1, precoUnitario: 100 }];
    expect(
      descontoCabeNaOrdem(itens, ajustes({ frete: 50, desconto: 120 })),
    ).toBe(true);
    expect(totalComAjustes(itens, ajustes({ frete: 50, desconto: 120 }))).toBe(
      30,
    );
  });
});

describe("o desconto se distribui proporcionalmente entre os centros", () => {
  it("dois centros, 70/30, absorvem o desconto na mesma proporção", () => {
    // R$ 10.000,00 em dois centros (7.000 e 3.000) com R$ 1.000,00 de desconto.
    const total = totalComAjustes(
      [
        { quantidade: 1, precoUnitario: 7000 },
        { quantidade: 1, precoUnitario: 3000 },
      ],
      ajustes({ desconto: 1000 }),
    );
    expect(total).toBe(9000);

    const [a, b] = rateio([7000, 3000], total);
    expect(a).toBe(6300);
    expect(b).toBe(2700);

    // Cada um absorveu 10% do próprio bruto — a mesma proporção.
    expect(7000 - a).toBe(700);
    expect(3000 - b).toBe(300);
    expect((7000 - a) / 7000).toBeCloseTo((3000 - b) / 3000, 10);
  });

  /**
   * LINHA DE CONTROLE: o desconto absorvido pelos centros TEM que somar
   * exatamente o desconto digitado. Se somasse zero, seria sinal de que o
   * desconto sumiu do rateio em vez de ter sido distribuído.
   */
  it("LINHA DE CONTROLE: o absorvido soma exatamente o desconto", () => {
    const brutos = [7000, 3000];
    const desconto = 1000;
    const total = totalComAjustes(
      brutos.map((b) => ({ quantidade: 1, precoUnitario: b })),
      ajustes({ desconto }),
    );
    const fatias = rateio(brutos, total);

    const somaBrutos = brutos.reduce((s, b) => s + b, 0);
    const somaFatias = fatias.reduce((s, f) => s + f, 0);
    expect(Math.round((somaBrutos - somaFatias) * 100)).toBe(desconto * 100);
  });

  /**
   * Divisão que não fecha em centavo inteiro: três centros iguais e um desconto
   * de um centavo. A sobra existe e é isso que a função do banco resolve
   * jogando o resto na maior fatia — aqui o teste trava que a diferença nunca
   * passa de um centavo por fatia.
   */
  it("com sobra de arredondamento, nenhuma fatia erra mais que um centavo", () => {
    const brutos = [1000, 1000, 1000];
    const total = totalComAjustes(
      brutos.map((b) => ({ quantidade: 1, precoUnitario: b })),
      ajustes({ desconto: 0.01 }),
    );
    const fatias = rateio(brutos, total);

    fatias.forEach((fatia, i) => {
      const esperado = (brutos[i] * total) / 3000;
      expect(Math.abs(fatia - esperado)).toBeLessThanOrEqual(0.01);
    });
  });
});

describe("o schema do servidor recusa desconto maior que a ordem", () => {
  const base = {
    fornecedorId: CENTRO_A,
    condicaoPagamentoId: CENTRO_B,
    formaPagamentoId: CENTRO_A,
    dataCompra: "2026-06-18",
    mesCompetencia: "2026-06-01",
    descricao: "Compra com desconto",
    categoriaId: CENTRO_B,
    itens: [
      {
        insumoId: INSUMO,
        quantidade: 1,
        precoUnitario: 1000,
        centroCustoId: CENTRO_A,
      },
    ],
  };

  it("aceita desconto que cabe, e as formas fecham com o total JÁ COM desconto", () => {
    const resultado = ordemCompraSchema.safeParse({
      ...base,
      desconto: 100,
      // 1.000 − 100 = 900. É contra isso que fn_salvar_parcelas_oc confere.
      formas: [{ formaPagamentoId: CENTRO_A, valor: 900 }],
    });
    expect(resultado.success).toBe(true);
  });

  /**
   * A regressão que este teste guarda: antes, o schema conferia as formas
   * contra a soma dos ITENS e o banco conferia contra o valor_total. Uma OC com
   * desconto passava aqui e era recusada lá.
   */
  it("recusa forma que fecha com os itens e ignora o desconto", () => {
    const resultado = ordemCompraSchema.safeParse({
      ...base,
      desconto: 100,
      formas: [{ formaPagamentoId: CENTRO_A, valor: 1000 }],
    });
    expect(resultado.success).toBe(false);
  });

  it("recusa desconto maior que a ordem, apontando o campo do desconto", () => {
    const resultado = ordemCompraSchema.safeParse({
      ...base,
      desconto: 1000.01,
      formas: [{ formaPagamentoId: CENTRO_A, valor: 1000 }],
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual(["desconto"]);
    }
  });

  it("recusa desconto negativo", () => {
    const resultado = ordemCompraSchema.safeParse({
      ...base,
      desconto: -10,
      formas: [{ formaPagamentoId: CENTRO_A, valor: 1010 }],
    });
    expect(resultado.success).toBe(false);
  });

  it("sem os campos, os quatro ajustes valem zero", () => {
    const resultado = ordemCompraSchema.safeParse({
      ...base,
      formas: [{ formaPagamentoId: CENTRO_A, valor: 1000 }],
    });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.desconto).toBe(0);
      expect(resultado.data.frete).toBe(0);
    }
  });
});
