import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * O cadastro do contrato de dívida: sem os obrigatórios não chama a action;
 * primeiro vencimento antes da liberação é barrado na tela; e o que chega à
 * action é número de verdade (milhar e centavo do InputMoeda, taxa com
 * vírgula), com a etapa e o status certos.
 */

const salvarContrato = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/financeiro/dividas/actions", () => ({
  salvarContrato: (...args: unknown[]) => salvarContrato(...args),
  buscarLancamentos: vi.fn(async () => []),
}));
vi.mock("@/modules/_shared/anexos/actions", () => ({ anexosDoDocumento: vi.fn(async () => []) }));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
// O Combobox virtualizado não desenha no jsdom: aqui ele vira um <select>.
vi.mock("@/components/canonicos", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/canonicos")>();
  return {
    ...original,
    Combobox: ({
      id,
      valor,
      onValorChange,
      opcoes,
    }: {
      id?: string;
      valor: string;
      onValorChange: (v: string) => void;
      opcoes: { valor: string; rotulo: string }[];
    }) => (
      <select id={id} value={valor} onChange={(e) => onValorChange(e.target.value)}>
        <option value="">-</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    ),
  };
});

import { ContratoFormDrawer } from "@/modules/financeiro/dividas/components/contrato-form-drawer";

const ETAPA = "c4e0f922-3aec-8c72-7089-225523e04557";

function renderizar() {
  const aoMudar = vi.fn();
  const aoSalvar = vi.fn();
  render(
    <ContratoFormDrawer
      aberto
      onAbertoChange={aoMudar}
      contrato={null}
      etapas={[{ id: ETAPA, rotulo: "Empréstimos › BB 123" }]}
      podeEditar
      onSalvo={aoSalvar}
    />,
  );
  return { aoMudar, aoSalvar };
}

function digitar(rotulo: RegExp, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

function preencherValidos() {
  digitar(/^Credor/, "Banco do Brasil");
  digitar(/^Número do contrato/, "123/2026");
  digitar(/^Tipo/, "emprestimo");
  digitar(/^Etapa/, ETAPA);
  digitar(/^Valor contratado/, "100.000,00");
  digitar(/^Valor liberado/, "98.765,43");
  digitar(/^Data da liberação/, "2026-01-15");
  digitar(/^Primeiro vencimento/, "2026-02-15");
  digitar(/^Taxa ao mês/, "1,85");
  digitar(/^Parcelas/, "12");
  digitar(/^Sistema/, "price");
}

beforeEach(() => {
  salvarContrato.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("ContratoFormDrawer", () => {
  it("sem os obrigatórios, mostra os erros e não chama a action", async () => {
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar contrato" }));
    await waitFor(() => expect(screen.getByText("Informe o credor")).toBeTruthy());
    expect(screen.getByText("Escolha a etapa do contrato")).toBeTruthy();
    expect(screen.getByText("Informe o valor liberado")).toBeTruthy();
    expect(salvarContrato).not.toHaveBeenCalled();
  });

  it("primeiro vencimento antes da liberação é barrado na tela", async () => {
    renderizar();
    preencherValidos();
    digitar(/^Primeiro vencimento/, "2026-01-10");
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar contrato" }));
    await waitFor(() =>
      expect(screen.getByText("O primeiro vencimento precisa ser depois da liberação")).toBeTruthy(),
    );
    expect(salvarContrato).not.toHaveBeenCalled();
  });

  it("carência igual às parcelas é barrada", async () => {
    renderizar();
    preencherValidos();
    digitar(/^Carência/, "12");
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar contrato" }));
    await waitFor(() =>
      expect(screen.getByText("A carência precisa ser menor que o número de parcelas")).toBeTruthy(),
    );
    expect(salvarContrato).not.toHaveBeenCalled();
  });

  it("válido, manda números de verdade e leva ao contrato novo", async () => {
    salvarContrato.mockResolvedValue({ ok: true, id: "novo-id" });
    const { aoMudar, aoSalvar } = renderizar();
    preencherValidos();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar contrato" }));

    await waitFor(() => expect(salvarContrato).toHaveBeenCalledTimes(1));
    const [id, dados] = salvarContrato.mock.calls[0]!;
    expect(id).toBeNull();
    expect(dados).toMatchObject({
      credor: "Banco do Brasil",
      numero: "123/2026",
      tipo: "emprestimo",
      centroCustoId: ETAPA,
      lancamentoId: "",
      valorContratado: 100000,
      valorLiberado: 98765.43,
      taxaAm: 1.85,
      parcelas: 12,
      carenciaMeses: 0,
      sistema: "price",
      indexador: "pre",
    });
    // Contrato novo não manda status: o banco põe "ativo".
    expect((dados as Record<string, unknown>).status).toBeUndefined();
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
    expect(aoSalvar).toHaveBeenCalledWith("novo-id");
  });

  it("recusa do banco vira toast e o drawer fica aberto", async () => {
    salvarContrato.mockResolvedValue({ erro: "A etapa do contrato precisa ser ativa" });
    const { aoMudar } = renderizar();
    preencherValidos();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar contrato" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("A etapa do contrato precisa ser ativa"));
    expect(aoMudar).not.toHaveBeenCalledWith(false);
  });
});
