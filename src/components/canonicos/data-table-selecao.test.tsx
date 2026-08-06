import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { DataTable } from "@/components/canonicos/data-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/financeiro/lancamentos",
  useSearchParams: () => new URLSearchParams(),
}));

// O DataTable busca e grava preferência por Server Action, e Server Action usa
// cookies(), que não existe fora de uma requisição.
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
  { id: "a", nome: "LAN-1" },
  { id: "b", nome: "LAN-2" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COLUNAS: any = [{ accessorKey: "nome", header: "Nome" }];

afterEach(cleanup);

describe("DataTable sem a prop selecao", () => {
  it("não renderiza checkbox nenhum: as outras 48 abas não mudam", () => {
    // Este teste é a garantia de que a seleção é opt-in. Componente canônico é
    // onde se estraga 49 telas de uma vez.
    render(<DataTable columns={COLUNAS} data={DADOS} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("DataTable com selecao", () => {
  it("marca uma linha e avisa quem manda", () => {
    const aoMudar = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          selecionados: [],
          onSelecionadosChange: aoMudar,
        }}
      />,
    );
    const caixas = screen.getAllByRole("checkbox");
    // 1 no cabeçalho + 1 por linha
    expect(caixas).toHaveLength(3);
    caixas[1].click();
    expect(aoMudar).toHaveBeenCalledWith(["a"]);
  });

  it("desmarca linha já selecionada", () => {
    const aoMudar = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          selecionados: ["a", "b"],
          onSelecionadosChange: aoMudar,
        }}
      />,
    );
    screen.getAllByRole("checkbox")[1].click();
    expect(aoMudar).toHaveBeenCalledWith(["b"]);
  });

  it("o checkbox do cabeçalho marca a página inteira", () => {
    const aoMudar = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          selecionados: [],
          onSelecionadosChange: aoMudar,
        }}
      />,
    );
    screen.getAllByRole("checkbox")[0].click();
    expect(aoMudar).toHaveBeenCalledWith(["a", "b"]);
  });

  it("o do cabeçalho desmarca a página sem apagar seleção de outra página", () => {
    const aoMudar = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          // "z" veio de outra página e não pode ser perdido.
          selecionados: ["a", "b", "z"],
          onSelecionadosChange: aoMudar,
        }}
      />,
    );
    screen.getAllByRole("checkbox")[0].click();
    expect(aoMudar).toHaveBeenCalledWith(["z"]);
  });

  it("habilitada=false não renderiza checkbox naquela linha", () => {
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          selecionados: [],
          onSelecionadosChange: vi.fn(),
          habilitada: (l: Linha) => l.id !== "b",
        }}
      />,
    );
    // cabeçalho + só a linha "a"
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("o checkbox é a PRIMEIRA coluna, mesmo com a tabela personalizável", () => {
    // Com idTabela a tabela liga o columnOrder da preferência do usuário, e
    // coluna fora dessa lista o TanStack joga no FIM. Sem prepender o id da
    // seleção nessa ordem, o checkbox apareceria na ponta direita.
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        idTabela="financeiro.lancamentos"
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          selecionados: [],
          onSelecionadosChange: vi.fn(),
        }}
      />,
    );
    const primeiraCelula = screen
      .getAllByRole("row")[1]
      ?.querySelector("td");
    expect(primeiraCelula?.querySelector('[role="checkbox"]')).not.toBeNull();
  });
});
