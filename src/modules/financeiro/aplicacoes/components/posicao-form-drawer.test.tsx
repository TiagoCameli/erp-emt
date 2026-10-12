import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * A prévia da posição contra o CDI: o esperado aparece, o aviso acende quando o
 * banco diz que está fora da faixa, e gravar assim pede o motivo, que vai para
 * a action com `confirmar`.
 */

const salvarPosicao = vi.fn();
const simularPosicao = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/financeiro/aplicacoes/actions", () => ({
  salvarPosicao: (...args: unknown[]) => salvarPosicao(...args),
  simularPosicao: (...args: unknown[]) => simularPosicao(...args),
  excluirPosicao: vi.fn(),
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

import {
  AVISO_FORA_DO_CDI,
  PosicaoFormDrawer,
} from "@/modules/financeiro/aplicacoes/components/posicao-form-drawer";

const APLICACAO = "11111111-1111-4111-8111-111111111111";

function simulacao(parcial: Record<string, unknown> = {}) {
  return {
    dataAnterior: "2026-09-30",
    saldoAnterior: 100000,
    aplicado: 0,
    resgatado: 0,
    rendimento: 850,
    eAbertura: false,
    rendimentoEsperado: 800,
    foraDoCdi: false,
    ...parcial,
  };
}

function renderizar() {
  const aoMudar = vi.fn();
  render(
    <PosicaoFormDrawer
      aberto
      onAbertoChange={aoMudar}
      aplicacoes={[{ id: APLICACAO, nome: "Caixa Econômica - CDB 95" }]}
      posicao={null}
      podeEditar
    />,
  );
  return aoMudar;
}

function digitarSaldo(valor: string) {
  fireEvent.change(screen.getByLabelText(/Saldo líquido/), { target: { value: valor } });
}

beforeEach(() => {
  salvarPosicao.mockReset();
  simularPosicao.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("PosicaoFormDrawer", () => {
  it("mostra o esperado pelo CDI e não avisa quando está dentro da faixa", async () => {
    simularPosicao.mockResolvedValue(simulacao());
    renderizar();
    digitarSaldo("100850,00");
    await waitFor(() => expect(screen.getByText("Esperado pelo CDI")).toBeTruthy());
    expect(screen.queryByText(AVISO_FORA_DO_CDI)).toBeNull();
  });

  it("sem CDI no período, diz isso no lugar do valor", async () => {
    simularPosicao.mockResolvedValue(simulacao({ rendimentoEsperado: null }));
    renderizar();
    digitarSaldo("100850,00");
    await waitFor(() => expect(screen.getByText("sem CDI no período")).toBeTruthy());
  });

  it("acende o aviso quando a posição está fora do CDI", async () => {
    simularPosicao.mockResolvedValue(simulacao({ rendimento: -50, foraDoCdi: true }));
    renderizar();
    digitarSaldo("99950,00");
    await waitFor(() => expect(screen.getByText(AVISO_FORA_DO_CDI)).toBeTruthy());
  });

  it("dentro da faixa grava direto, sem confirmar nem motivo", async () => {
    simularPosicao.mockResolvedValue(simulacao());
    salvarPosicao.mockResolvedValue({ ok: true, id: "p1" });
    const aoMudar = renderizar();
    digitarSaldo("100850,00");
    await waitFor(() => expect(screen.getByText("Esperado pelo CDI")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Gravar posição" }));
    await waitFor(() => expect(salvarPosicao).toHaveBeenCalledTimes(1));
    const enviado = salvarPosicao.mock.calls[0]![0] as Record<string, unknown>;
    expect(enviado.confirmar).toBeUndefined();
    expect(enviado.motivo).toBeUndefined();
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
  });

  it("fora do CDI, gravar pede o motivo e manda confirmar com ele", async () => {
    simularPosicao.mockResolvedValue(simulacao({ rendimento: -50, foraDoCdi: true }));
    salvarPosicao.mockResolvedValue({ ok: true, id: "p1" });
    const aoMudar = renderizar();
    digitarSaldo("99950,00");
    await waitFor(() => expect(screen.getByText(AVISO_FORA_DO_CDI)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Gravar posição" }));
    const dialogo = await screen.findByRole("dialog", { name: /fora do esperado pelo CDI/ });
    expect(salvarPosicao).not.toHaveBeenCalled();

    const botao = within(dialogo).getByRole("button", { name: "Gravar mesmo assim" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText("Motivo"), {
      target: { value: "  Resgate de IR no fim do semestre  " },
    });
    fireEvent.click(botao);

    await waitFor(() => expect(salvarPosicao).toHaveBeenCalledTimes(1));
    expect(salvarPosicao.mock.calls[0]![0]).toMatchObject({
      aplicacaoId: APLICACAO,
      saldoLiquido: 99950,
      confirmar: true,
      motivo: "Resgate de IR no fim do semestre",
    });
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
  });

  it("se o banco recusa por fora do CDI (prévia ainda não chegou), abre o pedido de motivo", async () => {
    simularPosicao.mockReturnValue(new Promise(() => {}));
    salvarPosicao
      .mockResolvedValueOnce({
        erro: "Posicao fora do CDI: rendimento de R$ -50,00 (esperado R$ 800,00). Confirme com o motivo",
      })
      .mockResolvedValueOnce({ ok: true, id: "p1" });
    renderizar();
    digitarSaldo("99950,00");
    fireEvent.click(screen.getByRole("button", { name: "Gravar posição" }));

    const dialogo = await screen.findByRole("dialog", { name: /fora do esperado pelo CDI/ });
    expect(toastErro).not.toHaveBeenCalled();
    fireEvent.change(within(dialogo).getByLabelText("Motivo"), { target: { value: "Extrato conferido" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Gravar mesmo assim" }));

    await waitFor(() => expect(salvarPosicao).toHaveBeenCalledTimes(2));
    expect(salvarPosicao.mock.calls[1]![0]).toMatchObject({ confirmar: true, motivo: "Extrato conferido" });
  });
});
