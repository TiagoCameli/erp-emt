import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TabelaItens, type ColunaItem } from "@/components/canonicos";

afterEach(cleanup);

const COLUNAS: ColunaItem[] = [
  { chave: "insumo", rotulo: "Insumo", largura: "1fr" },
  { chave: "qtd", rotulo: "Qtd", largura: "120px", alinhamento: "right" },
];

describe("TabelaItens", () => {
  it("mostra o cabeçalho de coluna uma vez só", () => {
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }, { id: "b" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave, i) => <span>{`${chave}-${i}`}</span>}
        onRemover={() => {}}
      />,
    );
    // "Insumo" aparece 1x no header desktop + 1x por linha no rótulo mobile.
    // O header desktop é o primeiro; conferimos que existe exatamente 1 header.
    expect(screen.getAllByTestId("tabela-itens-header")).toHaveLength(1);
  });

  it("renderiza uma linha por item", () => {
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }, { id: "b" }, { id: "c" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave) => <span>{chave}</span>}
        onRemover={() => {}}
      />,
    );
    expect(screen.getAllByTestId("tabela-itens-linha")).toHaveLength(3);
  });

  it("chama onRemover com o índice da linha", () => {
    const onRemover = vi.fn();
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }, { id: "b" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave) => <span>{chave}</span>}
        onRemover={onRemover}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[1]);
    expect(onRemover).toHaveBeenCalledWith(1);
  });

  it("mostra erro por célula", () => {
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave) => <span>{chave}</span>}
        erroCelula={(chave) => (chave === "qtd" ? "obrigatório" : undefined)}
        onRemover={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("obrigatório");
  });

  it("desabilita remover quando podeRemover é falso", () => {
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave) => <span>{chave}</span>}
        podeRemover={() => false}
        onRemover={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Remover" })).toBeDisabled();
  });
});
