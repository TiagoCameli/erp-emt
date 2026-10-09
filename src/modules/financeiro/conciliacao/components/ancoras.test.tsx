import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { excluirAncora } from "@/modules/financeiro/conciliacao/actions";
import type { AncoraSaldo, ContaBancariaOpcao } from "@/modules/financeiro/conciliacao/queries";

import { Ancoras } from "./ancoras";

vi.mock("@/modules/financeiro/conciliacao/actions", () => ({
  adicionarAncora: vi.fn(),
  excluirAncora: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/canonicos/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const conta: ContaBancariaOpcao = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "BANCO DO BRASIL 102.124-9",
  banco: "bb",
  bancoRotulo: "Banco do Brasil",
  ativo: true,
  numero: "102.124-9",
  tipo: "corrente",
  contaPaiId: null,
};
const ancora: AncoraSaldo = {
  id: "22222222-2222-4222-8222-222222222222",
  contaId: conta.id,
  data: "2026-10-09",
  saldo: -23838.62,
  fonte: "ledgerbal_fim_periodo",
  observacao: "Extrato.ofx",
};

describe("Ancoras", () => {
  it("exclui a âncora depois de confirmar", async () => {
    render(<Ancoras ancoras={[ancora]} contas={[conta]} podeEditar />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir âncora de 09/10/2026" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir âncora" }));
    await waitFor(() => expect(excluirAncora).toHaveBeenCalledWith(ancora.id));
  });

  it("sem permissão de editar, não mostra a lixeira", () => {
    render(<Ancoras ancoras={[ancora]} contas={[conta]} podeEditar={false} />);
    expect(screen.queryByRole("button", { name: /Excluir âncora/ })).toBeNull();
  });
});
