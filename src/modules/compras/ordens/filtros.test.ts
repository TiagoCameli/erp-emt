import { describe, expect, it } from "vitest";

import { lerFaixaValor } from "@/modules/compras/ordens/filtros";

describe("lerFaixaValor", () => {
  it("sem parâmetro nenhum não filtra nada", () => {
    expect(lerFaixaValor(undefined, undefined)).toEqual({
      valorDe: undefined,
      valorAte: undefined,
      textoDe: "",
      textoAte: "",
    });
  });

  it("lê uma ponta só", () => {
    expect(lerFaixaValor("1500", undefined)).toEqual({
      valorDe: 1500,
      valorAte: undefined,
      textoDe: "1500",
      textoAte: "",
    });
  });

  it("troca a faixa invertida de lado só na consulta", () => {
    const faixa = lerFaixaValor("900", "100");
    expect(faixa.valorDe).toBe(100);
    expect(faixa.valorAte).toBe(900);
    // O input continua mostrando o que a pessoa digitou: normalizar o texto
    // faria a tela renavegar sem parar atrás de um valor que nunca casa.
    expect(faixa.textoDe).toBe("900");
    expect(faixa.textoAte).toBe("100");
  });

  it("devolve o texto do input sem normalizar o decimal", () => {
    const faixa = lerFaixaValor("1000.50", "2000.00");
    expect(faixa.valorDe).toBe(1000.5);
    expect(faixa.valorAte).toBe(2000);
    expect(faixa.textoDe).toBe("1000.50");
    expect(faixa.textoAte).toBe("2000.00");
  });

  it("ignora texto que não é valor, negativo e parâmetro repetido", () => {
    expect(lerFaixaValor("abc", "-10")).toEqual({
      valorDe: undefined,
      valorAte: undefined,
      textoDe: "",
      textoAte: "",
    });
    expect(lerFaixaValor(["1", "2"], "")).toEqual({
      valorDe: undefined,
      valorAte: undefined,
      textoDe: "",
      textoAte: "",
    });
  });
});
