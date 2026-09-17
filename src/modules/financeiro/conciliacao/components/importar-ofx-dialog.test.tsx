import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { importarOfx } from "@/modules/financeiro/conciliacao/actions";
import { ImportarOfxDialog } from "@/modules/financeiro/conciliacao/components/importar-ofx-dialog";
import type { ContaBancariaOpcao } from "@/modules/financeiro/conciliacao/queries";

vi.mock("@/modules/financeiro/conciliacao/actions", () => ({
  importarOfx: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/conciliacao",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const CONTA_ID = "7f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b";

const contas: ContaBancariaOpcao[] = [
  {
    id: CONTA_ID,
    nome: "BANCO DO BRASIL 102.124-9",
    banco: "bb",
    bancoRotulo: "Banco do Brasil",
    ativo: true,
  },
];

/**
 * Abre o diálogo com a conta já escolhida (é o caminho real quando a página
 * está filtrada por conta), põe um arquivo e manda importar.
 */
async function importar(resposta: Awaited<ReturnType<typeof importarOfx>>) {
  vi.mocked(importarOfx).mockResolvedValue(resposta);

  render(
    <ImportarOfxDialog
      aberto
      onAbertoChange={() => {}}
      contas={contas}
      contaInicialId={CONTA_ID}
    />,
  );

  // O Dialog do Radix monta em portal, fora do container do render: o
  // seletor de arquivo vive no document.body.
  const entrada = document.body.querySelector<HTMLInputElement>(
    'input[type="file"]',
  );
  if (!entrada) throw new Error("o seletor de arquivo sumiu do diálogo");

  const arquivo = new File(["<OFX></OFX>"], "01.2026 Banco do Brasil.ofx", {
    type: "application/x-ofx",
  });
  fireEvent.change(entrada, { target: { files: [arquivo] } });

  fireEvent.click(screen.getByRole("button", { name: /Importar extrato/ }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ImportarOfxDialog", () => {
  it("mostra o aviso quando o extrato não é de um mês fechado", async () => {
    await importar({
      ok: true,
      inseridas: 280,
      ignoradas: 0,
      aviso:
        "O arquivo vai de 30/12/2025 a 31/01/2026, que não é um mês fechado. Exporte do dia 1 ao último dia do mês.",
    });

    expect(
      await screen.findByText("O extrato não é de um mês fechado"),
    ).toBeInTheDocument();
    expect(screen.getByText(/30\/12\/2025 a 31\/01\/2026/)).toBeInTheDocument();
    // O aviso não pode engolir o resultado: as duas coisas aparecem juntas.
    expect(screen.getByText("280 transações importadas")).toBeInTheDocument();
  });

  it("não inventa aviso quando o mês está fechado", async () => {
    await importar({ ok: true, inseridas: 4, ignoradas: 0, aviso: null });

    expect(await screen.findByText("4 transações importadas")).toBeInTheDocument();
    expect(
      screen.queryByText("O extrato não é de um mês fechado"),
    ).not.toBeInTheDocument();
  });
});
