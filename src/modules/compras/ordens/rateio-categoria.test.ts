import { describe, expect, it } from "vitest";

import { SEM_AJUSTES } from "@/modules/compras/ordens/calculo";
import {
  type ItemParaRateio,
  ratearPorCategoria,
} from "@/modules/compras/ordens/rateio-categoria";

function item(
  centroCustoId: string,
  categoriaId: string,
  quantidade: number,
  precoUnitario: number,
): ItemParaRateio {
  return { centroCustoId, categoriaId, quantidade, precoUnitario };
}

const somaDas = (fatias: { valor: number }[]) =>
  Math.round(fatias.reduce((total, fatia) => total + fatia.valor, 0) * 100) / 100;

describe("ratearPorCategoria", () => {
  it("uma categoria só produz uma fatia com o total", () => {
    const fatias = ratearPorCategoria([item("cc1", "cat1", 2, 50)], SEM_AJUSTES);
    expect(fatias).toEqual([{ centroCustoId: "cc1", categoriaId: "cat1", valor: 100 }]);
  });

  it("agrupa itens do mesmo centro de custo e mesma categoria", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "cat1", 1, 10), item("cc1", "cat1", 1, 15)],
      SEM_AJUSTES,
    );
    expect(fatias).toHaveLength(1);
    expect(fatias[0].valor).toBe(25);
  });

  it("separa fatias por categoria dentro do mesmo centro de custo", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "cat1", 1, 60), item("cc1", "cat2", 1, 40)],
      SEM_AJUSTES,
    );
    expect(fatias).toHaveLength(2);
    expect(somaDas(fatias)).toBe(100);
  });

  it("separa fatias por centro de custo dentro da mesma categoria", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "cat1", 1, 60), item("cc2", "cat1", 1, 40)],
      SEM_AJUSTES,
    );
    expect(fatias).toHaveLength(2);
    expect(somaDas(fatias)).toBe(100);
  });

  // O caso que motivou a task: a OC-2026-0017 da BRITAS. Itens somam R$ 103.835,95 e
  // o desconto de R$ 3.835,95 leva o total a R$ 100.000,00. Ratear só os itens
  // deixaria o lançamento com rateio R$ 3.835,95 maior que o valor.
  it("desconto do rodapé entra proporcionalmente e a soma fecha no total", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "materiais", 1, 71300), item("cc1", "aclassificar", 1, 32535.95)],
      { ...SEM_AJUSTES, desconto: 3835.95 },
    );
    expect(somaDas(fatias)).toBe(100000);
  });

  it("frete, impostos e outras despesas entram proporcionalmente", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "cat1", 1, 1000), item("cc1", "cat2", 1, 1000)],
      { frete: 100, outrasDespesas: 50, impostos: 30, desconto: 0 },
    );
    expect(somaDas(fatias)).toBe(2180);
    expect(fatias[0].valor).toBe(1090);
    expect(fatias[1].valor).toBe(1090);
  });

  /**
   * Linha de controle do arredondamento. Três fatias de R$ 0,01 com R$ 0,01 de frete:
   * cada uma arredonda para R$ 0,01 e a soma fica um centavo ABAIXO do total. Se o
   * resto não fosse aplicado, a soma daria 0,03 e a trava do banco recusaria o
   * lançamento. Um caso onde o resto já dá zero passaria sem provar nada.
   */
  it("resto do arredondamento vai para uma fatia e a soma fecha", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "a", 1, 0.01), item("cc1", "b", 1, 0.01), item("cc1", "c", 1, 0.01)],
      { ...SEM_AJUSTES, frete: 0.01 },
    );
    expect(somaDas(fatias)).toBe(0.04);
    expect(fatias.filter((fatia) => fatia.valor === 0.02)).toHaveLength(1);
    expect(fatias.filter((fatia) => fatia.valor === 0.01)).toHaveLength(2);
  });

  it("resto negativo também fecha a soma", () => {
    // 3 fatias de R$ 10 com R$ 0,01 de desconto: cada arredonda para 10,00 e a soma
    // fica um centavo ACIMA. O resto tem que subtrair.
    const fatias = ratearPorCategoria(
      [item("cc1", "a", 1, 10), item("cc1", "b", 1, 10), item("cc1", "c", 1, 10)],
      { ...SEM_AJUSTES, desconto: 0.01 },
    );
    expect(somaDas(fatias)).toBe(29.99);
    expect(fatias.filter((fatia) => fatia.valor === 9.99)).toHaveLength(1);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(ratearPorCategoria([], SEM_AJUSTES)).toEqual([]);
  });

  it("total de itens zero não divide por zero", () => {
    const fatias = ratearPorCategoria([item("cc1", "cat1", 0, 0)], {
      ...SEM_AJUSTES,
      frete: 10,
    });
    expect(somaDas(fatias)).toBe(10);
    expect(Number.isFinite(fatias[0].valor)).toBe(true);
  });

  it("ordena da maior para a menor fatia", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "pequena", 1, 10), item("cc1", "grande", 1, 90)],
      SEM_AJUSTES,
    );
    expect(fatias[0].categoriaId).toBe("grande");
  });

  it("quantidade fracionada de combustível fecha ao centavo", () => {
    // Diesel é vendido a 4 casas: 1.140,34 L a R$ 6,5770 e 390,95 L a R$ 6,3947.
    const fatias = ratearPorCategoria(
      [
        item("cc1", "combustivel", 1140.34, 6.577),
        item("cc1", "combustivel", 390.95, 6.3947),
      ],
      SEM_AJUSTES,
    );
    expect(fatias).toHaveLength(1);
    expect(somaDas(fatias)).toBe(10000.02);
  });
});
