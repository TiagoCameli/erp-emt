import { describe, expect, it } from "vitest";

import {
  COR_COMBUSTIVEL,
  COR_EXTERNO,
  COR_MATERIAL,
  corDaPilha,
  dimensoesDoTanque,
  objetosDoEstoque,
} from "@/modules/mapa/objetos";
import type { TanqueMapa } from "@/modules/mapa/tipos";

const tanque = (t: Partial<TanqueMapa>): TanqueMapa => ({
  id: "t",
  nome: "Tanque",
  apelido: "",
  uso: "combustivel",
  ehExterno: false,
  localidadeId: null,
  equipamentoId: null,
  pos: null,
  capacidade: 15000,
  nivel: null,
  unidade: "L",
  insumo: "",
  ...t,
});

describe("objetos do Estoque no mapa", () => {
  it("o volume do cilindro bate com a capacidade do tanque", () => {
    for (const litros of [4000, 15000, 100000]) {
      const { diametro, altura } = dimensoesDoTanque(litros, "L");
      const volume = Math.PI * (diametro / 2) ** 2 * altura * 1000;
      expect(volume).toBeCloseTo(litros, 0);
      expect(altura / diametro).toBeCloseTo(1.5, 5);
    }
    // sem capacidade (posto externo) desenha como 15 mil L
    expect(dimensoesDoTanque(0, "L")).toEqual(dimensoesDoTanque(15000, "L"));
    expect(dimensoesDoTanque(15, "m3").diametro).toBeCloseTo(
      dimensoesDoTanque(15000, "L").diametro,
      6,
    );
  });

  it("cor do tanque pelo uso e da pilha pelo material", () => {
    const [comb, mat, ext] = objetosDoEstoque(
      [
        tanque({ id: "a" }),
        tanque({ id: "b", uso: "material" }),
        tanque({ id: "c", ehExterno: true, capacidade: 0 }),
      ],
      [],
      [],
    );
    expect(comb.cor).toEqual(COR_COMBUSTIVEL);
    expect(mat.cor).toEqual(COR_MATERIAL);
    expect(ext.cor).toEqual(COR_EXTERNO);
    expect(ext.detalhe).toBe("posto externo");
    expect(corDaPilha("Areia média - Pátio")).not.toEqual(
      corDaPilha("Brita 1 - Pátio"),
    );
    expect(corDaPilha("Terra de jazida")).not.toEqual(corDaPilha("Brita 1"));
  });

  it("todos entram, com ou sem lugar, cada um com a forma do seu tipo", () => {
    const objetos = objetosDoEstoque(
      [tanque({ id: "t1", pos: [-72.7, -7.6], insumo: "Diesel S10" })],
      [{ id: "p1", nome: "Brita 1 - Colorado", saldo: 0, pos: null }],
      [{ id: "d1", nome: "Almoxarifado", localidadeId: null, pos: null }],
    );
    expect(objetos.map((o) => [o.alvo, o.forma])).toEqual([
      ["tanque", "cilindro"],
      ["pilha", "cone"],
      ["deposito", "caixa"],
    ]);
    expect(objetos[0].detalhe).toBe("tanque · 15.000 L · Diesel S10");
    expect(objetos.filter((o) => o.pos === null)).toHaveLength(2);
  });
});
