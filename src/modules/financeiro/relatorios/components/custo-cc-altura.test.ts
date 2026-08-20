import { describe, expect, it } from "vitest";

import {
  alturaDoGrafico,
  barrasDoGrafico,
  MAX_BARRAS,
} from "@/modules/financeiro/relatorios/components/custo-cc-altura";

/**
 * A altura é contrato entre DUAS coisas: o gráfico e o Skeleton do
 * `next/dynamic`, que não recebe props. Se as duas não lerem o mesmo número, a
 * página pula quando o Recharts termina de baixar — e isso é exatamente o tipo
 * de coisa que jsdom não pega, então o que se trava aqui é a conta.
 */
describe("barrasDoGrafico", () => {
  it("desenha uma barra por centro enquanto cabe no teto", () => {
    expect(barrasDoGrafico(0)).toBe(0);
    expect(barrasDoGrafico(1)).toBe(1);
    expect(barrasDoGrafico(MAX_BARRAS)).toBe(MAX_BARRAS);
  });

  it("acima do teto acrescenta UMA barra, a de Outros", () => {
    // O ponto: 13 centros e 500 centros desenham o mesmo número de barras. Sem
    // isso a altura cresceria sem limite com a base.
    expect(barrasDoGrafico(MAX_BARRAS + 1)).toBe(MAX_BARRAS + 1);
    expect(barrasDoGrafico(500)).toBe(MAX_BARRAS + 1);
  });
});

describe("alturaDoGrafico", () => {
  it("cresce com o número de barras", () => {
    expect(alturaDoGrafico(12)).toBeGreaterThan(alturaDoGrafico(3));
  });

  it("respeita o piso quando há pouquíssimo centro", () => {
    // Um centro só não pode sair achatado contra o eixo de valor.
    expect(alturaDoGrafico(0)).toBe(180);
    expect(alturaDoGrafico(1)).toBe(180);
  });

  it("para de crescer depois do teto de barras", () => {
    expect(alturaDoGrafico(500)).toBe(alturaDoGrafico(MAX_BARRAS + 1));
  });

  it("reserva faixa para cada barra mais o eixo", () => {
    // 13 barras (12 + Outros) a 34px, mais 44px de eixo.
    expect(alturaDoGrafico(MAX_BARRAS + 1)).toBe(13 * 34 + 44);
  });
});
