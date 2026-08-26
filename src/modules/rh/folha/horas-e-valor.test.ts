/**
 * A conversão horas ↔ valor do desconto, nos dois sentidos.
 *
 * Âncora: CLELTON, salário base R$ 1.621,00. Com 200 h/mês a hora dele vale
 * R$ 8,105 — e é justamente uma hora que cai na metade do centavo, o que faz
 * dele o melhor caso de teste que existe aqui.
 */
import { describe, expect, it } from "vitest";

import {
  HORAS_MES,
  horasDoValor,
  valorDaHora,
  valorDasHoras,
} from "@/modules/rh/folha/horas-e-valor";

const SALARIO = 1621;

describe("valor da hora", () => {
  it("é o salário base dividido por 200", () => {
    expect(HORAS_MES).toBe(200);
    expect(valorDaHora(SALARIO)).toBeCloseTo(8.105, 10);
  });

  it("salário zerado ou negativo não vira hora negativa", () => {
    expect(valorDaHora(0)).toBe(0);
    expect(valorDaHora(-100)).toBe(0);
  });
});

describe("horas → valor", () => {
  it("8 horas do CLELTON dão R$ 64,84", () => {
    // 8 × 8,105 = 64,84 exato.
    expect(valorDasHoras(SALARIO, 8)).toBe(64.84);
  });

  it("1 hora cai na metade do centavo, e sobe", () => {
    // 8,105 → 8,11 (round). Não é "o certo": é uma SUGESTÃO, e o campo de valor
    // continua editável justamente porque o contracheque pode descer para 8,10.
    expect(valorDasHoras(SALARIO, 1)).toBe(8.11);
  });

  it("meia hora e hora e meia", () => {
    // 0,5 × 8,105 = 4,0525 → 4,05
    expect(valorDasHoras(SALARIO, 0.5)).toBe(4.05);
    // 1,5 × 8,105 = 12,1575 → 12,16
    expect(valorDasHoras(SALARIO, 1.5)).toBe(12.16);
  });

  it("o mês inteiro de faltas desconta o salário inteiro", () => {
    // É a prova de que o divisor e o multiplicador são o mesmo número: 200 horas
    // de falta têm de dar exatamente o salário, sem sobra de centavo.
    expect(valorDasHoras(SALARIO, HORAS_MES)).toBe(SALARIO);
    expect(valorDasHoras(3000, HORAS_MES)).toBe(3000);
  });

  it("zero e negativo dão zero", () => {
    expect(valorDasHoras(SALARIO, 0)).toBe(0);
    expect(valorDasHoras(SALARIO, -8)).toBe(0);
    expect(valorDasHoras(0, 8)).toBe(0);
  });

  it("salário redondo não inventa centavo", () => {
    // 3.000 / 200 = 15,00 exatos.
    expect(valorDaHora(3000)).toBe(15);
    expect(valorDasHoras(3000, 8)).toBe(120);
    expect(valorDasHoras(3000, 7.5)).toBe(112.5);
  });
});

describe("valor → horas (o cálculo inverso)", () => {
  it("R$ 64,84 do CLELTON voltam a 8 horas", () => {
    expect(horasDoValor(SALARIO, 64.84)).toBe(8);
  });

  it("R$ 100,00 dão 12,34 horas", () => {
    // 100 / 8,105 = 12,3381... → 12,34
    expect(horasDoValor(SALARIO, 100)).toBe(12.34);
  });

  it("a volta NÃO é exata, e isso é esperado", () => {
    // 12,34 h × 8,105 = 100,0157 → 100,02. Um ciclo valor→horas→valor não
    // devolve o valor de origem, e é por isso que a tela nunca reescreve o valor
    // a partir das horas que ela mesma derivou.
    const horas = horasDoValor(SALARIO, 100);
    expect(valorDasHoras(SALARIO, horas)).toBe(100.02);
    expect(valorDasHoras(SALARIO, horas)).not.toBe(100);
  });

  it("o salário inteiro volta a 200 horas", () => {
    expect(horasDoValor(SALARIO, SALARIO)).toBe(HORAS_MES);
    expect(horasDoValor(3000, 3000)).toBe(HORAS_MES);
  });

  it("zero, negativo e salário zerado dão zero", () => {
    expect(horasDoValor(SALARIO, 0)).toBe(0);
    expect(horasDoValor(SALARIO, -50)).toBe(0);
    expect(horasDoValor(0, 100)).toBe(0);
  });
});

describe("ida e volta nos casos redondos", () => {
  it("com salário redondo, os dois sentidos fecham", () => {
    // Salário 3.000 → hora 15,00. Aqui não há centavo quebrado, então a ida e a
    // volta são exatas — e é a LINHA DE CONTROLE de que a matemática está certa
    // e o resto da imprecisão é só arredondamento de centavo.
    for (const horas of [1, 2, 4, 8, 8.5, 20, 100, 200]) {
      const valor = valorDasHoras(3000, horas);
      expect(horasDoValor(3000, valor)).toBe(horas);
    }
  });
});
