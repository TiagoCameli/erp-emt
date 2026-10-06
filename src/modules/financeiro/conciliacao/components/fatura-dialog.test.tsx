import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { casarFatura, comprasDoCartao } from "@/modules/financeiro/conciliacao/actions";
import type { TransacaoPainel } from "@/modules/financeiro/conciliacao/painel";

import { FaturaDialog } from "./fatura-dialog";

vi.mock("@/modules/financeiro/conciliacao/actions", () => ({
  comprasDoCartao: vi.fn(),
  casarFatura: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/canonicos/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const debito: TransacaoPainel = {
  id: "11111111-1111-4111-8111-111111111111",
  extratoId: "e",
  dataMovimento: "2026-09-28",
  valor: -26917.37,
  tipo: "debito",
  memo: "CARTAO CX",
  conciliada: false,
  automatica: false,
  confiraConfirmado: false,
  parcela: null,
  transferencia: null,
  estorno: null,
  fatura: null,
};

const compra = (parcelaId: string, valor: number, vencimento = "2026-09-28") => ({
  parcelaId,
  lancamentoId: "l",
  lancamentoNumero: "LAN-1",
  descricao: "compra",
  fornecedor: "LOJA",
  numeroParcela: 1,
  qtdParcelas: 1,
  valor,
  vencimento,
  status: "aprovado",
  contaNome: null,
  dataPagamento: null,
});

describe("FaturaDialog", () => {
  it("marca as compras do vencimento e casa quando a soma fecha o débito", async () => {
    vi.mocked(comprasDoCartao).mockResolvedValue({
      compras: [compra("22222222-2222-4222-8222-222222222222", 8640), compra("33333333-3333-4333-8333-333333333333", 18277.37)],
    });
    render(
      <FaturaDialog
        transacao={debito}
        onFechar={() => {}}
        cartoes={[{ id: "44444444-4444-4444-8444-444444444444", nome: "CX FINAL 3910" }]}
        categorias={[]}
        centros={[]}
      />,
    );
    await screen.findAllByText("LAN-1 · LOJA");
    fireEvent.click(screen.getByRole("button", { name: /Casar fatura/ }));
    await waitFor(() => expect(casarFatura).toHaveBeenCalledTimes(1));
    expect(vi.mocked(casarFatura).mock.calls[0][0]).toMatchObject({ encargos: null });
    expect(vi.mocked(casarFatura).mock.calls[0][0].parcelaIds).toHaveLength(2);
  });

  it("com diferença, pede categoria e centro dos encargos antes de casar", async () => {
    vi.mocked(comprasDoCartao).mockResolvedValue({ compras: [compra("22222222-2222-4222-8222-222222222222", 8640)] });
    render(
      <FaturaDialog
        transacao={debito}
        onFechar={() => {}}
        cartoes={[{ id: "44444444-4444-4444-8444-444444444444", nome: "CX FINAL 3910" }]}
        categorias={[]}
        centros={[]}
      />,
    );
    await screen.findByText("LAN-1 · LOJA");
    expect(screen.getByText(/vira o lançamento/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Casar fatura/ })).toBeDisabled();
  });
});
