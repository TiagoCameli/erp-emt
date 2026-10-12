import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  DataTable,
  limparEstadosTabelaParaTeste,
} from "@/components/canonicos/data-table";

/**
 * Modo relatório da DataTable (`semPaginacao`, `classeDaLinha`,
 * `linhaInteira`), pedido em 12/10/2026 para os relatórios do Financeiro e da
 * Gestão saírem das tabelas montadas à mão e ficarem ajustáveis como as
 * listagens (regra 9 do repo).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/financeiro/relatorios",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

interface Linha {
  id: string;
  nome: string;
  valor: number;
  tipo: "secao" | "item" | "total";
}

const COLUNAS: ColumnDef<Linha, unknown>[] = [
  { accessorKey: "nome", header: "Nome" },
  { accessorKey: "valor", header: "Valor", meta: { alinharDireita: true } },
];

const MUITAS: Linha[] = Array.from({ length: 40 }, (_, i) => ({
  id: String(i),
  nome: `Linha ${i + 1}`,
  valor: i,
  tipo: "item",
}));

describe("DataTable em modo relatório", () => {
  it("semPaginacao mostra todas as linhas e esconde a barra de páginas", () => {
    render(
      <DataTable
        idTabela="teste.relatorio"
        columns={COLUNAS}
        data={MUITAS}
        idDaLinha={(l) => l.id}
        semPaginacao
      />,
    );
    expect(screen.getAllByText(/^Linha \d+$/).length).toBeGreaterThanOrEqual(40);
    expect(screen.queryByText(/1 a 25 de 40/)).toBeNull();
  });

  it("sem a opção, continua paginando em 25", () => {
    render(<DataTable columns={COLUNAS} data={MUITAS} idDaLinha={(l) => l.id} />);
    expect(screen.getAllByText(/1 a 25 de 40/).length).toBeGreaterThan(0);
  });

  it("linhaInteira ocupa todas as colunas e classeDaLinha pinta a linha", () => {
    const dados: Linha[] = [
      { id: "s", nome: "RECEITAS", valor: 0, tipo: "secao" },
      { id: "a", nome: "Medição", valor: 10, tipo: "item" },
      { id: "t", nome: "Total", valor: 10, tipo: "total" },
    ];
    render(
      <DataTable
        idTabela="teste.relatorio"
        columns={COLUNAS}
        data={dados}
        idDaLinha={(l) => l.id}
        semPaginacao
        linhaInteira={(l) => (l.tipo === "secao" ? l.nome : null)}
        classeDaLinha={(l) => (l.tipo === "total" ? "linha-total" : undefined)}
      />,
    );
    const celulaSecao = screen
      .getAllByText("RECEITAS")
      .map((el) => el.closest("td"))
      .find((td) => td !== null);
    expect(celulaSecao?.getAttribute("colspan")).toBe("2");
    const linhaTotal = screen
      .getAllByText("Total")
      .map((el) => el.closest("tr"))
      .find((tr) => tr !== null);
    expect(linhaTotal?.className).toContain("linha-total");
  });

  it("semPaginacao com paginação no servidor é erro de uso", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      render(
        <DataTable
          columns={COLUNAS}
          data={MUITAS}
          total={40}
          onPaginationChange={() => undefined}
          semPaginacao
        />,
      ),
    ).toThrow(/semPaginacao/);
  });
});
