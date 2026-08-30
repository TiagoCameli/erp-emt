import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FiltroMesPeriodo } from "@/components/canonicos/filter-bar";

/**
 * O filtro de MÊS DE REFERÊNCIA por intervalo.
 *
 * A régua tem teste próprio; aqui o que se prova é o que este filtro acrescenta
 * a ela: as pontas viajam no DIA 1 (que é o que a coluna `mes_competencia`
 * guarda), o resumo fala em meses, e a régua não oferece corte que o dado não
 * tem.
 */

vi.mock("@/lib/formatadores", async (original) => ({
  ...(await original<typeof import("@/lib/formatadores")>()),
  dataHojeISO: () => "2026-08-29",
}));

function abrir(de = "", ate = "") {
  const onPeriodoChange = vi.fn();
  render(
    <FiltroMesPeriodo de={de} ate={ate} onPeriodoChange={onPeriodoChange} />,
  );
  return onPeriodoChange;
}

const botao = () => screen.getByRole("button", { name: "Mês de referência" });

describe("FiltroMesPeriodo", () => {
  afterEach(cleanup);

  describe("o botão diz o intervalo em meses", () => {
    it("sem filtro, convida", () => {
      abrir();
      expect(botao().textContent).toContain("Todos os meses");
    });

    it("um intervalo vira 'mai - ago de 2026'", () => {
      abrir("2026-05-01", "2026-08-01");
      expect(botao().textContent).toContain("mai - ago de 2026");
    });

    it("um mês só tem nome próprio", () => {
      // O link antigo `?mes=2026-07` chega aqui como janela de um mês, e não
      // pode virar "01/07/2026 - 01/07/2026" no botão.
      abrir("2026-07-01", "2026-07-01");
      expect(botao().textContent).toContain("jul de 2026");
    });

    it("o ano inteiro vira só o ano", () => {
      abrir("2026-01-01", "2026-12-01");
      expect(botao().textContent).toContain("2026");
    });
  });

  it("a régua não fica na barra: mora atrás do clique", () => {
    abrir();
    expect(screen.queryByLabelText(/régua de/i)).toBeNull();
  });

  describe("dentro do popover", () => {
    it("oferece ano, trimestre e mês, e NÃO oferece semana nem dia", () => {
      // `mes_competencia` guarda o dia 1 de cada mês: um corte no dia 17 não
      // existe no dado, e oferecê-lo seria oferecer um filtro que não filtra.
      abrir();
      fireEvent.click(botao());

      for (const nome of ["Anos", "Trimestres", "Meses"]) {
        expect(screen.getByRole("button", { name: nome })).toBeTruthy();
      }
      expect(screen.queryByRole("button", { name: "Semanas" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Dias" })).toBeNull();
    });

    it("não mostra campo de data exata", () => {
      abrir();
      fireEvent.click(botao());
      expect(
        screen.queryByLabelText("Mês de referência: data inicial"),
      ).toBeNull();
    });

    it("as pontas saem no DIA 1, não no último dia do mês", () => {
      // A régua raciocina em dias e devolveria 31/08 na ponta final. Deixar
      // assim funcionaria por acidente (`lte('2026-08-31')` também alcança o dia
      // 1) e quebraria no dia em que alguém comparasse as duas pontas entre si.
      const onPeriodoChange = abrir();
      fireEvent.click(botao());

      const ago = screen.getByRole("button", { name: "agosto de 2026" });
      fireEvent.pointerDown(ago, { button: 0 });
      fireEvent.pointerUp(ago);

      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-08-01",
        "2026-08-01",
      );
    });

    it("arrastar de maio a agosto dá as duas pontas no dia 1", () => {
      const onPeriodoChange = abrir();
      fireEvent.click(botao());

      fireEvent.pointerDown(
        screen.getByRole("button", { name: "maio de 2026" }),
        {
          button: 0,
        },
      );
      fireEvent.pointerEnter(
        screen.getByRole("button", { name: "agosto de 2026" }),
      );
      fireEvent.pointerUp(
        screen.getByRole("button", { name: "agosto de 2026" }),
      );

      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-05-01",
        "2026-08-01",
      );
    });

    it("a régua abre pintando o intervalo filtrado", () => {
      abrir("2026-05-01", "2026-08-01");
      fireEvent.click(botao());

      const marcados = ["maio", "junho", "julho", "agosto"].map((mes) =>
        screen
          .getByRole("button", { name: `${mes} de 2026` })
          .getAttribute("aria-pressed"),
      );
      expect(marcados).toEqual(["true", "true", "true", "true"]);
      expect(
        screen
          .getByRole("button", { name: "abril de 2026" })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    });
  });

  it("o X limpa as duas pontas", () => {
    const onPeriodoChange = abrir("2026-05-01", "2026-08-01");
    fireEvent.click(
      screen.getByRole("button", { name: "Limpar mês de referência" }),
    );
    expect(onPeriodoChange).toHaveBeenCalledWith("", "");
  });

  it("sem filtro, não há o que limpar", () => {
    abrir();
    expect(
      screen.queryByRole("button", { name: "Limpar mês de referência" }),
    ).toBeNull();
  });
});
