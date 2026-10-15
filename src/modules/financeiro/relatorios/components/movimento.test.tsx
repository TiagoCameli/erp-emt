import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import {
  BarraDivergente,
  ValorAnimado,
} from "@/modules/financeiro/relatorios/components/movimento";

afterEach(cleanup);

describe("ValorAnimado", () => {
  it("nasce com o valor final, formatado como o MoneyText", () => {
    // O servidor, o teste, a impressão e quem pediu menos movimento veem o
    // número certo: a contagem só acontece no navegador, ao entrar na tela.
    const { container } = render(<ValorAnimado valor={19069599.57} />);
    // Pelo formatador: o "R$ " leva espaço não separável.
    expect(container.textContent).toBe(formatarBRL(19069599.57));
  });
});

describe("BarraDivergente", () => {
  it("positivo cresce para a direita do zero, negativo para a esquerda", () => {
    const { container, rerender } = render(<BarraDivergente valor={50} maximo={100} />);
    const traco = () => container.querySelectorAll("span > span")[1] as HTMLElement;
    // A largura é `max(x%, 2px)`, que o jsdom não entende; o lado é o que o
    // teste consegue provar.
    expect(traco().className).toContain("left-1/2");
    expect(traco().style.transformOrigin).toBe("left");

    rerender(<BarraDivergente valor={-100} maximo={100} />);
    expect(traco().className).toContain("right-1/2");
    expect(traco().style.transformOrigin).toBe("right");
  });

  it("zero não desenha traço, só o eixo", () => {
    const { container } = render(<BarraDivergente valor={0} maximo={100} />);
    expect(container.querySelectorAll("span > span")).toHaveLength(1);
  });
});
