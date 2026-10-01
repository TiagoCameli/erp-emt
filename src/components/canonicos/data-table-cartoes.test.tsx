import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DataTable,
  type FiltroConfiguravel,
} from "@/components/canonicos/data-table";
import { FiltroSelect } from "@/components/canonicos/filter-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

/** O `useTelaCelular` lê `matchMedia`, que o jsdom não tem. */
function comoCelular() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string) => ({
      matches: true,
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

interface Ordem {
  id: string;
  numero: string;
  fornecedor: string;
  obra: string;
  status: string;
  comprador: string;
  prazo: string;
  frete: string;
  valor: number;
}

const ORDENS: Ordem[] = [
  {
    id: "1",
    numero: "OC-2026-0041",
    fornecedor: "A CRUZEIRENSE",
    obra: "BR-364 Lote 09",
    status: "Aprovada",
    comprador: "Maria",
    prazo: "10/10/2026",
    frete: "CIF",
    valor: 1234.5,
  },
];

const COLUNAS: ColumnDef<Ordem, unknown>[] = [
  { accessorKey: "numero", header: "Número" },
  { accessorKey: "fornecedor", header: "Fornecedor" },
  { accessorKey: "obra", header: "Obra" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "comprador", header: "Comprador" },
  { accessorKey: "prazo", header: "Prazo" },
  { accessorKey: "frete", header: "Frete" },
  {
    accessorKey: "valor",
    header: "Valor",
    meta: { alinharDireita: true },
    cell: ({ row }) => `R$ ${row.original.valor}`,
  },
];

describe("DataTable no celular", () => {
  it("troca a tabela por um card com título, valor e campos rotulados", () => {
    comoCelular();
    render(<DataTable columns={COLUNAS} data={ORDENS} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const card = within(
      screen.getByRole("list", { name: "Registros" }),
    ).getByRole("listitem");
    expect(within(card).getByText("OC-2026-0041")).toBeInTheDocument();
    expect(within(card).getByText("R$ 1234.5")).toBeInTheDocument();
    // Fornecedor é o subtítulo: sem rótulo; Obra já entra com rótulo.
    expect(within(card).getByText("A CRUZEIRENSE")).toBeInTheDocument();
    expect(within(card).getByText("Obra")).toBeInTheDocument();
  });

  it("mostra quatro campos e guarda o resto atrás de um toque", () => {
    comoCelular();
    render(<DataTable columns={COLUNAS} data={ORDENS} />);

    // Número é o título e Valor o valor: sobram seis campos, cinco à vista
    // (fornecedor como subtítulo e quatro na grade).
    expect(screen.queryByText("Frete")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mais 1 campo" }));
    expect(screen.getByText("Frete")).toBeInTheDocument();
    expect(screen.getByText("CIF")).toBeInTheDocument();
  });

  it("meta.celular escolhe o título, sobe um destaque e tira uma coluna do card", () => {
    comoCelular();
    const colunas: ColumnDef<Ordem, unknown>[] = COLUNAS.map((coluna) => {
      const chave = "accessorKey" in coluna ? coluna.accessorKey : "";
      if (chave === "fornecedor")
        return { ...coluna, meta: { celular: "titulo" } };
      if (chave === "prazo")
        return { ...coluna, meta: { celular: "destaque" } };
      if (chave === "obra") return { ...coluna, meta: { celular: "oculta" } };
      return coluna;
    });
    render(<DataTable columns={colunas} data={ORDENS} />);

    const card = screen.getByRole("listitem");
    expect(card.querySelector(".font-semibold")?.textContent).toBe(
      "A CRUZEIRENSE",
    );
    // Destaque entra nos quatro primeiros sem precisar de "Mais campos".
    expect(within(card).getByText("Prazo")).toBeInTheDocument();
    expect(within(card).queryByText("BR-364 Lote 09")).not.toBeInTheDocument();
  });

  it("tocar no card é o mesmo clique da linha", () => {
    comoCelular();
    const abrir = vi.fn();
    render(<DataTable columns={COLUNAS} data={ORDENS} onRowClick={abrir} />);
    fireEvent.click(screen.getByText("A CRUZEIRENSE"));
    expect(abrir).toHaveBeenCalledWith(ORDENS[0]);
  });

  it("o menu de ações continua no card e não abre o registro junto", () => {
    comoCelular();
    const abrir = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={ORDENS}
        onRowClick={abrir}
        acoesLinha={() => <DropdownMenuItem>Cancelar ordem</DropdownMenuItem>}
      />,
    );
    const card = screen.getByRole("listitem");
    const botoes = within(card).getAllByRole("button");
    fireEvent.pointerDown(botoes[botoes.length - 1]);
    expect(abrir).not.toHaveBeenCalled();
  });

  it("os filtros vão para uma gaveta com o selo de quantos estão ativos", () => {
    comoCelular();
    const filtros: FiltroConfiguravel[] = [
      {
        id: "status",
        rotulo: "Status",
        temValor: true,
        elemento: (
          <FiltroSelect
            valor="Aprovada"
            onValorChange={() => {}}
            opcoes={[{ valor: "Aprovada", rotulo: "Aprovada" }]}
            todosRotulo="Todos os status"
          />
        ),
      },
    ];
    render(
      <DataTable
        columns={COLUNAS}
        data={ORDENS}
        filtros={filtros}
        idTabela="t.cartoes"
      />,
    );

    // Na barra fica só o botão: o filtro mora na gaveta.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Colunas/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Filtros\s*1/ }));
    expect(screen.getByRole("dialog", { name: "Filtros" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ver 1 resultado" }),
    ).toBeInTheDocument();
  });

  it("lista vazia mostra o estado vazio da tela", () => {
    comoCelular();
    render(
      <DataTable
        columns={COLUNAS}
        data={[]}
        emptyState="Nenhuma ordem por aqui"
      />,
    );
    expect(screen.getByText("Nenhuma ordem por aqui")).toBeInTheDocument();
  });

  it("coluna de ações feita à mão vai para o canto do card, não para o valor", () => {
    comoCelular();
    const abrir = vi.fn();
    const colunas: ColumnDef<Ordem, unknown>[] = [
      { accessorKey: "numero", header: "Número" },
      { accessorKey: "fornecedor", header: "Fornecedor" },
      {
        id: "acoes",
        header: "",
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: () => <button type="button">Editar ordem</button>,
      },
    ];
    render(<DataTable columns={colunas} data={ORDENS} onRowClick={abrir} />);

    const card = screen.getByRole("listitem");
    // Sem rótulo "Ações" na grade e fora do clique do card.
    expect(within(card).queryByText("Ações")).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Editar ordem" }));
    expect(abrir).not.toHaveBeenCalled();
  });

  it("checkbox feito à mão não vira o título do card", () => {
    comoCelular();
    const colunas: ColumnDef<Ordem, unknown>[] = [
      {
        id: "selecao",
        meta: { fixa: true, rotulo: "Seleção" },
        cell: () => <input type="checkbox" aria-label="Marcar" />,
      },
      ...COLUNAS,
    ];
    render(<DataTable columns={colunas} data={ORDENS} />);
    const card = screen.getByRole("listitem");
    expect(card.querySelector(".font-semibold")?.textContent).toBe(
      "OC-2026-0041",
    );
    expect(
      within(card).getByRole("checkbox", { name: "Marcar" }),
    ).toBeInTheDocument();
  });

  it("rodapé com rótulo na coluna do título vira o cabeçalho dos totais", () => {
    comoCelular();
    render(
      <DataTable
        columns={COLUNAS}
        data={ORDENS}
        rodape={{ numero: "Total do contrato", valor: "R$ 9.999,00" }}
      />,
    );
    expect(screen.getByText("Total do contrato")).toBeInTheDocument();
    expect(screen.queryByText("Número")).not.toBeInTheDocument();
    expect(screen.getByText("R$ 9.999,00")).toBeInTheDocument();
  });

  it("filtro fixo (a busca do servidor) fica na barra, fora da gaveta", () => {
    comoCelular();
    render(
      <DataTable
        columns={COLUNAS}
        data={ORDENS}
        idTabela="t.fixo"
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: true,
            elemento: <input aria-label="Buscar ordens" />,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "Buscar ordens" }),
    ).toBeInTheDocument();
    // Só havia a busca: não sobra nada para a gaveta, então não há botão.
    expect(
      screen.queryByRole("button", { name: /^Filtros/ }),
    ).not.toBeInTheDocument();
  });

  it("no computador continua a tabela", () => {
    render(<DataTable columns={COLUNAS} data={ORDENS} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Registros" }),
    ).not.toBeInTheDocument();
  });
});
