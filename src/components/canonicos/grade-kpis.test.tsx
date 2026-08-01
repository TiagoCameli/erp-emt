import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { GradeKpis, KPICard } from "@/components/canonicos";

afterEach(cleanup);

describe("GradeKpis", () => {
  it("com 1 cartão deixa ele crescer e ocupar a linha", () => {
    const { container } = render(
      <GradeKpis className="mb-4">
        <KPICard titulo="Total a pagar aprovado" valor="R$ 0,00" />
      </GradeKpis>,
    );
    const grade = container.firstElementChild;
    // O crescimento vem do container, não do chamador: é isso que impede o
    // cartão solitário de ficar com dois terços da linha vazios.
    expect(grade?.className).toContain("flex-wrap");
    expect(grade?.className).toContain("[&>*]:flex-1");
    expect(grade?.className).toContain("mb-4");
    expect(grade?.children).toHaveLength(1);
    expect(screen.getByText("Total a pagar aprovado")).toBeInTheDocument();
  });

  it("com 3 cartões põe os três como filhos diretos da grade", () => {
    const { container } = render(
      <GradeKpis>
        <KPICard titulo="OCs a aprovar" valor={2} />
        <KPICard titulo="OCs abertas" valor={5} />
        <KPICard titulo="Cotações em aberto" valor={1} />
      </GradeKpis>,
    );
    expect(container.firstElementChild?.children).toHaveLength(3);
    expect(screen.getByText("OCs a aprovar")).toBeInTheDocument();
    expect(screen.getByText("Cotações em aberto")).toBeInTheDocument();
  });

  it("fragmento e lista continuam sendo filhos diretos no DOM", () => {
    const grupos = ["Material", "Mão de obra", "Equipamento"];
    const { container } = render(
      <GradeKpis>
        <>
          {grupos.map((grupo) => (
            <KPICard key={grupo} titulo={grupo} valor="R$ 1,00" />
          ))}
        </>
      </GradeKpis>,
    );
    // Fragmento não gera nó no DOM, então o seletor de filho direto do CSS
    // continua acertando os cartões (o que Children.count não garantiria).
    expect(container.firstElementChild?.children).toHaveLength(3);
    for (const grupo of grupos) {
      expect(screen.getByText(grupo)).toBeInTheDocument();
    }
  });
});
