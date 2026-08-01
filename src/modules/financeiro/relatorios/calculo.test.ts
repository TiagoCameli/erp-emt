import { describe, expect, it } from "vitest";

import {
  agregarAging,
  paraCentavos,
  proximoMes,
  somarPorCategoria,
  totalAging,
  totalCategorias,
  vencidoAging,
  type AgingFaixa,
} from "@/modules/financeiro/relatorios/calculo";

describe("paraCentavos", () => {
  it("converte reais em centavos inteiros", () => {
    expect(paraCentavos(1234.56)).toBe(123456);
  });

  it("aceita string numérica do banco", () => {
    expect(paraCentavos("99.90")).toBe(9990);
  });

  it("null, undefined e vazio viram 0", () => {
    expect(paraCentavos(null)).toBe(0);
    expect(paraCentavos(undefined)).toBe(0);
    expect(paraCentavos("")).toBe(0);
  });

  it("arredonda sem acumular erro de ponto flutuante", () => {
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
  });
});

describe("agregarAging", () => {
  // A faixa chega classificada do banco (fn_rel_aging.faixa_aging): o que se
  // testa aqui é a montagem da lista, não mais o cálculo de dias de atraso.
  it("sempre devolve as seis faixas na ordem fixa", () => {
    const lista = agregarAging([]);
    expect(lista.map((f) => f.faixa)).toEqual([
      "a_vencer",
      "v_1_7",
      "v_8_15",
      "v_16_30",
      "v_31_60",
      "v_60_mais",
    ]);
    expect(lista.every((f) => f.valor === 0)).toBe(true);
  });

  it("soma linhas dentro da mesma faixa", () => {
    const lista = agregarAging([
      { faixa: "v_1_7", valor: 100 },
      { faixa: "v_1_7", valor: 50.5 },
    ]);
    const faixa = lista.find((f) => f.faixa === "v_1_7");
    expect(faixa?.valor).toBe(150.5);
  });

  it("distribui as linhas pelas faixas certas e devolve reais", () => {
    const lista = agregarAging([
      { faixa: "a_vencer", valor: 1000 },
      { faixa: "v_1_7", valor: 200 },
      { faixa: "v_31_60", valor: 300 },
      { faixa: "v_60_mais", valor: 400 },
    ]);
    const valor = (faixa: AgingFaixa["faixa"]) =>
      lista.find((f) => f.faixa === faixa)?.valor;
    expect(valor("a_vencer")).toBe(1000);
    expect(valor("v_1_7")).toBe(200);
    expect(valor("v_31_60")).toBe(300);
    expect(valor("v_60_mais")).toBe(400);
    expect(valor("v_8_15")).toBe(0);
  });

  it("não acumula erro de ponto flutuante somando centavos", () => {
    const lista = agregarAging([
      { faixa: "v_1_7", valor: 0.1 },
      { faixa: "v_1_7", valor: 0.2 },
    ]);
    expect(lista.find((f) => f.faixa === "v_1_7")?.valor).toBe(0.3);
  });

  it("falha alto se o banco mandar faixa que o TypeScript não conhece", () => {
    // Descartar ou somar na faixa errada seria dinheiro sumindo calado.
    expect(() => agregarAging([{ faixa: "v_61_90", valor: 500 }])).toThrow(
      /Faixa de aging desconhecida/,
    );
  });
});

describe("totalAging e vencidoAging", () => {
  const lista = agregarAging([
    { faixa: "a_vencer", valor: 1000 },
    { faixa: "v_1_7", valor: 200 },
    { faixa: "v_31_60", valor: 300 },
  ]);

  it("total soma todas as faixas", () => {
    expect(totalAging(lista)).toBe(1500);
  });

  it("vencido exclui a faixa a vencer", () => {
    expect(vencidoAging(lista)).toBe(500);
  });
});

describe("somarPorCategoria", () => {
  it("soma valores por categoria e ordena do maior para o menor", () => {
    const linhas = somarPorCategoria([
      { categoriaId: "c1", categoria: "Combustível", valor: 100 },
      { categoriaId: "c2", categoria: "Aluguel", valor: 500 },
      { categoriaId: "c1", categoria: "Combustível", valor: 250 },
    ]);
    expect(linhas).toEqual([
      { categoriaId: "c2", categoria: "Aluguel", valor: 500 },
      { categoriaId: "c1", categoria: "Combustível", valor: 350 },
    ]);
  });

  it("agrupa lançamentos sem categoria em 'Sem categoria'", () => {
    const linhas = somarPorCategoria([
      { categoriaId: null, categoria: null, valor: 80 },
      { categoriaId: undefined, categoria: undefined, valor: 20 },
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toEqual({
      categoriaId: null,
      categoria: "Sem categoria",
      valor: 100,
    });
  });

  it("aceita valores como string do banco e devolve reais", () => {
    const linhas = somarPorCategoria([
      { categoriaId: "c1", categoria: "Brita", valor: "1234.56" },
      { categoriaId: "c1", categoria: "Brita", valor: "0.44" },
    ]);
    expect(linhas[0]?.valor).toBe(1235);
  });

  it("lista vazia devolve nenhuma linha", () => {
    expect(somarPorCategoria([])).toEqual([]);
  });
});

describe("totalCategorias", () => {
  it("soma os valores das linhas", () => {
    expect(
      totalCategorias([
        { categoriaId: "c1", categoria: "A", valor: 100 },
        { categoriaId: "c2", categoria: "B", valor: 250.5 },
      ]),
    ).toBe(350.5);
  });

  it("lista vazia soma 0", () => {
    expect(totalCategorias([])).toBe(0);
  });
});

describe("proximoMes", () => {
  it("avança um mês dentro do ano", () => {
    expect(proximoMes("2026-06")).toBe("2026-07-01");
  });

  it("vira o ano em dezembro", () => {
    expect(proximoMes("2026-12")).toBe("2027-01-01");
  });

  it("zero-pad no mês de janeiro", () => {
    expect(proximoMes("2026-01")).toBe("2026-02-01");
  });
});
