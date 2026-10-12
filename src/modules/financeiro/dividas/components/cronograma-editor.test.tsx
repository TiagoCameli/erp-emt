import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// O DataTable com `idTabela` lê e grava a preferência do usuário por Server
// Action e usa o router; no teste, os dois ficam no lugar.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/financeiro/dividas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import {
  CronogramaEditor,
  linhaEditavel,
  type LinhaEditavel,
} from "@/modules/financeiro/dividas/components/cronograma-editor";

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

/** O editor com o estado no pai, como no drawer: cada tecla volta como linhas novas. */
function Editor({ iniciais }: { iniciais: LinhaEditavel[] }) {
  const [linhas, setLinhas] = React.useState(iniciais);
  return (
    <CronogramaEditor
      // Literal novo a cada renderização, como o EventoDrawer passa.
      colunas={["Principal", "Juros", "Encargos"]}
      linhas={linhas}
      onLinhasChange={setLinhas}
      alvo={{ rotulo: "O valor liberado", valor: 300 }}
    />
  );
}

const DUAS = [linhaEditavel("2026-01-10", [100, 10, 1]), linhaEditavel("2026-02-10", [100, 8, 1])];

describe("CronogramaEditor", () => {
  it("digitar no campo da célula não tira o foco nem remonta o campo", () => {
    render(<Editor iniciais={DUAS} />);
    const campo = screen.getByLabelText("Principal da parcela 1") as HTMLInputElement;
    campo.focus();
    fireEvent.change(campo, { target: { value: "150" } });
    fireEvent.change(campo, { target: { value: "200" } });
    // O mesmo nó: se as colunas fossem recriadas a cada tecla, o React montaria
    // outro input e o foco ficaria no body.
    expect(screen.getByLabelText("Principal da parcela 1")).toBe(campo);
    expect(document.activeElement).toBe(campo);
    expect(campo.value).toBe("200");
  });

  it("soma as colunas no total e confere com o alvo", () => {
    render(<Editor iniciais={DUAS} />);
    expect(screen.getByText("2 parcela(s)")).toBeTruthy();
    expect(screen.getByText(/faltam/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Principal da parcela 2"), { target: { value: "200" } });
    expect(screen.getByText(/fecha o valor liberado/)).toBeTruthy();
  });

  it("tira a parcela pelo botão da linha", () => {
    render(<Editor iniciais={DUAS} />);
    fireEvent.click(screen.getByRole("button", { name: "Tirar a parcela 1" }));
    expect(screen.getByText("1 parcela(s)")).toBeTruthy();
    expect((screen.getByLabelText("Vencimento da parcela 1") as HTMLInputElement).value).toBe("2026-02-10");
  });

  it("sem parcela mostra o convite para colar ou adicionar", () => {
    render(<Editor iniciais={[]} />);
    expect(screen.getByText("Nenhuma parcela. Cole do banco ou adicione uma a uma.")).toBeTruthy();
  });
});
