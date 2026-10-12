import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";

import { formatarBRL } from "@/lib/formatadores";
import type { SaldoDaAplicacao } from "@/modules/financeiro/contas-bancarias/aplicacoes-da-subconta";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";

import { AplicacoesDaSubcontaExpandida } from "./aplicacoes-da-subconta-expandida";

// O DataTable com `idTabela` lê e grava a preferência do usuário por Server
// Action e usa o router; no teste, os dois ficam no lugar.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/financeiro/contas-bancarias",
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

/** O `Intl` põe espaço não separável depois do R$; o testing-library normaliza o do DOM. */
const brl = (valor: number) => formatarBRL(valor).replace(/\u00a0/g, " ");

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
    expect(linhaDe("Caixa Econômica - CDB 95").getByText(brl(5030408.62))).toBeInTheDocument();
    expect(linhaDe("Caixa Econômica - Fundo").getByText(brl(1012470.45))).toBeInTheDocument();
    expect(linhaDe("Total da subconta").getByText(brl(6042879.07))).toBeInTheDocument();
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
    expect(linhaDe("Fora dos investimentos").getByText(brl(120.93))).toBeInTheDocument();
  });

  it("subconta sem investimento diz como cadastrar", () => {
    render(<AplicacoesDaSubcontaExpandida subconta={{ ...SUBCONTA, id: "nova" }} aplicacoes={APLICACOES} />);
    expect(screen.getByText(/não tem investimento cadastrado/)).toBeInTheDocument();
  });
});
