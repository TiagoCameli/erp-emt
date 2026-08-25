/**
 * A prévia do desconto tem que dar o MESMO número que o banco grava.
 *
 * A âncora é o caso real que originou a mudança: CLELTON PEREIRA DE OLIVEIRA,
 * salário base R$ 1.621,00, gratificação R$ 286,00, 7,5% descontados. O banco
 * gravou desconto R$ 121,58 e líquido R$ 1.785,42 (medido em produção, folha de
 * agosto de 2026). Se a prévia divergir disso, ela mente na tela.
 */
import { describe, expect, it } from "vitest";

import {
  descontoDoSalario,
  liquidoPrevisto,
} from "@/modules/rh/folha/previa-desconto";

const SALARIO = 1621;
const GRATIFICACAO = 286;
/** O que o banco gravou para 7,5% sobre 1.621,00. */
const DESCONTO_REAL = 121.58;
const LIQUIDO_REAL = 1785.42;

const semOutrosDescontos = {
  inss: 0,
  irrf: 0,
  adiantamentos: 0,
};

describe("o caso do CLELTON fecha com o banco", () => {
  it("7,5% de 1.621,00 dá os R$ 121,58 que o banco gravou", () => {
    expect(descontoDoSalario(SALARIO, 7.5)).toBe(DESCONTO_REAL);
  });

  it("o líquido dá os R$ 1.785,42 que o banco gravou", () => {
    expect(
      liquidoPrevisto({
        salarioBase: SALARIO,
        gratificacao: GRATIFICACAO,
        desconto: DESCONTO_REAL,
        ...semOutrosDescontos,
      }),
    ).toBe(LIQUIDO_REAL);
  });

  it("LINHA DE CONTROLE: sem desconto, o líquido é o bruto inteiro", () => {
    // Se esta linha desse 1.785,42 também, os dois testes acima estariam
    // passando por acidente — e o desconto não estaria saindo de lugar nenhum.
    expect(
      liquidoPrevisto({
        salarioBase: SALARIO,
        gratificacao: GRATIFICACAO,
        desconto: 0,
        ...semOutrosDescontos,
      }),
    ).toBe(1907);
  });
});

describe("a base do desconto é o salário, não o bruto", () => {
  it("a gratificação NÃO entra na base", () => {
    // 7,5% de 1.907 daria 143,03. A regra é 7,5% de 1.621 = 121,58, e é essa
    // diferença de R$ 21,45 que o teste protege.
    expect(descontoDoSalario(SALARIO, 7.5)).toBe(121.58);
    expect(descontoDoSalario(SALARIO + GRATIFICACAO, 7.5)).toBe(143.03);
  });
});

describe("nulo e zero", () => {
  it("nulo desconta zero", () => {
    expect(descontoDoSalario(SALARIO, null)).toBe(0);
  });

  it("zero desconta zero", () => {
    expect(descontoDoSalario(SALARIO, 0)).toBe(0);
  });

  it("os dois dão o mesmo dinheiro: a diferença é só no que se grava", () => {
    expect(descontoDoSalario(SALARIO, null)).toBe(
      descontoDoSalario(SALARIO, 0),
    );
  });
});

describe("centavos", () => {
  it("arredonda em 2 casas, igual ao round() do banco", () => {
    // 7,5% de 1.621,00 = 121,575 exatos. O banco faz round(...,2) = 121,58, e
    // truncar aqui daria 121,57: um centavo de diferença entre a tela e o que
    // foi gravado, no campo que a pessoa está justamente conferindo.
    expect(descontoDoSalario(1621, 7.5)).toBe(121.58);
    // 3,33% de 1.000,00 = 33,30
    expect(descontoDoSalario(1000, 3.33)).toBe(33.3);
    // percentual com 4 casas (o máximo que o campo aceita)
    expect(descontoDoSalario(2500, 1.2345)).toBe(30.86);
  });

  it("100% desconta o salário base inteiro, e a gratificação sobra", () => {
    expect(descontoDoSalario(SALARIO, 100)).toBe(SALARIO);
    expect(
      liquidoPrevisto({
        salarioBase: SALARIO,
        gratificacao: GRATIFICACAO,
        desconto: SALARIO,
        ...semOutrosDescontos,
      }),
    ).toBe(GRATIFICACAO);
  });

  it("soma sem erro de ponto flutuante", () => {
    // 0,1 + 0,2 em float não é 0,3. O líquido passa por seis somas de dinheiro.
    expect(
      liquidoPrevisto({
        salarioBase: 0.1,
        gratificacao: 0.2,
        desconto: 0,
        ...semOutrosDescontos,
      }),
    ).toBe(0.3);
  });
});

describe("o líquido não fica negativo", () => {
  it("desconto maior que o disponível para em zero, não em negativo", () => {
    // O banco recusa a gravação nesse caso, com uma mensagem que manda regerar.
    // A prévia mostrando R$ 0,00 é o aviso de que o valor não vai ser aceito.
    expect(
      liquidoPrevisto({
        salarioBase: 1000,
        gratificacao: 0,
        desconto: 1000,
        inss: 0,
        irrf: 0,
        adiantamentos: 500,
      }),
    ).toBe(0);
  });

  it("LINHA DE CONTROLE: quando cabe, o número passa inteiro", () => {
    // Mesmo adiantamento de R$ 500, desconto que cabe: 1.000 − 50 − 500 = 450.
    expect(
      liquidoPrevisto({
        salarioBase: 1000,
        gratificacao: 0,
        desconto: 50,
        inss: 0,
        irrf: 0,
        adiantamentos: 500,
      }),
    ).toBe(450);
  });
});

describe("INSS e IRRF continuam saindo do líquido", () => {
  it("os três descontos se somam", () => {
    // Salário 5.000, INSS 500, IRRF 300, desconto por pessoa 250 (5%).
    expect(descontoDoSalario(5000, 5)).toBe(250);
    expect(
      liquidoPrevisto({
        salarioBase: 5000,
        gratificacao: 0,
        desconto: 250,
        inss: 500,
        irrf: 300,
        adiantamentos: 0,
      }),
    ).toBe(3950);
  });
});
