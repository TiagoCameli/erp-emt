import { describe, expect, it } from "vitest";

import {
  calcularINSS,
  calcularIRRF,
  calcularIRRFCompleto,
  calcularIRRFSimplificado,
  type FaixaInss,
  type FaixaIrrf,
} from "@/modules/rh/folha/calculo-imposto";

/**
 * Tabelas HIPOTÉTICAS de valor conhecido — provam o MÉTODO, não as taxas
 * reais (essas o Tiago cadastra). `aliquota` é percentual (0–100), como no
 * banco (`numeric(6,3)`); o cálculo divide por 100. Cada teste traz a conta
 * feita à mão no comentário.
 */

// INSS progressivo: 7,5% até 1000; 9% de 1000 a 2000 (teto = 2000).
const FAIXAS_INSS: FaixaInss[] = [
  { limiteAte: 1000, aliquota: 7.5 },
  { limiteAte: 2000, aliquota: 9 },
];

// IRRF: isento até 2000; 10% até 3000 (parcela 200); 20% acima (parcela 500).
const FAIXAS_IRRF: FaixaIrrf[] = [
  { limiteAte: 2000, aliquota: 0, parcelaDeduzir: 0 },
  { limiteAte: 3000, aliquota: 10, parcelaDeduzir: 200 },
  { limiteAte: 999_999_999, aliquota: 20, parcelaDeduzir: 500 },
];

describe("calcularINSS", () => {
  it("salário dentro da 1ª faixa: 500 -> 500×7,5% = 37,50", () => {
    // 500 × 0,075 = 37,50
    expect(calcularINSS(500, FAIXAS_INSS)).toBe(37.5);
  });

  it("borda exata da 1ª faixa: 1000 -> 1000×7,5% = 75,00", () => {
    // 1000 × 0,075 = 75,00
    expect(calcularINSS(1000, FAIXAS_INSS)).toBe(75);
  });

  it("salário na 2ª faixa: 1500 -> 1000×7,5% + 500×9% = 120,00", () => {
    // 75 + 45 = 120,00
    expect(calcularINSS(1500, FAIXAS_INSS)).toBe(120);
  });

  it("no teto exato: 2000 -> 1000×7,5% + 1000×9% = 165,00", () => {
    // 75 + 90 = 165,00
    expect(calcularINSS(2000, FAIXAS_INSS)).toBe(165);
  });

  it("acima do teto: 3000 trava em 165,00 (não soma além de 2000)", () => {
    // 1000×0,075 + 1000×0,09 = 75 + 90 = 165,00; porção acima de 2000 não conta
    expect(calcularINSS(3000, FAIXAS_INSS)).toBe(165);
  });

  it("arredonda em 2 casas: 1234,56 -> 1000×7,5% + 234,56×9% = 96,11", () => {
    // 75 + 21,1104 = 96,1104 -> 96,11
    expect(calcularINSS(1234.56, FAIXAS_INSS)).toBe(96.11);
  });

  it("ordena faixas defensivamente (fora de ordem dá o mesmo resultado)", () => {
    const foraDeOrdem: FaixaInss[] = [
      { limiteAte: 2000, aliquota: 9 },
      { limiteAte: 1000, aliquota: 7.5 },
    ];
    // 1500 -> 75 + 45 = 120,00 igual à tabela ordenada
    expect(calcularINSS(1500, foraDeOrdem)).toBe(120);
  });

  it("faixas vazias -> 0", () => {
    expect(calcularINSS(1500, [])).toBe(0);
  });

  it("salário 0 -> 0", () => {
    expect(calcularINSS(0, FAIXAS_INSS)).toBe(0);
  });
});

describe("calcularIRRFCompleto", () => {
  it("base na faixa isenta -> 0", () => {
    // base = 2000 − 100 − 0 = 1900 <= 2000 (isento) -> 0
    expect(calcularIRRFCompleto(2000, 100, 0, FAIXAS_IRRF, 189.59)).toBe(0);
  });

  it("faixa do meio com parcela deduzida", () => {
    // base = 3000 − 300 − 0 = 2700 (faixa 10%, parcela 200)
    // 2700 × 0,10 − 200 = 270 − 200 = 70,00
    expect(calcularIRRFCompleto(3000, 300, 0, FAIXAS_IRRF, 189.59)).toBe(70);
  });

  it("dependentes reduzem a base (2 dep × 200)", () => {
    // base = 3000 − 300 − 2×200 = 2300 (faixa 10%, parcela 200)
    // 2300 × 0,10 − 200 = 230 − 200 = 30,00
    expect(calcularIRRFCompleto(3000, 300, 2, FAIXAS_IRRF, 200)).toBe(30);
  });

  it("faixa mais alta (acima da 2ª faixa)", () => {
    // base = 5000 − 500 − 0 = 4500 (faixa 20%, parcela 500)
    // 4500 × 0,20 − 500 = 900 − 500 = 400,00
    expect(calcularIRRFCompleto(5000, 500, 0, FAIXAS_IRRF, 189.59)).toBe(400);
  });

  it("base acima de TODOS os limites usa a última faixa", () => {
    // tabela onde a última faixa tem teto finito (4000)
    const faixasTetoFinito: FaixaIrrf[] = [
      { limiteAte: 2000, aliquota: 0, parcelaDeduzir: 0 },
      { limiteAte: 4000, aliquota: 15, parcelaDeduzir: 300 },
    ];
    // base = 5800 − 800 − 0 = 5000 > 4000 -> última faixa (15%, parcela 300)
    // 5000 × 0,15 − 300 = 750 − 300 = 450,00
    expect(calcularIRRFCompleto(5800, 800, 0, faixasTetoFinito, 0)).toBe(450);
  });

  it("base negativa -> 0", () => {
    // base = 1000 − 900 − 2×500 = −900 -> 0
    expect(calcularIRRFCompleto(1000, 900, 2, FAIXAS_IRRF, 500)).toBe(0);
  });

  it("nunca negativo: imposto calculado < 0 vira 0", () => {
    // tabela onde a parcela supera base×aliquota
    const faixasParcelaAlta: FaixaIrrf[] = [
      { limiteAte: 2000, aliquota: 0, parcelaDeduzir: 0 },
      { limiteAte: 3000, aliquota: 10, parcelaDeduzir: 300 },
    ];
    // base = 2350 − 300 − 0 = 2050 (faixa 10%, parcela 300)
    // 2050 × 0,10 − 300 = 205 − 300 = −95 -> 0
    expect(calcularIRRFCompleto(2350, 300, 0, faixasParcelaAlta, 0)).toBe(0);
  });

  it("faixas vazias -> 0", () => {
    expect(calcularIRRFCompleto(5000, 500, 0, [], 189.59)).toBe(0);
  });
});

describe("calcularIRRFSimplificado", () => {
  it("base = salário − desconto simplificado", () => {
    // base = 3000 − 500 = 2500 (faixa 10%, parcela 200)
    // 2500 × 0,10 − 200 = 250 − 200 = 50,00
    expect(calcularIRRFSimplificado(3000, FAIXAS_IRRF, 500)).toBe(50);
  });

  it("base na faixa isenta -> 0", () => {
    // base = 2200 − 500 = 1700 <= 2000 (isento) -> 0
    expect(calcularIRRFSimplificado(2200, FAIXAS_IRRF, 500)).toBe(0);
  });

  it("faixas vazias -> 0", () => {
    expect(calcularIRRFSimplificado(3000, [], 500)).toBe(0);
  });
});

describe("calcularIRRF (min entre completo e simplificado)", () => {
  const DEDUCAO_DEP = 200;
  const DESCONTO_SIMPL = 500;

  it("pega o simplificado quando ele é menor (poucos dependentes)", () => {
    // completo:      base = 4000 − 400 − 0 = 3600 -> 3600×0,20 − 500 = 220,00
    // simplificado:  base = 4000 − 500 = 3500 -> 3500×0,20 − 500 = 200,00
    // min = 200,00
    expect(
      calcularIRRF(4000, 400, 0, FAIXAS_IRRF, DEDUCAO_DEP, DESCONTO_SIMPL),
    ).toBe(200);
  });

  it("pega o completo quando ele é menor (muitos dependentes)", () => {
    // completo:      base = 4000 − 400 − 5×200 = 2600 -> 2600×0,10 − 200 = 60,00
    // simplificado:  base = 4000 − 500 = 3500 -> 3500×0,20 − 500 = 200,00
    // min = 60,00
    expect(
      calcularIRRF(4000, 400, 5, FAIXAS_IRRF, DEDUCAO_DEP, DESCONTO_SIMPL),
    ).toBe(60);
  });

  it("empate: ambos zero (isento nos dois) -> 0", () => {
    // completo:     base = 2000 − 100 = 1900 -> 0
    // simplificado: base = 2000 − 500 = 1500 -> 0
    expect(
      calcularIRRF(2000, 100, 0, FAIXAS_IRRF, DEDUCAO_DEP, DESCONTO_SIMPL),
    ).toBe(0);
  });
});
