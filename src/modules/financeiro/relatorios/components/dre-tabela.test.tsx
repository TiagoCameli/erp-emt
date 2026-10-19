import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A tabela é o DataTable com `idTabela`, que busca a preferência salva do
// usuário por Server Action: fora de uma requisição isso estoura em `cookies()`.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { agruparDrePorNatureza } from "@/modules/financeiro/relatorios/calculo";
import { DreTabela, NOTA_CRONOGRAMA } from "@/modules/financeiro/relatorios/components/dre-tabela";

afterEach(cleanup);

describe("DreTabela, sem sócio", () => {
  it("a distribuição a sócio não aparece: nem bloco, nem categoria, nem devolução", () => {
    const dre = agruparDrePorNatureza([
      { tipo: "a_receber", natureza: "operacional", categoria: "Contrato", categoria_id: "c1", total: "1000.00" },
      { tipo: "a_pagar", natureza: "distribuicao", categoria: "Distribuição a sócio", categoria_id: "d1", total: "500.00" },
      { tipo: "a_receber", natureza: "distribuicao", categoria: "Devolução de sócio", categoria_id: "d2", total: "120.00" },
      { tipo: "a_pagar", natureza: "mutuo", categoria: "Mútuo concedido", categoria_id: "m1", total: "300.00" },
    ]);
    render(
      <DreTabela dre={dre} periodo={{ mes: "2026-08" }} podeVerLancamentos={false} />,
    );
    expect(document.body.textContent).not.toMatch(/sócio|James|distribui/i);
    expect(screen.getAllByText("Mútuo concedido").length).toBeGreaterThan(0);
  });
});

describe("DreTabela, categorias que vêm do cronograma", () => {
  it("Juros de empréstimos avisa que parte vem do cronograma; outra categoria não", () => {
    const dre = agruparDrePorNatureza([
      { tipo: "a_pagar", natureza: "financeiro", categoria: "Juros de empréstimos", categoria_id: "j1", total: "850.00" },
      { tipo: "a_pagar", natureza: "operacional", categoria: "Combustível", categoria_id: "c1", total: "300.00" },
    ]);
    render(<DreTabela dre={dre} periodo={{ mes: "2026-08" }} podeVerLancamentos />);
    expect(screen.getAllByText(NOTA_CRONOGRAMA)).toHaveLength(1);
    expect(screen.getByText("Juros de empréstimos").closest("td")!.textContent).toContain(NOTA_CRONOGRAMA);
  });
});
