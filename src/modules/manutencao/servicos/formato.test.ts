import { describe, expect, it } from "vitest";

import {
  formatarValorOperacional,
  paraNumeroDoBanco,
  paraNumeroOuNulo,
  rotuloEquipamento,
  rotuloPropriedade,
  somarValoresOperacionais,
} from "@/modules/manutencao/servicos/formato";
import { numeroParaCampo, textoParaNumero } from "@/modules/manutencao/servicos/numero";

// O Intl separa "R$" do número com espaço não separável.
const brl = (texto: string) => texto.replace(/\s/g, " ");

describe("formatarValorOperacional", () => {
  it("mostra as 4 casas quando existem e no mínimo 2", () => {
    expect(brl(formatarValorOperacional(6.3947))).toBe("R$ 6,3947");
    expect(brl(formatarValorOperacional(10))).toBe("R$ 10,00");
    expect(brl(formatarValorOperacional(1234.5))).toBe("R$ 1.234,50");
  });

  it("nulo e NaN viram zero, não 'NaN'", () => {
    expect(brl(formatarValorOperacional(null))).toBe("R$ 0,00");
    expect(brl(formatarValorOperacional(Number.NaN))).toBe("R$ 0,00");
  });
});

describe("somarValoresOperacionais", () => {
  it("soma sem erro de ponto flutuante na quarta casa", () => {
    expect(somarValoresOperacionais([0.1, 0.2])).toBe(0.3);
    expect(somarValoresOperacionais(Array.from({ length: 1000 }, () => 0.0001))).toBe(0.1);
  });
});

describe("rótulos do equipamento", () => {
  it("junta código, descrição e placa sem pedaço vazio", () => {
    expect(rotuloEquipamento({ codigo: "EQ-01", descricao: "Escavadeira 320", placa: "ABC1D23" })).toBe(
      "EQ-01 Escavadeira 320 (ABC1D23)",
    );
    expect(rotuloEquipamento({ codigo: null, descricao: "Rolo", placa: null })).toBe("Rolo");
  });

  it("propriedade curta: próprio, Colorado, alugado", () => {
    expect(rotuloPropriedade("propria")).toBe("Próprio");
    expect(rotuloPropriedade("colorado")).toBe("Colorado");
    expect(rotuloPropriedade("alugada")).toBe("Alugado");
  });
});

describe("conversões numéricas", () => {
  it("NUMERIC do PostgREST como string ou número", () => {
    expect(paraNumeroDoBanco("12.3456")).toBe(12.3456);
    expect(paraNumeroDoBanco(null)).toBe(0);
    expect(paraNumeroOuNulo(null)).toBeNull();
    expect(paraNumeroOuNulo("7")).toBe(7);
  });

  it("texto do campo pt-BR para número, sem ler milhar como decimal", () => {
    expect(textoParaNumero("1234,5678", 4)).toBe(1234.5678);
    expect(textoParaNumero("1.234,5", 4)).toBe(1234.5);
    // Campo de 4 casas: ponto único com até 4 dígitos é DECIMAL (regra do
    // canônico, e o input já troca o ponto por vírgula na digitação).
    expect(textoParaNumero("1.500", 4)).toBe(1.5);
    expect(textoParaNumero("2.5", 4)).toBe(2.5);
    expect(textoParaNumero("", 4)).toBeNull();
    expect(textoParaNumero("abc", 4)).toBeNull();
    expect(textoParaNumero("1,23456", 4)).toBeNull();
  });

  it("número do banco de volta ao campo", () => {
    expect(numeroParaCampo(1234.5)).toBe("1234,5");
    expect(numeroParaCampo(null)).toBe("");
    expect(numeroParaCampo(10)).toBe("10");
  });
});
