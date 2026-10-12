import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { Investimentos } from "@/modules/financeiro/relatorios/investimentos";
import {
  AplicacoesTabela,
  InvestimentosPorMesTabela,
  MovimentosInvestimentoTabela,
} from "@/modules/financeiro/relatorios/components/investimentos-tabela";

// DataTable com idTabela: a preferência de colunas vem do servidor.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

afterEach(cleanup);

function aplicacao(id: string, posicao: number) {
  return {
    aplicacaoId: id,
    nome: `CDB ${id}`,
    conta: "BB corrente",
    aplicado: posicao,
    resgatado: 0,
    posicao,
    aplicadoPeriodo: 0,
    resgatadoPeriodo: 0,
  };
}

const DADOS = {
  saldoAplicado: 0.3,
  subcontas: [],
  subcontasOcultas: 0,
  aplicacoes: [aplicacao("a", 0.1), aplicacao("b", 0.2)],
  aplicadoPeriodo: 0,
  resgatadoPeriodo: 0,
  meses: [{ mes: "2026-08", aplicado: 1000, resgatado: 400.1, posicaoFinal: 7000 }],
  movimentos: [
    {
      id: "m1",
      numero: "LAN-9",
      data: "2026-08-10",
      valor: 400.1,
      sentido: "resgate",
      aplicacaoId: "a",
      aplicacaoNome: "CDB a",
      subcontaId: "s1",
      descricao: null,
    },
  ],
} as unknown as Investimentos;

/** Texto da célula do pé na coluna, com o espaço fixo do Intl virando espaço. */
function noPe(coluna: string): string {
  const pe = screen.getByText("Total").closest("tr")!;
  return (pe.querySelector(`[data-coluna="${coluna}"]`)?.textContent ?? "").replace(/\s/g, " ");
}

describe("tabelas de Investimentos", () => {
  it("o saldo aplicado soma em centavos no pé, sob a coluna dele", () => {
    render(<AplicacoesTabela dados={DADOS} />);
    expect(noPe("posicao")).toBe("R$ 0,30");
    expect(screen.getByRole("columnheader", { name: /^Saldo aplicado/ })).toBeTruthy();
  });

  it("o líquido do mês é aplicado menos resgatado", () => {
    render(<InvestimentosPorMesTabela dados={DADOS} />);
    expect(screen.getByText("08/2026")).toBeTruthy();
    expect(screen.getAllByText((_, el) => el?.textContent?.replace(/\s/g, " ") === "R$ 599,90").length).toBeGreaterThan(0);
  });

  it("resgate sai negativo e descrição vazia vira hífen", () => {
    render(<MovimentosInvestimentoTabela dados={DADOS} />);
    expect(screen.getByText("Resgate")).toBeTruthy();
    expect(screen.getByText("-")).toBeTruthy();
    expect(screen.getByText("LAN-9")).toBeTruthy();
  });
});
