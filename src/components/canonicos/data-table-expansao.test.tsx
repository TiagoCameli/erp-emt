import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";

/**
 * A linha expandida da DataTable (`linhaExpandida`), pedida pela lista de fretes para
 * reproduzir o FreteRowExpanded da origem. É opt-in: sem a prop, nem chevron nem
 * linha extra. O chevron abre e fecha sem disparar o `onRowClick` da linha.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/frete/fretes",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

interface Linha {
  id: string;
  nome: string;
}

const DADOS: Linha[] = [
  { id: "a", nome: "Frete A" },
  { id: "b", nome: "Frete B" },
];

const COLUNAS: ColumnDef<Linha, unknown>[] = [{ accessorKey: "nome", header: "Nome" }];

afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);

function detalhe(linha: Linha) {
  return <div>Detalhe de {linha.nome}</div>;
}

describe("DataTable sem linhaExpandida", () => {
  it("não renderiza chevron nem linha extra: as outras listagens não mudam", () => {
    render(<DataTable columns={COLUNAS} data={DADOS} />);
    expect(screen.queryByRole("button", { name: "Expandir detalhes" })).toBeNull();
    // cabeçalho + 2 linhas
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
});

describe("DataTable com linhaExpandida", () => {
  it("põe o chevron na primeira coluna, fechado", () => {
    render(<DataTable columns={COLUNAS} data={DADOS} linhaExpandida={detalhe} idDaLinha={(l) => l.id} />);
    const botoes = screen.getAllByRole("button", { name: "Expandir detalhes" });
    expect(botoes).toHaveLength(2);
    expect(botoes[0]).toHaveAttribute("aria-expanded", "false");
    const primeiraCelula = screen.getAllByRole("row")[1].querySelector("td");
    expect(primeiraCelula?.getAttribute("data-coluna")).toBe("__expansao__");
    expect(screen.queryByText("Detalhe de Frete A")).toBeNull();
  });

  it("abre a linha embaixo, na largura toda, e fecha no segundo clique", () => {
    render(<DataTable columns={COLUNAS} data={DADOS} linhaExpandida={detalhe} idDaLinha={(l) => l.id} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Expandir detalhes" })[0]);

    const aberto = screen.getByText("Detalhe de Frete A");
    const celula = aberto.closest("td");
    // chevron + Nome
    expect(celula).toHaveAttribute("colspan", "2");
    // A linha aberta vem logo depois da sua linha, antes da linha seguinte.
    const linhas = screen.getAllByRole("row");
    expect(linhas[2]).toContainElement(aberto);
    expect(linhas[3]).toHaveTextContent("Frete B");
    expect(screen.queryByText("Detalhe de Frete B")).toBeNull();

    const recolher = screen.getByRole("button", { name: "Recolher detalhes" });
    expect(recolher).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(recolher);
    expect(screen.queryByText("Detalhe de Frete A")).toBeNull();
  });

  it("o chevron não dispara o clique da linha (que abre o drawer)", () => {
    const aoClicarLinha = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        onRowClick={aoClicarLinha}
        linhaExpandida={detalhe}
        idDaLinha={(l) => l.id}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Expandir detalhes" })[0]);
    expect(aoClicarLinha).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Frete A"));
    expect(aoClicarLinha).toHaveBeenCalledWith(DADOS[0]);
  });

  it("com idDaLinha, a linha aberta segue aberta quando o filtro muda a posição dela", () => {
    const { rerender } = render(
      <DataTable columns={COLUNAS} data={DADOS} linhaExpandida={detalhe} idDaLinha={(l) => l.id} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Expandir detalhes" })[1]);
    expect(screen.getByText("Detalhe de Frete B")).toBeInTheDocument();

    // O filtro da tela tira a primeira linha: B passa a ser o índice 0.
    rerender(<DataTable columns={COLUNAS} data={[DADOS[1]]} linhaExpandida={detalhe} idDaLinha={(l) => l.id} />);
    expect(screen.getByText("Detalhe de Frete B")).toBeInTheDocument();

    // E a que volta não abre por herdar o índice.
    rerender(<DataTable columns={COLUNAS} data={DADOS} linhaExpandida={detalhe} idDaLinha={(l) => l.id} />);
    expect(screen.queryByText("Detalhe de Frete A")).toBeNull();
    expect(screen.getByText("Detalhe de Frete B")).toBeInTheDocument();
  });

  it("personalizável: o chevron fica fora do menu Colunas e na frente das outras", async () => {
    await act(async () => {
      render(
        <DataTable
          idTabela="frete.fretes.teste"
          columns={COLUNAS}
          data={DADOS}
          linhaExpandida={detalhe}
          idDaLinha={(l) => l.id}
        />,
      );
    });
    const cabecalhos = [...document.querySelectorAll("thead th")].map((th) => th.getAttribute("data-coluna"));
    expect(cabecalhos[0]).toBe("__expansao__");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Colunas" }), { button: 0, ctrlKey: false });
    const itens = screen.getAllByRole("menuitemcheckbox").map((item) => item.textContent);
    // Linha de controle: o menu abriu e lista a coluna de dado.
    expect(itens).toContain("Nome");
    expect(itens).toHaveLength(1);
  });
});
