import { describe, expect, it } from "vitest";

import {
  COR_COMBUSTIVEL,
  COR_EXTERNO,
  COR_MATERIAL,
  corDaPilha,
  dimensoesDaPilha,
  dimensoesDoTanque,
  dimensoesDoTanqueHorizontal,
  formaDoTanque,
  linhasDaFicha,
  objetosDoEstoque,
  TAMANHO_DEPOSITO_PADRAO,
  textoSaldoPilha,
  volumeDaPilha,
  type FontesFicha,
} from "@/modules/mapa/objetos";
import { formatarBRL } from "@/lib/formatadores";
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

  it("o volume do tanque deitado, com os tampos elípticos, bate com a capacidade", () => {
    for (const litros of [4000, 15000, 30000]) {
      const { diametro: d, comprimento } = dimensoesDoTanqueHorizontal(
        litros,
        "L",
      );
      const r = d / 2;
      const tampo = d / 4;
      const costado = comprimento - 2 * tampo;
      const volume =
        (Math.PI * r * r * costado + (4 / 3) * Math.PI * r * r * tampo) * 1000;
      expect(volume).toBeCloseTo(litros, 0);
    }
    // 15 mil L de obra: uns 1,9 m de diâmetro por 5,4 m, como os aéreos de verdade
    const { diametro, comprimento } = dimensoesDoTanqueHorizontal(15000, "L");
    expect(diametro).toBeGreaterThan(1.8);
    expect(diametro).toBeLessThan(2.1);
    expect(comprimento).toBeGreaterThan(5);
    expect(comprimento).toBeLessThan(5.8);
  });

  it("diesel e ARLA de obra deitam; material e tanque grande ficam em pé", () => {
    expect(formaDoTanque(tanque({ capacidade: 15000 }))).toBe(
      "tanque_horizontal",
    );
    expect(formaDoTanque(tanque({ capacidade: 4000 }))).toBe(
      "tanque_horizontal",
    );
    expect(formaDoTanque(tanque({ capacidade: 30000 }))).toBe(
      "tanque_horizontal",
    );
    expect(formaDoTanque(tanque({ capacidade: 30001 }))).toBe(
      "tanque_vertical",
    );
    expect(formaDoTanque(tanque({ capacidade: 60, unidade: "m3" }))).toBe(
      "tanque_vertical",
    );
    expect(formaDoTanque(tanque({ capacidade: 15000, uso: "material" }))).toBe(
      "tanque_vertical",
    );
    // posto externo sem capacidade desenha como o de 15 mil L, deitado
    expect(formaDoTanque(tanque({ capacidade: 0, ehExterno: true }))).toBe(
      "tanque_horizontal",
    );
  });

  it("as medidas do objeto seguem a forma do tanque", () => {
    const [deitado, emPe] = objetosDoEstoque(
      [
        tanque({ id: "a", capacidade: 15000 }),
        tanque({ id: "b", capacidade: 100000, uso: "material" }),
      ],
      [],
      [],
    );
    expect(deitado.forma).toBe("tanque_horizontal");
    expect(deitado.comprimento).toBeCloseTo(deitado.largura * 2.8, 6);
    expect(deitado.altura).toBe(deitado.largura);
    expect(emPe.forma).toBe("tanque_vertical");
    expect(emPe.comprimento).toBe(emPe.largura);
    expect(emPe.altura).toBeCloseTo(emPe.largura * 1.5, 6);
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
      [
        {
          id: "d1",
          nome: "Almoxarifado",
          localidadeId: null,
          pos: null,
          larguraM: null,
          comprimentoM: null,
          alturaM: null,
        },
      ],
    );
    expect(objetos.map((o) => [o.alvo, o.forma])).toEqual([
      ["tanque", "tanque_horizontal"],
      ["pilha", "cone"],
      ["deposito", "caixa"],
    ]);
    expect(objetos[0].detalhe).toBe("tanque · 15.000 L · Diesel S10");
    expect(objetos.filter((o) => o.pos === null)).toHaveLength(2);
  });
});

describe("tamanho do depósito (16/10/2026)", () => {
  const deposito = {
    id: "d1",
    nome: "Almoxarifado Central",
    localidadeId: null,
    pos: [-72.7, -7.6] as [number, number],
  };
  it("sem tamanho escolhido, o padrão em metros", () => {
    const [d] = objetosDoEstoque(
      [],
      [],
      [{ ...deposito, larguraM: null, comprimentoM: null, alturaM: null }],
    );
    expect([d.largura, d.comprimento, d.altura]).toEqual([
      TAMANHO_DEPOSITO_PADRAO.largura,
      TAMANHO_DEPOSITO_PADRAO.comprimento,
      TAMANHO_DEPOSITO_PADRAO.altura,
    ]);
  });
  it("com tamanho escolhido na ficha, o escolhido", () => {
    const [d] = objetosDoEstoque(
      [],
      [],
      [{ ...deposito, larguraM: 4, comprimentoM: 6.5, alturaM: 3 }],
    );
    expect([d.largura, d.comprimento, d.altura]).toEqual([4, 6.5, 3]);
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

// Posições reais (16/10): Usina Gregorio tem raio de 110 m; Colorado não tem raio (vale o padrão).
const GREGORIO: [number, number] = [-71.4914, -7.9517];
const COLORADO: [number, number] = [-72.6, -7.6];
const local = (
  id: string,
  nome: string,
  pos: [number, number],
  raioM: number | null,
) => ({
  id,
  nome,
  tipo: "patio",
  obraId: null,
  fornecedorId: null,
  pos,
  tipos: ["patio"],
  raioM,
});
const fontes = (f: Partial<FontesFicha>): FontesFicha => ({
  tanques: [],
  pilhas: [],
  depositos: [],
  localidades: [
    local("l1", "Usina Gregorio", GREGORIO, 110),
    local("l2", "Colorado", COLORADO, null),
  ],
  equipamentos: [{ id: "e1", codigo: "CB-001" }],
  snapLocalM: 300,
  valores: null,
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

  const localDaFicha = (pos: [number, number] | null) =>
    linhasDaFicha(
      { id: "t", alvo: "tanque" },
      fontes({ tanques: [tanque({ id: "t", pos })] }),
    ).find((l) => l.rotulo === "Local")?.valor;

  it("tanque sem local cadastrado pega o local de onde está no mapa", () => {
    // 17 m da Usina Gregorio (Tanque Canteiro 2): dentro do raio de 110 m.
    expect(localDaFicha([GREGORIO[0] + 0.00015, GREGORIO[1]])).toBe(
      "Usina Gregorio",
    );
    // ~370 m do Colorado, fora dos 300 m padrão: diz "perto de", não que está dentro.
    expect(localDaFicha([COLORADO[0] + 0.00336, COLORADO[1]])).toBe(
      "perto de Colorado (370 m)",
    );
    expect(localDaFicha([-70, -9])).toBe("fora de um local");
    expect(localDaFicha(null)).toBe("sem lugar no mapa");
  });

  it("o local cadastrado manda sobre o lugar no mapa", () => {
    const linhas = linhasDaFicha(
      { id: "t", alvo: "tanque" },
      fontes({
        tanques: [tanque({ id: "t", localidadeId: "l2", pos: GREGORIO })],
      }),
    );
    expect(linhas.find((l) => l.rotulo === "Local")?.valor).toBe("Colorado");
  });

  it("valor do que está dentro só para quem vê a Posição; posto externo não tem valor", () => {
    const valores = new Map([
      ["t", 15234.5],
      ["p", 109912.32],
    ]);
    const tanqueComValor = linhasDaFicha(
      { id: "t", alvo: "tanque" },
      fontes({ tanques: [tanque({ id: "t", pos: GREGORIO })], valores }),
    );
    expect(tanqueComValor.find((l) => l.rotulo === "Valor")?.valor).toBe(
      formatarBRL(15234.5),
    );
    const pilhaComValor = linhasDaFicha(
      { id: "p", alvo: "pilha" },
      fontes({ pilhas: [pilha({ saldo: 282, totalEntrada: 282 })], valores }),
    );
    expect(pilhaComValor.find((l) => l.rotulo === "Valor")?.valor).toBe(
      formatarBRL(109912.32),
    );
    const externo = linhasDaFicha(
      { id: "t", alvo: "tanque" },
      fontes({ tanques: [tanque({ id: "t", ehExterno: true })], valores }),
    );
    expect(externo.some((l) => l.rotulo === "Valor")).toBe(false);
    expect(
      linhasDaFicha(
        { id: "t", alvo: "tanque" },
        fontes({ tanques: [tanque({ id: "t" })] }),
      ).some((l) => l.rotulo === "Valor"),
    ).toBe(false);
  });
});

describe("tanque de comboio", () => {
  it("tanque ligado a uma máquina (Meloza) não vira tanque fixo no mapa", () => {
    const objetos = objetosDoEstoque(
      [
        tanque({ id: "fixo", pos: [-72.7, -7.6] }),
        tanque({ id: "meloza", equipamentoId: "mz1", pos: null }),
      ],
      [],
      [],
    );
    expect(objetos.map((o) => o.id)).toEqual(["fixo"]);
  });
});
