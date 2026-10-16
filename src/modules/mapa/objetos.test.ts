import { describe, expect, it } from "vitest";

import {
  COR_COMBUSTIVEL,
  COR_EXTERNO,
  COR_MATERIAL,
  corDaPilha,
  dimensoesDaPilha,
  dimensoesDoTanque,
  linhasDaFicha,
  objetosDoEstoque,
  textoSaldoPilha,
  volumeDaPilha,
  type FontesFicha,
} from "@/modules/mapa/objetos";
import type { PilhaMapa, TanqueMapa } from "@/modules/mapa/tipos";

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
      [
        {
          id: "p1",
          nome: "Brita 1 - Colorado",
          saldo: 0,
          totalEntrada: 0,
          insumo: "BRITA 1",
          unidade: "t",
          localidadeId: null,
          pos: null,
        },
      ],
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

describe("tamanho da pilha pelo saldo", () => {
  it("1,5 t por m³: o volume do cone bate com o saldo", () => {
    for (const toneladas of [15, 150, 1500]) {
      const { diametro, altura, volume } = dimensoesDaPilha(toneladas);
      expect(volume).toBeCloseTo(toneladas / 1.5, 6);
      const cone = (Math.PI * (diametro / 2) ** 2 * altura) / 3;
      expect(cone).toBeCloseTo(volume, 6);
    }
  });

  it("pilha zerada aparece do tamanho de 1 m³ e cresce com o saldo", () => {
    expect(dimensoesDaPilha(0).volume).toBe(1);
    expect(dimensoesDaPilha(-5).volume).toBe(1);
    expect(dimensoesDaPilha(300).diametro).toBeGreaterThan(
      dimensoesDaPilha(30).diametro,
    );
  });

  it("pilha em m³ não divide por 1,5; em t divide", () => {
    expect(volumeDaPilha(150, "t")).toBe(100);
    expect(volumeDaPilha(150, "m³")).toBe(150);
    expect(volumeDaPilha(150, "M3")).toBe(150);
    expect(textoSaldoPilha(282, "t")).toBe("282 t ≈ 188 m³");
    expect(textoSaldoPilha(40, "m³")).toBe("40 m³");
  });
});

const pilha = (p: Partial<PilhaMapa>): PilhaMapa => ({
  id: "p",
  nome: "Brita 1 - Canteiro Gregorio",
  saldo: 282,
  totalEntrada: 282,
  insumo: "BRITA 1",
  unidade: "t",
  localidadeId: "l1",
  pos: [-71.49, -7.95],
  ...p,
});

const fontes = (f: Partial<FontesFicha>): FontesFicha => ({
  tanques: [],
  pilhas: [],
  depositos: [],
  localidades: [{ id: "l1", nome: "Usina Gregorio" }],
  equipamentos: [{ id: "e1", codigo: "CB-001" }],
  ...f,
});

describe("linhas da ficha do objeto", () => {
  it("pilha: material, saldo com volume, entrou, saiu e local (Gregorio em 16/10)", () => {
    const linhas = linhasDaFicha(
      { id: "p", alvo: "pilha" },
      fontes({ pilhas: [pilha({ saldo: 250, totalEntrada: 282 })] }),
    );
    expect(linhas).toEqual([
      { rotulo: "Material", valor: "BRITA 1" },
      { rotulo: "Saldo", valor: "250 t ≈ 167 m³" },
      { rotulo: "Já entrou", valor: "282 t" },
      { rotulo: "Já saiu", valor: "32 t" },
      { rotulo: "Local", valor: "Usina Gregorio" },
    ]);
  });

  it("tanque: conteúdo, nível sobre a capacidade e a máquina que o leva", () => {
    const linhas = linhasDaFicha(
      { id: "t", alvo: "tanque" },
      fontes({
        tanques: [
          tanque({
            id: "t",
            capacidade: 15000,
            nivel: 5152.9,
            insumo: "Diesel S10",
            equipamentoId: "e1",
          }),
        ],
      }),
    );
    expect(linhas).toEqual([
      { rotulo: "Tipo", valor: "Tanque de combustível" },
      { rotulo: "Conteúdo", valor: "Diesel S10" },
      { rotulo: "Nível", valor: "5.152,9 de 15.000 L (34%)" },
      { rotulo: "Anda com", valor: "CB-001" },
    ]);
  });

  it("posto externo não tem nível; objeto que sumiu do cadastro não inventa linha", () => {
    const linhas = linhasDaFicha(
      { id: "t", alvo: "tanque" },
      fontes({
        tanques: [tanque({ id: "t", ehExterno: true, localidadeId: "l1" })],
      }),
    );
    expect(linhas.map((l) => l.rotulo)).toEqual(["Tipo", "Conteúdo", "Local"]);
    expect(linhasDaFicha({ id: "x", alvo: "pilha" }, fontes({}))).toEqual([]);
  });
});
