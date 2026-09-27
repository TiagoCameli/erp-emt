import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  CelulaArvore,
  DataTable,
  limparEstadosTabelaParaTeste,
} from "@/components/canonicos/data-table";

/**
 * Modo árvore da DataTable (`subLinhas`), pedido pela Fase 3 de Medição de
 * Contratos para o Boletim mostrar a planilha do contrato (item, subitem,
 * sub-subitem) sem um componente de tabela paralelo (regra 9 do repo).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/boletim",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

interface LinhaArvore {
  id: string;
  codigo: string;
  filhos?: LinhaArvore[];
}

/** 60 folhas sob "02", só para provar que a árvore inteira renderiza (64 linhas). */
const FILHOS_02: LinhaArvore[] = Array.from({ length: 60 }, (_, indice) => ({
  id: `2.${indice + 1}`,
  codigo: `02.${String(indice + 1).padStart(2, "0")}`,
}));

const DADOS: LinhaArvore[] = [
  {
    id: "1",
    codigo: "01",
    filhos: [
      {
        id: "1.1",
        codigo: "01.01",
        filhos: [{ id: "1.1.1", codigo: "01.01.01" }],
      },
    ],
  },
  { id: "2", codigo: "02", filhos: FILHOS_02 },
];

const COLUNAS: ColumnDef<LinhaArvore, unknown>[] = [
  {
    accessorKey: "codigo",
    header: "Código",
    cell: ({ row }) => (
      <CelulaArvore linha={row}>{row.original.codigo}</CelulaArvore>
    ),
  },
];

function subLinhas(registro: LinhaArvore) {
  return registro.filhos;
}

afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);

describe("DataTable com subLinhas", () => {
  it("renderiza a árvore inteira, sem paginação", () => {
    render(<DataTable columns={COLUNAS} data={DADOS} subLinhas={subLinhas} />);
    // cabeçalho + 64 linhas (01, 01.01, 01.01.01, 02 e as 60 folhas de 02)
    expect(screen.getAllByRole("row")).toHaveLength(65);
    expect(
      screen.queryByRole("button", { name: "Próxima página" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Página anterior" }),
    ).toBeNull();
  });

  it("recolhe um galho pelo chevron e reabre no segundo clique", () => {
    render(<DataTable columns={COLUNAS} data={DADOS} subLinhas={subLinhas} />);

    // "01" é o primeiro chevron que pode recolher (01.01 e 02 também podem,
    // mas vêm depois na árvore aberta).
    const chevronDoUm = screen.getAllByRole("button", { name: "Recolher" })[0];
    fireEvent.click(chevronDoUm);

    expect(screen.queryByText("01.01")).toBeNull();
    expect(screen.queryByText("01.01.01")).toBeNull();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();

    // Só "01" ficou fechado: é o único chevron com "Expandir" agora.
    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));
    expect(screen.getByText("01.01")).toBeInTheDocument();
    expect(screen.getByText("01.01.01")).toBeInTheDocument();
  });

  it("'Recolher tudo' deixa só as raízes; 'Expandir tudo' devolve a árvore", () => {
    render(<DataTable columns={COLUNAS} data={DADOS} subLinhas={subLinhas} />);

    fireEvent.click(screen.getByRole("button", { name: "Recolher tudo" }));
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.queryByText("01.01")).toBeNull();
    expect(screen.queryByText("02.01")).toBeNull();
    // cabeçalho + 01 + 02
    expect(screen.getAllByRole("row")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Expandir tudo" }));
    expect(screen.getAllByRole("row")).toHaveLength(65);
  });

  it("a busca mostra o achado com os ancestrais e força tudo aberto, escondendo quem não casa", () => {
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        subLinhas={subLinhas}
        searchKey="codigo"
      />,
    );

    // Fecha tudo primeiro: se a busca não forçasse reabrir, 01.01 e 01.01.01
    // continuariam escondidos mesmo achando o texto.
    fireEvent.click(screen.getByRole("button", { name: "Recolher tudo" }));
    expect(screen.queryByText("01.01.01")).toBeNull();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "01.01.01" },
    });

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("01.01")).toBeInTheDocument();
    expect(screen.getByText("01.01.01")).toBeInTheDocument();
    expect(screen.queryByText("02")).toBeNull();
  });

  it("o cabeçalho não ordena ao clicar", () => {
    render(<DataTable columns={COLUNAS} data={DADOS} subLinhas={subLinhas} />);
    const cabecalho = screen.getByRole("columnheader");
    // Sem ordenação a coluna não vira botão: é só o rótulo, sem handler de clique.
    expect(within(cabecalho).queryByRole("button")).toBeNull();
    fireEvent.click(cabecalho);
    expect(screen.getAllByRole("row")).toHaveLength(65);
  });

  it("recua a linha pela profundidade: o neto (profundidade 2) fica a 2rem", () => {
    render(<DataTable columns={COLUNAS} data={DADOS} subLinhas={subLinhas} />);
    const texto = screen.getByText("01.01.01");
    expect(texto.parentElement).toHaveStyle({ paddingLeft: "2rem" });
  });

  it("subLinhas junto com linhaExpandida lança erro", () => {
    const erroOriginal = console.error;
    console.error = vi.fn();
    try {
      expect(() =>
        render(
          <DataTable
            columns={COLUNAS}
            data={DADOS}
            subLinhas={subLinhas}
            linhaExpandida={() => <div>Detalhe</div>}
          />,
        ),
      ).toThrow(
        "DataTable: subLinhas não combina com linhaExpandida nem selecao",
      );
    } finally {
      console.error = erroOriginal;
    }
  });
});
