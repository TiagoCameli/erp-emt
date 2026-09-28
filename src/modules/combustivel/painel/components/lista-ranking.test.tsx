import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListaRanking, type ItemRanking } from "./lista-ranking";

afterEach(cleanup);

const NOME_LONGO = "009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10";

const item = (over: Partial<ItemRanking> & { id: string }): ItemRanking => ({
  nome: over.id,
  valor: "R$ 1,00",
  fracao: 0.5,
  cor: "green",
  ...over,
});

function larguras(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>("[data-slot=barra-ranking]")].map((b) => b.style.width);
}

describe("ListaRanking (Top equipamentos e Custo por obra)", () => {
  it("nome longo numa linha só, cortado no fim, com o nome inteiro no title", () => {
    render(<ListaRanking itens={[item({ id: "a", nome: NOME_LONGO })]} onClicar={() => {}} />);
    const nome = screen.getByText(NOME_LONGO);
    expect(nome.className).toContain("truncate");
    expect(screen.getByRole("button").getAttribute("title")).toBe(NOME_LONGO);
  });

  it("clique devolve o id; item inerte (Sem obra, sentinela sem ação) não dispara", () => {
    const onClicar = vi.fn();
    render(
      <ListaRanking
        itens={[item({ id: "obra-1", nome: "Obra 1" }), item({ id: "_sem", nome: "Sem obra", inerte: true })]}
        onClicar={onClicar}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Obra 1/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sem obra/ }));
    expect(onClicar).toHaveBeenCalledTimes(1);
    expect(onClicar).toHaveBeenCalledWith("obra-1");
  });

  it("barra proporcional, com fio mínimo para o menor e teto de 100%", () => {
    const { container } = render(
      <ListaRanking
        itens={[item({ id: "a", fracao: 0.834 }), item({ id: "b", fracao: 0.001 }), item({ id: "c", fracao: 1.2 })]}
        onClicar={() => {}}
      />,
    );
    expect(larguras(container)).toEqual(["83.4%", "1.5%", "100%"]);
  });

  it("numera pela posição e marca o item filtrado", () => {
    render(
      <ListaRanking itens={[item({ id: "a" }), item({ id: "b", marcado: true })]} onClicar={() => {}} />,
    );
    const [a, b] = screen.getAllByRole("button");
    expect(a!.textContent).toMatch(/^1/);
    expect(b!.textContent).toMatch(/^2/);
    expect(a!.getAttribute("aria-pressed")).toBe("false");
    expect(b!.getAttribute("aria-pressed")).toBe("true");
  });
});
