import { describe, expect, it } from "vitest";

import {
  ratearEmCentavos,
  recorteDaParcela,
  type RateioDoLancamento,
} from "@/modules/financeiro/pagamentos/recorte";

/**
 * A repartição de dinheiro do recorte de centro de custo.
 *
 * O que está sendo defendido é uma coisa só, e é a razão do módulo existir: a
 * soma das partes é EXATAMENTE o total. Errar por um centavo aqui não quebra
 * nada e não avisa nada -- reaparece na tela como "o total das carretas não dá o
 * total do centro", que foi a queixa que originou isto.
 */
describe("ratearEmCentavos", () => {
  it("R$ 100.000,00 entre 3 carretas fecha no centavo", () => {
    // 33.333,3333 cada. Arredondando cada uma por conta própria dá 99.999,99 e
    // sobra um centavo perdido; por maior resto, uma leva o centavo extra.
    const partes = ratearEmCentavos(10000000, [1, 1, 1]);

    expect(partes).toEqual([3333334, 3333333, 3333333]);
    expect(partes.reduce((s, p) => s + p, 0)).toBe(10000000);
  });

  it("reparte na PROPORÇÃO dos pesos, não em partes iguais", () => {
    // LINHA DE CONTROLE: sem isto, uma função que dividisse igual passaria no
    // teste de cima -- e dividir igual é justamente o palpite errado quando o
    // rateio real está gravado no banco.
    const partes = ratearEmCentavos(100000, [700, 200, 100]);
    expect(partes).toEqual([70000, 20000, 10000]);
  });

  it("fecha no centavo em CEM repartições seguidas de valor quebrado", () => {
    // A prova de que o erro não acumula: qualquer total, qualquer peso.
    for (let total = 1; total <= 100; total += 1) {
      const partes = ratearEmCentavos(total, [3, 5, 7, 11]);
      expect(partes.reduce((s, p) => s + p, 0)).toBe(total);
    }
  });

  it("empate no resto vai para o primeiro, sempre igual", () => {
    // Sem desempate por índice, a fatia mudaria conforme a ordem em que o banco
    // devolveu os rateios -- o mesmo filtro daria números diferentes.
    expect(ratearEmCentavos(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(ratearEmCentavos(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it("peso zero recebe zero", () => {
    expect(ratearEmCentavos(1000, [1, 0, 1])).toEqual([500, 0, 500]);
  });

  it("todos os pesos zero não APAGA o dinheiro", () => {
    // Devolver zero em tudo faria o total da tela encolher sem explicação.
    const partes = ratearEmCentavos(777, [0, 0]);
    expect(partes.reduce((s, p) => s + p, 0)).toBe(777);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(ratearEmCentavos(100, [])).toEqual([]);
  });
});

describe("recorteDaParcela", () => {
  const CARRETA_3 = "cc-3";
  const CARRETA_4 = "cc-4";
  const CARRETA_5 = "cc-5";
  const ESCRITORIO = "escritorio";

  function rateio(centroCustoId: string, valor: number): RateioDoLancamento {
    return { centroCustoId, valor };
  }

  it("a COMPRA DE 3 CARRETAS entra com um terço em cada uma", () => {
    const rateios = [
      rateio(CARRETA_3, 33333.34),
      rateio(CARRETA_4, 33333.33),
      rateio(CARRETA_5, 33333.33),
    ];

    const so3 = recorteDaParcela(100000, rateios, new Set([CARRETA_3]));
    const so4 = recorteDaParcela(100000, rateios, new Set([CARRETA_4]));
    const so5 = recorteDaParcela(100000, rateios, new Set([CARRETA_5]));

    expect(so3).toBe(33333.34);
    expect(so4).toBe(33333.33);
    expect(so5).toBe(33333.33);
    // O que importa: as três somam o pagamento inteiro, sem centavo sobrando.
    expect(so3 + so4 + so5).toBe(100000);
  });

  it("a subárvore inteira devolve o valor CHEIO da parcela", () => {
    // Filtrar o centro pai tem que dar o mesmo número de não filtrar por centro:
    // é o mesmo dinheiro, só somado num nível acima.
    const rateios = [
      rateio(CARRETA_3, 33333.34),
      rateio(CARRETA_4, 33333.33),
      rateio(CARRETA_5, 33333.33),
    ];
    expect(
      recorteDaParcela(
        100000,
        rateios,
        new Set([CARRETA_3, CARRETA_4, CARRETA_5]),
      ),
    ).toBe(100000);
  });

  it("rateio que sai da subárvore entra só com a parte de dentro", () => {
    // Lançamento dividido entre uma carreta e o Escritório Central: filtrando a
    // carreta, o pedaço do Escritório NÃO pode entrar.
    const rateios = [rateio(CARRETA_3, 750), rateio(ESCRITORIO, 250)];
    expect(recorteDaParcela(1000, rateios, new Set([CARRETA_3]))).toBe(750);
  });

  it("custo de um centro só devolve a parcela inteira", () => {
    // 6.244 dos 6.561 rateios estão gravados num centro só: é o caso comum, e
    // nele a fatia tem que ser o valor da parcela sem tirar nada.
    expect(
      recorteDaParcela(
        4989.62,
        [rateio(CARRETA_3, 4989.62)],
        new Set([CARRETA_3]),
      ),
    ).toBe(4989.62);
  });

  it("a fatia acompanha a PARCELA, não o valor do lançamento", () => {
    // Lançamento de R$ 1.000 em 4 parcelas de R$ 250, dividido meio a meio entre
    // duas carretas: cada parcela entra com R$ 125 na carreta filtrada. Somar o
    // rateio cheio (R$ 500) por parcela quadruplicaria o custo da carreta.
    const rateios = [rateio(CARRETA_3, 500), rateio(CARRETA_4, 500)];
    const porParcela = recorteDaParcela(250, rateios, new Set([CARRETA_3]));
    expect(porParcela).toBe(125);
    expect(porParcela * 4).toBe(500);
  });

  it("centro fora do rateio devolve zero", () => {
    expect(
      recorteDaParcela(1000, [rateio(CARRETA_3, 1000)], new Set([ESCRITORIO])),
    ).toBe(0);
  });

  it("parcela sem rateio nenhum devolve zero, não o valor cheio", () => {
    expect(recorteDaParcela(1000, [], new Set([CARRETA_3]))).toBe(0);
  });
});
