import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  conciliar,
  conciliarTransferencia,
} from "@/modules/financeiro/conciliacao/actions";
import { ConciliarDialog } from "@/modules/financeiro/conciliacao/components/conciliar-dialog";
import type {
  SugestaoConciliacao,
  TransacaoLista,
} from "@/modules/financeiro/conciliacao/queries";

vi.mock("@/modules/financeiro/conciliacao/actions", () => ({
  conciliar: vi.fn(async () => ({ ok: true as const })),
  conciliarTransferencia: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/conciliacao",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const TRANSACAO_ID = "1f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b";
const TRANSFERENCIA_ID = "2a2b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b";
const PARCELA_ID = "3b3c7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b";

/** O débito de R$ 450.000,00 de 07/01/2025 da Caixa, que é o caso do defeito. */
const transacao: TransacaoLista = {
  id: TRANSACAO_ID,
  extratoId: "4c4d7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
  contaBancariaId: "5d5e7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
  dataMovimento: "2025-01-07",
  memo: "ENVIO DE TED",
  valor: -450000,
  tipo: "debito",
  conciliada: false,
  parcela: null,
  transferencia: null,
};

const sugestaoTransferencia: SugestaoConciliacao = {
  especie: "transferencia",
  id: TRANSFERENCIA_ID,
  transferencia: {
    id: TRANSFERENCIA_ID,
    numero: "TRF-2026-0168",
    descricao: "TRASNFERENCIA ENTRE CONTAS",
    dataTransferencia: "2025-01-07",
    valor: 450000,
    contaOrigemNome: "CAIXA ECONOMICA 578367973-5",
    contaDestinoNome: "BANCO DO BRASIL 102.124-9",
  },
};

const sugestaoParcela: SugestaoConciliacao = {
  especie: "parcela",
  id: PARCELA_ID,
  parcela: {
    id: PARCELA_ID,
    lancamentoId: "6e6f7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
    lancamentoNumero: "LAN-2026-0777",
    lancamentoDescricao: "REFERENTE CONTRATO 28102020",
    tipoLancamento: "a_pagar",
    fornecedorNome: null,
    numeroParcela: 1,
    valor: 450000,
    desconto: 0,
    valorLiquido: 450000,
    dataPagamento: "2025-01-07",
    dataVencimento: "2025-01-07",
  },
};

function abrir(sugestoes: SugestaoConciliacao[]) {
  render(
    <ConciliarDialog
      aberto
      onAbertoChange={() => {}}
      transacao={transacao}
      sugestoes={sugestoes}
      carregando={false}
      onConciliada={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConciliarDialog", () => {
  it("oferece a transferência lançada como candidata do movimento", () => {
    abrir([sugestaoTransferencia]);

    expect(screen.getByText("TRF-2026-0168")).toBeInTheDocument();
    // O par origem/destino é o que diz se o lado está certo, então precisa
    // aparecer: sem ele a pessoa não tem como conferir o que está casando.
    expect(
      screen.getByText(/CAIXA ECONOMICA 578367973-5 para BANCO DO BRASIL/),
    ).toBeInTheDocument();
  });

  it("manda transferência para a RPC de transferência, não para a de parcela", async () => {
    abrir([sugestaoTransferencia]);

    fireEvent.click(screen.getByText("TRASNFERENCIA ENTRE CONTAS"));
    fireEvent.click(screen.getByRole("button", { name: /^Conciliar$/ }));
    await vi.waitFor(() =>
      expect(conciliarTransferencia).toHaveBeenCalledWith(
        TRANSACAO_ID,
        TRANSFERENCIA_ID,
      ),
    );

    // A troca que este teste existe para pegar: chamar `conciliar` com o id de
    // uma transferência acha que é parcela, não encontra, e o usuário leva
    // "Parcela nao encontrada" sem entender por quê.
    expect(conciliar).not.toHaveBeenCalled();
  });

  it("continua mandando parcela para a RPC de parcela", async () => {
    abrir([sugestaoParcela]);

    fireEvent.click(screen.getByText("REFERENTE CONTRATO 28102020"));
    fireEvent.click(screen.getByRole("button", { name: /^Conciliar$/ }));
    await vi.waitFor(() =>
      expect(conciliar).toHaveBeenCalledWith(TRANSACAO_ID, PARCELA_ID),
    );

    expect(conciliarTransferencia).not.toHaveBeenCalled();
  });

  it("diz que procurou parcela E transferência quando não achou nada", () => {
    abrir([]);

    expect(screen.getByText("Nenhum lançamento compatível")).toBeInTheDocument();
    expect(
      screen.getByText(/parcela paga nem transferência/),
    ).toBeInTheDocument();
  });
});
