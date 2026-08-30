import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FiltroValor } from "@/components/canonicos/filter-bar";

/**
 * O filtro de faixa de valor: botão com o resumo, barra atrás de um clique.
 *
 * A aritmética tem teste próprio em `filtro-valor-calculo.test.ts`. Aqui o que
 * se prova é o que só existe na tela: o botão diz a faixa em português, a barra
 * não fica na barra de filtros, e o popover funciona sem `maiorValor`.
 */

function abrir(props: Partial<React.ComponentProps<typeof FiltroValor>> = {}) {
  const onValorChange = vi.fn();
  render(<FiltroValor de="" ate="" onValorChange={onValorChange} {...props} />);
  return onValorChange;
}

describe("FiltroValor", () => {
  afterEach(cleanup);

  describe("o botão diz a faixa em português", () => {
    it("sem faixa, convida", () => {
      abrir();
      expect(
        screen.getByRole("button", { name: "Valor" }).textContent,
      ).toContain("Qualquer valor");
    });

    it("com as duas pontas, diz 'a'", () => {
      abrir({ de: "1000", ate: "50000" });
      const texto =
        screen.getByRole("button", { name: "Valor" }).textContent ?? "";
      expect(texto).toContain("1.000,00");
      expect(texto).toContain("50.000,00");
    });

    it("com uma ponta só, diz qual", () => {
      // "1000 - " deixaria a pessoa em dúvida sobre se o campo está vazio ou se
      // o filtro está quebrado.
      abrir({ de: "1000" });
      expect(
        screen.getByRole("button", { name: "Valor" }).textContent,
      ).toContain("acima de");
      cleanup();

      abrir({ ate: "50000" });
      expect(
        screen.getByRole("button", { name: "Valor" }).textContent,
      ).toContain("até");
    });
  });

  it("a barra NÃO fica na barra de filtros: mora atrás do clique", () => {
    // Condição do Tiago em 29/08/2026, a mesma da régua de datas.
    abrir({ maiorValor: 154700 });
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByLabelText("Valor: mínimo")).toBeNull();
  });

  it("o X ao lado limpa sem abrir o popover", () => {
    const onValorChange = abrir({ de: "1000", ate: "50000" });
    fireEvent.click(screen.getByRole("button", { name: "Limpar valor" }));
    expect(onValorChange).toHaveBeenCalledWith("", "");
  });

  it("sem faixa, não há o que limpar", () => {
    abrir();
    expect(screen.queryByRole("button", { name: "Limpar valor" })).toBeNull();
  });

  describe("dentro do popover", () => {
    it("a barra aparece quando a tela informa o maior valor", () => {
      abrir({ maiorValor: 154700 });
      fireEvent.click(screen.getByRole("button", { name: "Valor" }));

      // Duas alças: mínimo e máximo.
      expect(screen.getAllByRole("slider")).toHaveLength(2);
      // A ponta da escala avisa que passar do fim é "sem limite".
      expect(screen.getByText(/200\.000,00\+/)).toBeTruthy();
    });

    it("sem o maior valor, sobram os campos e nenhuma barra sem escala", () => {
      // Barra sem escala é barra que mente sobre onde os valores estão.
      abrir();
      fireEvent.click(screen.getByRole("button", { name: "Valor" }));

      expect(screen.queryByRole("slider")).toBeNull();
      expect(screen.getByLabelText("Valor: mínimo")).toBeTruthy();
      expect(screen.getByLabelText("Valor: máximo")).toBeTruthy();
    });

    it("os campos continuam aceitando o número exato", () => {
      const onValorChange = abrir({
        de: "1000",
        ate: "50000",
        maiorValor: 154700,
      });
      fireEvent.click(screen.getByRole("button", { name: "Valor" }));

      fireEvent.change(screen.getByLabelText("Valor: mínimo"), {
        target: { value: "1234.56" },
      });
      expect(onValorChange).toHaveBeenLastCalledWith("1234.56", "50000");
    });

    it("as alças abrem nas bordas quando não há faixa", () => {
      abrir({ maiorValor: 154700 });
      fireEvent.click(screen.getByRole("button", { name: "Valor" }));

      const alcas = screen.getAllByRole("slider");
      expect(alcas[0]!.getAttribute("aria-valuenow")).toBe("0");
      expect(alcas[1]!.getAttribute("aria-valuenow")).toBe("200000");
    });

    it("as alças abrem na faixa filtrada", () => {
      abrir({ de: "1000", ate: "50000", maiorValor: 154700 });
      fireEvent.click(screen.getByRole("button", { name: "Valor" }));

      const alcas = screen.getAllByRole("slider");
      expect(alcas[0]!.getAttribute("aria-valuenow")).toBe("1000");
      expect(alcas[1]!.getAttribute("aria-valuenow")).toBe("50000");
    });
  });
});
