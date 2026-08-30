import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ReguaTempo } from "@/components/canonicos/regua-tempo";

/**
 * A régua de tempo em uso: clicar, arrastar e trocar de tamanho de bloco.
 *
 * A aritmética das datas tem teste próprio em `regua-tempo-calculo.test.ts`.
 * Aqui o que se prova é o que só existe na interação: um clique escolhe o bloco
 * inteiro, um arraste escolhe o intervalo, e trocar de granularidade não perde
 * de vista o período que já estava escolhido.
 */

vi.mock("@/lib/formatadores", async (original) => ({
  ...(await original<typeof import("@/lib/formatadores")>()),
  // Hoje fixo: sem isto, "Este mês" mudaria de resposta a cada mês que passa e
  // o teste começaria a falhar sozinho em setembro.
  dataHojeISO: () => "2026-08-29",
}));

function abrir(de = "", ate = "") {
  const onPeriodoChange = vi.fn();
  render(
    <ReguaTempo
      de={de}
      ate={ate}
      onPeriodoChange={onPeriodoChange}
      rotulo="Vencimento"
    />,
  );
  return onPeriodoChange;
}

/** O bloco da régua com aquela descrição ("janeiro de 2026"). */
function bloco(descricao: string) {
  return screen.getByRole("button", { name: descricao });
}

describe("ReguaTempo", () => {
  afterEach(cleanup);

  it("abre em meses do ano de hoje quando não há período", () => {
    abrir();
    expect(screen.getByText("2026")).toBeTruthy();
    expect(bloco("janeiro de 2026")).toBeTruthy();
    expect(bloco("dezembro de 2026")).toBeTruthy();
  });

  it("um clique escolhe o MÊS INTEIRO, não o dia", () => {
    // Clicar em AGO tem que dar 01/08 a 31/08. Devolver só o primeiro dia faria
    // a lista mostrar um dia quando a pessoa pediu um mês.
    const onPeriodoChange = abrir();

    fireEvent.pointerDown(bloco("agosto de 2026"), { button: 0 });
    fireEvent.pointerUp(bloco("agosto de 2026"));

    expect(onPeriodoChange).toHaveBeenLastCalledWith(
      "2026-08-01",
      "2026-08-31",
    );
  });

  describe("arraste", () => {
    it("da esquerda para a direita pega o intervalo", () => {
      const onPeriodoChange = abrir();

      fireEvent.pointerDown(bloco("janeiro de 2026"), { button: 0 });
      fireEvent.pointerEnter(bloco("agosto de 2026"));
      fireEvent.pointerUp(bloco("agosto de 2026"));

      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-01-01",
        "2026-08-31",
      );
    });

    it("da direita para a esquerda dá o MESMO intervalo", () => {
      // Arrastar de trás para frente é tão natural quanto o contrário. Sem a
      // normalização, o período sairia invertido e a lista voltaria vazia.
      const onPeriodoChange = abrir();

      fireEvent.pointerDown(bloco("agosto de 2026"), { button: 0 });
      fireEvent.pointerEnter(bloco("janeiro de 2026"));
      fireEvent.pointerUp(bloco("janeiro de 2026"));

      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-01-01",
        "2026-08-31",
      );
    });

    it("CONTROLE: passar o mouse SEM ter apertado não muda nada", () => {
      // Se o hover sozinho filtrasse, atravessar a régua com o mouse trocaria o
      // filtro doze vezes no caminho até o botão de fechar.
      const onPeriodoChange = abrir();

      fireEvent.pointerEnter(bloco("agosto de 2026"));
      fireEvent.pointerEnter(bloco("dezembro de 2026"));

      expect(onPeriodoChange).not.toHaveBeenCalled();
    });

    it("o botão direito não começa arraste", () => {
      const onPeriodoChange = abrir();

      fireEvent.pointerDown(bloco("agosto de 2026"), { button: 2 });
      fireEvent.pointerEnter(bloco("dezembro de 2026"));

      expect(onPeriodoChange).not.toHaveBeenCalled();
    });
  });

  describe("os cinco tamanhos de bloco", () => {
    it("estão todos à vista, sem menu escondido", () => {
      abrir();
      for (const nome of ["Anos", "Trimestres", "Meses", "Semanas", "Dias"]) {
        expect(screen.getByRole("button", { name: nome })).toBeTruthy();
      }
    });

    it("trocar para Dias mostra os dias do mês em foco", () => {
      abrir("2026-03-10", "2026-03-12");

      fireEvent.click(screen.getByRole("button", { name: "Dias" }));

      // O mês em foco é o do PERÍODO (março), não o de hoje (agosto): quem
      // filtrou março precisa ver março ao trocar de tamanho.
      expect(screen.getByText("março de 2026")).toBeTruthy();
      expect(bloco("31 de março de 2026")).toBeTruthy();
    });

    it("em Dias, um clique escolhe UM dia", () => {
      const onPeriodoChange = abrir("2026-08-01", "2026-08-31");

      fireEvent.click(screen.getByRole("button", { name: "Dias" }));
      fireEvent.pointerDown(bloco("17 de agosto de 2026"), { button: 0 });
      fireEvent.pointerUp(bloco("17 de agosto de 2026"));

      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-08-17",
        "2026-08-17",
      );
    });

    it("em Anos, um clique escolhe o ano inteiro", () => {
      const onPeriodoChange = abrir();

      fireEvent.click(screen.getByRole("button", { name: "Anos" }));
      fireEvent.pointerDown(bloco("ano de 2026"), { button: 0 });
      fireEvent.pointerUp(bloco("ano de 2026"));

      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-01-01",
        "2026-12-31",
      );
    });

    it("em Trimestres, um clique escolhe os três meses", () => {
      const onPeriodoChange = abrir();

      fireEvent.click(screen.getByRole("button", { name: "Trimestres" }));
      fireEvent.pointerDown(bloco("3º trimestre de 2026"), { button: 0 });
      fireEvent.pointerUp(bloco("3º trimestre de 2026"));

      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-07-01",
        "2026-09-30",
      );
    });
  });

  describe("navegação da janela", () => {
    it("volta e avança um ano em Meses", () => {
      abrir();
      expect(screen.getByText("2026")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Período anterior" }));
      expect(screen.getByText("2025")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Próximo período" }));
      expect(screen.getByText("2026")).toBeTruthy();
    });

    it("navegar NÃO muda o filtro: só muda o que a régua mostra", () => {
      // Olhar o ano passado para conferir não pode alterar o que está filtrado.
      const onPeriodoChange = abrir("2026-08-01", "2026-08-31");

      fireEvent.click(screen.getByRole("button", { name: "Período anterior" }));

      expect(onPeriodoChange).not.toHaveBeenCalled();
    });
  });

  it("a régua abre no período filtrado, não no ano de hoje", () => {
    // Um mês inteiro reabre em MESES (a borda manda), e no ANO do período.
    abrir("2024-05-01", "2024-05-31");
    expect(screen.getByText("2024")).toBeTruthy();
    expect(bloco("maio de 2024")).toBeTruthy();
  });

  it("um período de poucos dias reabre a régua em dias", () => {
    abrir("2026-03-10", "2026-03-12");
    expect(screen.getByText("março de 2026")).toBeTruthy();
    expect(bloco("10 de março de 2026")).toBeTruthy();
  });

  it("os campos de data exata continuam existindo, para o corte que não é redondo", () => {
    const onPeriodoChange = abrir("2026-08-01", "2026-08-31");

    const inicial = screen.getByLabelText("Vencimento: data inicial");
    fireEvent.change(inicial, { target: { value: "2026-08-17" } });

    expect(onPeriodoChange).toHaveBeenLastCalledWith(
      "2026-08-17",
      "2026-08-31",
    );
  });

  describe("atalhos", () => {
    it("Este mês pega o mês de hoje inteiro", () => {
      const onPeriodoChange = abrir();
      fireEvent.click(screen.getByRole("button", { name: "Este mês" }));
      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-08-01",
        "2026-08-31",
      );
    });

    it("Mês passado vira o mês, e acerta o último dia dele", () => {
      const onPeriodoChange = abrir();
      fireEvent.click(screen.getByRole("button", { name: "Mês passado" }));
      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-07-01",
        "2026-07-31",
      );
    });

    it("Este ano pega janeiro a dezembro", () => {
      const onPeriodoChange = abrir();
      fireEvent.click(screen.getByRole("button", { name: "Este ano" }));
      expect(onPeriodoChange).toHaveBeenLastCalledWith(
        "2026-01-01",
        "2026-12-31",
      );
    });

    it("Limpar só aparece quando há o que limpar", () => {
      abrir();
      expect(screen.queryByRole("button", { name: "Limpar" })).toBeNull();
      cleanup();

      const onPeriodoChange = abrir("2026-08-01", "2026-08-31");
      fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
      expect(onPeriodoChange).toHaveBeenLastCalledWith("", "");
    });
  });
});
