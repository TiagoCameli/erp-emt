import { describe, expect, it } from "vitest";

import {
  agregarAging,
  classificarFaixa,
  diasEntre,
  faixaDaParcela,
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

describe("diasEntre", () => {
  it("conta dias inteiros entre duas datas", () => {
    expect(diasEntre("2026-06-01", "2026-06-08")).toBe(7);
  });

  it("é negativo quando a data final é anterior", () => {
    expect(diasEntre("2026-06-10", "2026-06-01")).toBe(-9);
  });

  it("atravessa virada de mês sem erro de fuso", () => {
    expect(diasEntre("2026-01-31", "2026-02-01")).toBe(1);
  });

  it("atravessa ano bissexto corretamente", () => {
    // 2028 é bissexto: 28 -> 29 de fevereiro existe.
    expect(diasEntre("2028-02-28", "2028-03-01")).toBe(2);
  });
});

describe("classificarFaixa (bordas)", () => {
  it("hoje e futuro são a vencer", () => {
    expect(classificarFaixa(0)).toBe("a_vencer");
    expect(classificarFaixa(-5)).toBe("a_vencer");
  });

  it("1 dia vencido entra em v_1_7", () => {
    expect(classificarFaixa(1)).toBe("v_1_7");
  });

  it("7 dias é o teto de v_1_7 e 8 já é v_8_15", () => {
    expect(classificarFaixa(7)).toBe("v_1_7");
    expect(classificarFaixa(8)).toBe("v_8_15");
  });

  it("15 fecha v_8_15, 16 abre v_16_30", () => {
    expect(classificarFaixa(15)).toBe("v_8_15");
    expect(classificarFaixa(16)).toBe("v_16_30");
  });

  it("30 fecha v_16_30, 31 abre v_31_60", () => {
    expect(classificarFaixa(30)).toBe("v_16_30");
    expect(classificarFaixa(31)).toBe("v_31_60");
  });

  it("60 fecha v_31_60, 61 vira v_60_mais", () => {
    expect(classificarFaixa(60)).toBe("v_31_60");
    expect(classificarFaixa(61)).toBe("v_60_mais");
  });
});

describe("faixaDaParcela", () => {
  const hoje = "2026-06-15";

  it("vencimento no futuro é a vencer", () => {
    expect(faixaDaParcela("2026-06-20", hoje)).toBe("a_vencer");
  });

  it("vence exatamente hoje ainda é a vencer", () => {
    expect(faixaDaParcela("2026-06-15", hoje)).toBe("a_vencer");
  });

  it("vencido há 1 dia (data limítrofe) é v_1_7", () => {
    expect(faixaDaParcela("2026-06-14", hoje)).toBe("v_1_7");
  });

  it("vencido há exatamente 7 dias ainda é v_1_7", () => {
    expect(faixaDaParcela("2026-06-08", hoje)).toBe("v_1_7");
  });

  it("vencido há 8 dias já é v_8_15", () => {
    expect(faixaDaParcela("2026-06-07", hoje)).toBe("v_8_15");
  });

  it("parcela sem vencimento conta como a vencer", () => {
    expect(faixaDaParcela(null, hoje)).toBe("a_vencer");
    expect(faixaDaParcela(undefined, hoje)).toBe("a_vencer");
  });
});

describe("agregarAging", () => {
  const hoje = "2026-06-15";

  it("sempre devolve as seis faixas na ordem fixa", () => {
    const lista = agregarAging([], hoje);
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

  it("soma parcelas dentro da mesma faixa", () => {
    const lista = agregarAging(
      [
        { valor: 100, dataVencimento: "2026-06-14" }, // 1 dia: v_1_7
        { valor: 50.5, dataVencimento: "2026-06-09" }, // 6 dias: v_1_7
      ],
      hoje,
    );
    const faixa = lista.find((f) => f.faixa === "v_1_7");
    expect(faixa?.valor).toBe(150.5);
  });

  it("distribui parcelas pelas faixas certas e devolve reais", () => {
    const lista = agregarAging(
      [
        { valor: 1000, dataVencimento: "2026-06-30" }, // futuro: a_vencer
        { valor: 200, dataVencimento: "2026-06-10" }, // 5 dias: v_1_7
        { valor: 300, dataVencimento: "2026-05-15" }, // 31 dias: v_31_60
        { valor: 400, dataVencimento: "2026-01-01" }, // >60: v_60_mais
      ],
      hoje,
    );
    const valor = (faixa: AgingFaixa["faixa"]) =>
      lista.find((f) => f.faixa === faixa)?.valor;
    expect(valor("a_vencer")).toBe(1000);
    expect(valor("v_1_7")).toBe(200);
    expect(valor("v_31_60")).toBe(300);
    expect(valor("v_60_mais")).toBe(400);
    expect(valor("v_8_15")).toBe(0);
  });

  it("não acumula erro de ponto flutuante somando centavos", () => {
    const lista = agregarAging(
      [
        { valor: 0.1, dataVencimento: "2026-06-14" },
        { valor: 0.2, dataVencimento: "2026-06-14" },
      ],
      hoje,
    );
    expect(lista.find((f) => f.faixa === "v_1_7")?.valor).toBe(0.3);
  });
});

describe("totalAging e vencidoAging", () => {
  const hoje = "2026-06-15";
  const lista = agregarAging(
    [
      { valor: 1000, dataVencimento: "2026-06-30" }, // a_vencer
      { valor: 200, dataVencimento: "2026-06-10" }, // v_1_7
      { valor: 300, dataVencimento: "2026-05-15" }, // v_31_60
    ],
    hoje,
  );

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
