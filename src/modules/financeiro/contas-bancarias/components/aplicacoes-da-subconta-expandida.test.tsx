import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { formatarBRL } from "@/lib/formatadores";
import type { SaldoDaAplicacao } from "@/modules/financeiro/contas-bancarias/aplicacoes-da-subconta";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";

import { AplicacoesDaSubcontaExpandida } from "./aplicacoes-da-subconta-expandida";

afterEach(cleanup);

const SUBCONTA: ContaLista = {
  id: "caixa-inv",
  nome: "CAIXA ECONOMICA 578367973-5 · INVESTIMENTOS",
  banco: "caixa",
  agencia: null,
  conta: null,
  tipo: "investimento",
  contaPaiId: "caixa",
  saldoInicial: 0,
  saldoInicialData: null,
  saldoAtual: 6042879.07,
  movimentoAnteriorAoCorte: null,
  podeVerSaldo: true,
  ativo: true,
};

const APLICACOES: SaldoDaAplicacao[] = [
  { aplicacaoId: "cdb", subcontaId: "caixa-inv", nome: "Caixa Econômica - CDB 95", produto: "cdb", ativa: true, saldo: 5030408.62, ultimaPosicao: "2026-10-07" },
  { aplicacaoId: "fundo", subcontaId: "caixa-inv", nome: "Caixa Econômica - Fundo", produto: "fundo", ativa: true, saldo: 1012470.45, ultimaPosicao: "2026-10-08" },
  { aplicacaoId: "rende", subcontaId: "bb-inv", nome: "Banco do Brasil - Rende Fácil", produto: "cdb", ativa: true, saldo: 153615.4, ultimaPosicao: null },
];

function linhaDe(texto: string) {
  const linha = screen.getByText(texto).closest("tr");
  if (!linha) throw new Error(`sem linha para ${texto}`);
  return within(linha);
}

describe("AplicacoesDaSubcontaExpandida", () => {
  it("lista os investimentos da subconta com o saldo de cada um e o total", () => {
    render(<AplicacoesDaSubcontaExpandida subconta={SUBCONTA} aplicacoes={APLICACOES} />);
    expect(linhaDe("Caixa Econômica - CDB 95").getByText(formatarBRL(5030408.62))).toBeInTheDocument();
    expect(linhaDe("Caixa Econômica - Fundo").getByText(formatarBRL(1012470.45))).toBeInTheDocument();
    expect(linhaDe("Total da subconta").getByText(formatarBRL(6042879.07))).toBeInTheDocument();
    // Aplicação de outra subconta não entra.
    expect(screen.queryByText("Banco do Brasil - Rende Fácil")).toBeNull();
    expect(screen.queryByText("Fora dos investimentos")).toBeNull();
  });

  it("mostra o que a subconta tem fora dos investimentos", () => {
    render(
      <AplicacoesDaSubcontaExpandida
        subconta={{ ...SUBCONTA, saldoAtual: 6043000 }}
        aplicacoes={APLICACOES}
      />,
    );
    expect(linhaDe("Fora dos investimentos").getByText(formatarBRL(120.93))).toBeInTheDocument();
  });

  it("subconta sem investimento diz como cadastrar", () => {
    render(<AplicacoesDaSubcontaExpandida subconta={{ ...SUBCONTA, id: "nova" }} aplicacoes={APLICACOES} />);
    expect(screen.getByText(/não tem investimento cadastrado/)).toBeInTheDocument();
  });
});
