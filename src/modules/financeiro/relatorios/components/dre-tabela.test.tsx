import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { agruparDrePorNatureza } from "@/modules/financeiro/relatorios/calculo";
import { DreTabela } from "@/modules/financeiro/relatorios/components/dre-tabela";

afterEach(cleanup);

describe("DreTabela, blocos de sócio e de mútuo", () => {
  it("mostra o que foi para o sócio E o que o sócio devolveu (a linha não some da tela)", () => {
    const dre = agruparDrePorNatureza([
      { tipo: "a_receber", natureza: "operacional", categoria: "Contrato", categoria_id: "c1", total: "1000.00" },
      { tipo: "a_pagar", natureza: "distribuicao", categoria: "Distribuição a sócio", categoria_id: "d1", total: "500.00" },
      { tipo: "a_receber", natureza: "distribuicao", categoria: "Devolução de sócio", categoria_id: "d2", total: "120.00" },
    ]);
    render(
      <DreTabela dre={dre} periodo={{ mes: "2026-08" }} podeVerLancamentos={false} />,
    );
    expect(screen.getByText("Distribuições a sócios")).toBeTruthy();
    expect(screen.getByText("Devolvido por sócios")).toBeTruthy();
    expect(screen.getByText("Devolução de sócio")).toBeTruthy();
  });
});
