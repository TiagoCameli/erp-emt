import { describe, expect, it } from "vitest";

import {
  abaixoDoMinimo,
  arredondar,
  formatarPreco,
  numeroParaTexto,
  paraNumero,
  resumirSaldos,
  totalDaLinha,
  valorEmEstoque,
} from "@/modules/manutencao/almoxarifado/calculo";

/** O Intl usa espaço não separável depois do "R$": compara sem ele. */
function semNbsp(texto: string): string {
  return texto.replace(/\s/g, " ");
}

describe("paraNumero", () => {
  it("lê vírgula como decimal e ponto como milhar", () => {
    expect(paraNumero("1.234,5678")).toBe(1234.5678);
    expect(paraNumero("6,3947")).toBe(6.3947);
  });

  it("lê ponto único como decimal quando cabe nas 4 casas (teclado numérico)", () => {
    expect(paraNumero("1234.5")).toBe(1234.5);
    expect(paraNumero("6.3947")).toBe(6.3947);
  });

  it("recusa mais de 4 casas em vez de arredondar calado", () => {
    expect(paraNumero("1,23456")).toBeNull();
  });

  it("recusa vazio e texto", () => {
    expect(paraNumero("")).toBeNull();
    expect(paraNumero("abc")).toBeNull();
    expect(paraNumero("-1")).toBeNull();
  });
});

describe("numeroParaTexto", () => {
  it("devolve o texto cru do formulário, sem milhar e sem zeros à direita", () => {
    expect(numeroParaTexto(1234.5)).toBe("1234,5");
    expect(numeroParaTexto(6.3947)).toBe("6,3947");
    expect(numeroParaTexto(10)).toBe("10");
    expect(numeroParaTexto(0)).toBe("0");
  });

  it("nulo vira vazio", () => {
    expect(numeroParaTexto(null)).toBe("");
    expect(numeroParaTexto(undefined)).toBe("");
  });

  it("faz ida e volta com paraNumero", () => {
    for (const valor of [0.0001, 1, 12.5, 6.3947, 9999999999.9999]) {
      expect(paraNumero(numeroParaTexto(valor))).toBe(valor);
    }
  });
});

describe("arredondar", () => {
  it("arredonda meio para longe do zero, como o round do Postgres", () => {
    expect(arredondar(1.00005, 4)).toBe(1.0001);
    expect(arredondar(2.5, 0)).toBe(3);
    expect(arredondar(-2.5, 0)).toBe(-3);
  });

  it("não mexe no que já tem as casas", () => {
    expect(arredondar(6.3947, 4)).toBe(6.3947);
  });
});

describe("totalDaLinha", () => {
  it("é quantidade × valor unitário em 4 casas, igual à RPC", () => {
    // 3 × 6,3947 = 19,1841
    expect(totalDaLinha(3, 6.3947)).toBe(19.1841);
    // 0,3333 × 3,3333 = 1,11098889 → 1,1110
    expect(totalDaLinha(0.3333, 3.3333)).toBe(1.111);
  });

  it("não sofre do erro binário de 0,1 × 3", () => {
    expect(totalDaLinha(0.1, 3)).toBe(0.3);
  });
});

describe("valorEmEstoque", () => {
  it("multiplica o saldo pelo custo médio de 8 casas e arredonda em 4", () => {
    // custo médio 20 / 3 = 6,66666667 (como o banco guarda); saldo 3 → 20,0000
    expect(valorEmEstoque(3, 6.66666667)).toBe(20);
    // saldo 2 → 13,33333334 → 13,3333
    expect(valorEmEstoque(2, 6.66666667)).toBe(13.3333);
  });

  it("saldo zero vale zero", () => {
    expect(valorEmEstoque(0, 6.3947)).toBe(0);
  });
});

describe("abaixoDoMinimo", () => {
  it("sem mínimo nunca está abaixo", () => {
    expect(abaixoDoMinimo(0, null)).toBe(false);
  });

  it("menor que o mínimo está abaixo", () => {
    expect(abaixoDoMinimo(1.9999, 2)).toBe(true);
    expect(abaixoDoMinimo(0, 1)).toBe(true);
  });

  it("igual ao mínimo não está abaixo", () => {
    expect(abaixoDoMinimo(2, 2)).toBe(false);
  });

  it("mínimo zero nunca dispara (saldo não fica negativo)", () => {
    expect(abaixoDoMinimo(0, 0)).toBe(false);
  });
});

describe("resumirSaldos", () => {
  it("conta com saldo, zerados e abaixo do mínimo, e soma o valor", () => {
    const resumo = resumirSaldos([
      { saldo: 10, custoMedio: 6.3947, estoqueMinimo: 5 }, // ok: 63,947
      { saldo: 1, custoMedio: 100, estoqueMinimo: 2 }, // abaixo: 100
      { saldo: 0, custoMedio: 50, estoqueMinimo: 1 }, // zerado e abaixo
      { saldo: 0, custoMedio: 50, estoqueMinimo: null }, // zerado, sem mínimo
    ]);
    expect(resumo).toEqual({
      comSaldo: 2,
      zerados: 2,
      abaixoDoMinimo: 2,
      valorEmEstoque: 163.947,
    });
  });

  it("soma o valor já arredondado de cada linha (o cartão bate com a tabela)", () => {
    // Cada linha: 2 × 6,66666667 = 13,3333 (arredondado). Soma das linhas: 26,6666.
    // Somar antes de arredondar daria 26,6667, e o cartão não bateria com a tabela.
    const resumo = resumirSaldos([
      { saldo: 2, custoMedio: 6.66666667, estoqueMinimo: null },
      { saldo: 2, custoMedio: 6.66666667, estoqueMinimo: null },
    ]);
    expect(resumo.valorEmEstoque).toBe(26.6666);
  });

  it("lista vazia é tudo zero", () => {
    expect(resumirSaldos([])).toEqual({
      comSaldo: 0,
      zerados: 0,
      abaixoDoMinimo: 0,
      valorEmEstoque: 0,
    });
  });
});

describe("formatarPreco", () => {
  it("mostra no mínimo 2 e no máximo 4 casas", () => {
    expect(semNbsp(formatarPreco(10))).toBe("R$ 10,00");
    expect(semNbsp(formatarPreco(6.3947))).toBe("R$ 6,3947");
    expect(semNbsp(formatarPreco(1234.5))).toBe("R$ 1.234,50");
  });

  it("corta o custo médio de 8 casas em 4", () => {
    expect(semNbsp(formatarPreco(6.66666667))).toBe("R$ 6,6667");
  });

  it("nulo vira zero", () => {
    expect(semNbsp(formatarPreco(null))).toBe("R$ 0,00");
  });
});
