import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import { TabelaItens, type ColunaItem } from "@/components/canonicos";

afterEach(cleanup);

const COLUNAS: ColunaItem[] = [
  { chave: "insumo", rotulo: "Insumo", largura: "1fr" },
  { chave: "qtd", rotulo: "Qtd", largura: "120px", alinhamento: "right" },
];

/** Colunas cobrindo o padrão (sem alinhamento), a exceção e o left explícito. */
const COLUNAS_ALINHAMENTO: ColunaItem[] = [
  { chave: "insumo", rotulo: "Insumo", largura: "1fr" },
  { chave: "qtd", rotulo: "Qtd", largura: "120px", alinhamento: "right" },
  { chave: "obs", rotulo: "Obs", largura: "1fr", alinhamento: "left" },
];

/** Rótulos do cabeçalho na ordem das colunas (o último vão é o da lixeira). */
function cabecalhos(): HTMLElement[] {
  const header = screen.getByTestId("tabela-itens-header");
  return Array.from(header.children).slice(0, -1) as HTMLElement[];
}

/** Células de conteúdo de uma linha, na ordem das colunas. */
function celulas(indiceLinha: number): HTMLElement[] {
  const linha = screen.getAllByTestId("tabela-itens-linha")[indiceLinha];
  return within(linha).getAllByTestId("tabela-itens-celula");
}

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

describe("TabelaItens: alinhamento das colunas", () => {
  function renderizar() {
    render(
      <TabelaItens
        colunas={COLUNAS_ALINHAMENTO}
        linhas={[{ id: "a" }, { id: "b" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave) => <span>{chave}</span>}
        onRemover={() => {}}
      />,
    );
  }

  it("centraliza o rótulo por padrão e só joga à direita a coluna marcada", () => {
    renderizar();
    const [insumo, qtd, obs] = cabecalhos();
    expect(insumo).toHaveClass("text-center");
    expect(qtd).toHaveClass("text-right");
    expect(qtd).not.toHaveClass("text-center");
    expect(obs).toHaveClass("text-left");
  });

  it("centraliza a célula por padrão e só joga à direita a coluna marcada", () => {
    renderizar();
    for (const indiceLinha of [0, 1]) {
      const [insumo, qtd, obs] = celulas(indiceLinha);
      expect(insumo).toHaveClass("sm:items-center");
      expect(qtd).toHaveClass("sm:items-end", "sm:text-right");
      expect(obs).toHaveClass("sm:items-start");
    }
  });

  it("não usa text-align para centralizar a célula", () => {
    // `text-align` é herdado: centralizar a célula centralizaria o texto dentro
    // do Input, e digitar com o cursor no meio do campo é pior para quem digita.
    renderizar();
    const [insumo, , obs] = celulas(0);
    expect(insumo.className).not.toMatch(/text-center/);
    expect(obs.className).not.toMatch(/text-left/);
  });

  it("reserva o trilho da lixeira com a largura do botão, igual no cabeçalho e na linha", () => {
    // Trilho `auto` mediria 0 no cabeçalho (vão vazio) e 32px na linha (botão),
    // e aí rótulo centralizado e célula centralizada não se encontrariam.
    renderizar();
    const trilhos = "1fr 120px 1fr 2rem";
    expect(
      screen
        .getByTestId("tabela-itens-header")
        .style.getPropertyValue("--cols-itens"),
    ).toBe(trilhos);
    for (const linha of screen.getAllByTestId("tabela-itens-linha")) {
      expect(linha.style.getPropertyValue("--cols-itens")).toBe(trilhos);
    }
  });
});
