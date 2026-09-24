import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * O formulário do pagamento como o PagamentoFreteForm da origem, com o foco no "Dividir
 * entre meses": N pagamentos gravados em sequência, e a falha parcial dita na tela sem
 * reenviar o que já gravou.
 */

const salvarPagamento = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/frete/pagamentos/actions", () => ({
  salvarPagamento: (...args: unknown[]) => salvarPagamento(...args),
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
// O Combobox virtualizado não desenha no jsdom: aqui ele vira um <select> com as mesmas opções.
vi.mock("@/components/canonicos", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/canonicos")>();
  return {
    ...original,
    Combobox: ({
      id,
      valor,
      onValorChange,
      opcoes,
      ariaLabel,
    }: {
      id?: string;
      valor: string;
      onValorChange: (v: string) => void;
      opcoes: { valor: string; rotulo: string }[];
      ariaLabel?: string;
    }) => (
      <select id={id} aria-label={ariaLabel} value={valor} onChange={(e) => onValorChange(e.target.value)}>
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

import { AVISO_SEM_LANCAMENTO, PagamentoFormDrawer } from "@/modules/frete/pagamentos/components/pagamento-form-drawer";

const TRANSP = "11111111-1111-4111-8111-111111111111";

function renderizar() {
  const aoMudar = vi.fn();
  render(
    <PagamentoFormDrawer
      aberto
      onAbertoChange={aoMudar}
      pagamento={null}
      transportadoras={[{ id: TRANSP, nome: "ETAM", ativo: true, nomes: ["ETAM"] }]}
      opcoesPagoPor={[
        { nome: "EMT Construtora", tipo: "Empresa" },
        { nome: "Fulano", tipo: "Funcionário" },
      ]}
      nomeUsuario="Tiago"
      mesHoje="2026-09"
    />,
  );
  return aoMudar;
}

function preencherBase() {
  fireEvent.change(screen.getByLabelText(/Data do pagamento/), { target: { value: "2026-09-10" } });
  fireEvent.change(screen.getByLabelText(/Transportadora/), { target: { value: TRANSP } });
  fireEvent.change(screen.getByLabelText(/Pago por/), { target: { value: "EMT Construtora" } });
}

function ligarDividir() {
  fireEvent.click(screen.getByRole("checkbox", { name: "Dividir entre meses" }));
}

function parcela(indice: number, mes: string, valor: string) {
  fireEvent.change(screen.getByLabelText(`Mês da parcela ${indice}`), { target: { value: mes } });
  fireEvent.change(screen.getByLabelText(`Valor da parcela ${indice}`), { target: { value: valor } });
}

beforeEach(() => {
  salvarPagamento.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("PagamentoFormDrawer", () => {
  it("mostra o aviso de que não gera lançamento, o responsável travado no usuário e 'EMT Construtora' no pago por", () => {
    renderizar();
    expect(screen.getByText(AVISO_SEM_LANCAMENTO)).toBeTruthy();
    const responsavel = screen.getByLabelText(/Responsável/) as HTMLInputElement;
    expect(responsavel.value).toBe("Tiago");
    expect(responsavel.readOnly).toBe(true);
    expect(screen.getByRole("option", { name: "EMT Construtora (Empresa)" })).toBeTruthy();
  });

  it("litros só aparecem no método combustível", () => {
    renderizar();
    expect(screen.queryByLabelText(/Quantidade combustível/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Método de pagamento/), { target: { value: "combustivel" } });
    expect(screen.getByLabelText(/Quantidade combustível/)).toBeTruthy();
  });

  it("dividir esconde mês e valor, começa com 2 parcelas, soma o total e só remove acima de 2", () => {
    renderizar();
    ligarDividir();
    expect(screen.queryByLabelText(/^Valor \(R\$\)/)).toBeNull();
    expect(screen.queryByLabelText(/Remover parcela/)).toBeNull();
    parcela(1, "2026-07", "100,5");
    parcela(2, "2026-08", "200");
    expect(screen.getByTestId("total-parcelas").textContent).toMatch(/300,50/);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar mês/ }));
    expect(screen.getAllByLabelText(/Remover parcela/)).toHaveLength(3);
  });

  it("parcela sem mês não grava nada", async () => {
    renderizar();
    preencherBase();
    ligarDividir();
    parcela(1, "2026-07", "100");
    fireEvent.click(screen.getByRole("button", { name: "Registrar pagamento" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(salvarPagamento).not.toHaveBeenCalled();
  });

  it("grava um pagamento por parcela, em sequência, com o mês e o valor de cada uma", async () => {
    salvarPagamento.mockResolvedValue({ ok: true, id: "x" });
    const aoMudar = renderizar();
    preencherBase();
    ligarDividir();
    parcela(1, "2026-07", "600");
    parcela(2, "2026-08", "634,5678");
    fireEvent.click(screen.getByRole("button", { name: "Registrar pagamento" }));
    await waitFor(() => expect(salvarPagamento).toHaveBeenCalledTimes(2));
    expect(salvarPagamento.mock.calls[0]).toEqual([
      null,
      expect.objectContaining({ mesReferencia: "2026-07", valor: 600, transportadoraId: TRANSP, pagoPor: "EMT Construtora" }),
    ]);
    expect(salvarPagamento.mock.calls[1][1]).toMatchObject({ mesReferencia: "2026-08", valor: 634.5678 });
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("2 pagamentos registrados"));
    expect(aoMudar).toHaveBeenCalledWith(false);
  });

  it("falha parcial: diz o que gravou e o que não, e deixa só o que falhou para reenviar", async () => {
    salvarPagamento
      .mockResolvedValueOnce({ ok: true, id: "a" })
      .mockResolvedValueOnce({ erro: "Valor deve ser > 0" })
      .mockResolvedValueOnce({ erro: "Selecione quem pagou" });
    const aoMudar = renderizar();
    preencherBase();
    ligarDividir();
    fireEvent.click(screen.getByRole("button", { name: /Adicionar mês/ }));
    parcela(1, "2026-06", "10");
    parcela(2, "2026-07", "20");
    parcela(3, "2026-08", "30");
    fireEvent.click(screen.getByRole("button", { name: "Registrar pagamento" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    const mensagem = String(toastErro.mock.calls[0][0]);
    expect(mensagem).toMatch(/^1 de 3 pagamentos registrados/);
    expect(mensagem).toContain("Julho 2026: Valor deve ser > 0");
    expect(mensagem).toContain("Agosto 2026: Selecione quem pagou");
    expect(aoMudar).not.toHaveBeenCalledWith(false);
    // Ficaram as duas que falharam.
    expect((screen.getByLabelText("Mês da parcela 1") as HTMLSelectElement).value).toBe("2026-07");
    expect((screen.getByLabelText("Mês da parcela 2") as HTMLSelectElement).value).toBe("2026-08");
    expect(screen.queryByLabelText("Mês da parcela 3")).toBeNull();
  });
});

