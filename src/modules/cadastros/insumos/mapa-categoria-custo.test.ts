import { describe, expect, it } from "vitest";

import {
  CATEGORIAS_DE_CUSTO_USADAS,
  MAPA_CATEGORIA_CUSTO,
} from "@/modules/cadastros/insumos/mapa-categoria-custo";

/**
 * As 27 categorias de insumo do banco, medidas em 17/08/2026. "A classificar"
 * existe nos quatro grupos com o mesmo nome, então a chave leva o grupo.
 */
const CATEGORIAS_DE_INSUMO = [
  "A classificar (Equipamentos)",
  "Combustível",
  "Filtros",
  "Locação de equipamento",
  "Lubrificantes e graxas",
  "Manutenção e serviços",
  "Peças e componentes",
  "Pneus e câmaras",
  "A classificar (Mão de obra)",
  "Diaristas",
  "Equipe própria",
  "Terceiros e empreitas",
  "A classificar (Material)",
  "Aço, ferragens e fixação",
  "Asfalto e ligantes",
  "Cimento, agregados e concreto",
  "Elétrica",
  "EPI e sinalização",
  "Ferramentas e consumíveis",
  "Hidráulica",
  "Limpeza e escritório",
  "Madeira e formas",
  "Pintura e acabamento",
  "A classificar (Outros)",
  "Fretes e transporte",
  "Rancho e alojamento",
  "Taxas e administrativo",
];

describe("mapa de categoria de insumo para categoria de custo", () => {
  it("cobre as 27 categorias de insumo", () => {
    expect(CATEGORIAS_DE_INSUMO).toHaveLength(27);
    for (const categoria of CATEGORIAS_DE_INSUMO) {
      expect(MAPA_CATEGORIA_CUSTO[categoria], `sem destino: ${categoria}`).toBeTruthy();
    }
  });

  it("não tem chave a mais do que as categorias que existem", () => {
    expect(Object.keys(MAPA_CATEGORIA_CUSTO).sort()).toEqual(
      [...CATEGORIAS_DE_INSUMO].sort(),
    );
  });

  it("não manda para categoria de custo fora da lista conferida", () => {
    for (const destino of Object.values(MAPA_CATEGORIA_CUSTO)) {
      expect(CATEGORIAS_DE_CUSTO_USADAS).toContain(destino);
    }
  });

  it("manda combustível para Combustível e peça para Manutenção de equipamentos", () => {
    expect(MAPA_CATEGORIA_CUSTO["Combustível"]).toBe("Combustível");
    expect(MAPA_CATEGORIA_CUSTO["Peças e componentes"]).toBe("Manutenção de equipamentos");
  });

  it("cada A classificar vai para o genérico do seu grupo", () => {
    expect(MAPA_CATEGORIA_CUSTO["A classificar (Material)"]).toBe("Materiais");
    expect(MAPA_CATEGORIA_CUSTO["A classificar (Outros)"]).toBe("Outras despesas");
    expect(MAPA_CATEGORIA_CUSTO["A classificar (Equipamentos)"]).toBe(
      "Manutenção de equipamentos",
    );
    expect(MAPA_CATEGORIA_CUSTO["A classificar (Mão de obra)"]).toBe(
      "Mão de Obra Terceirizada",
    );
  });

  it("todo destino declarado é de fato usado por alguma categoria", () => {
    const usados = new Set(Object.values(MAPA_CATEGORIA_CUSTO));
    for (const destino of CATEGORIAS_DE_CUSTO_USADAS) {
      expect(usados, `destino declarado e não usado: ${destino}`).toContain(destino);
    }
  });
});
