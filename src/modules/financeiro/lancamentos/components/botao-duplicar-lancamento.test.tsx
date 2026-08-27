import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

/**
 * O botão "Duplicar" da barra de seleção dos lançamentos.
 *
 * Duplicar CRIA um documento de dinheiro. O que estes testes trancam é o que
 * separa isso de um acidente: um por vez, e a navegação só depois de o servidor
 * confirmar.
 */

const duplicarLancamento = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/modules/financeiro/lancamentos/actions", () => ({
  duplicarLancamento: (...args: unknown[]) =>
    duplicarLancamento(...(args as [])),
}));

const sucessos: string[] = [];
const erros: string[] = [];
const avisos: string[] = [];
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    success: (m: string) => sucessos.push(m),
    error: (m: string) => erros.push(m),
    warning: (m: string) => avisos.push(m),
    info: () => {},
  },
  DURACAO_TOAST: { sucesso: 2000, info: 3000, aviso: 5000, erro: 6000 },
}));

import { BotaoDuplicarLancamento } from "@/modules/financeiro/lancamentos/components/botao-duplicar-lancamento";

const UM = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

function abrir(selecionados: string[], onLimparSelecao = vi.fn()) {
  render(
    <BotaoDuplicarLancamento
      selecionados={selecionados}
      onLimparSelecao={onLimparSelecao}
    />,
  );
}

function botao() {
  return screen.getByRole("button", { name: /duplicar/i });
}

describe("BotaoDuplicarLancamento", () => {
  beforeEach(() => {
    duplicarLancamento.mockReset();
    push.mockReset();
    sucessos.length = 0;
    erros.length = 0;
    avisos.length = 0;
  });
  afterEach(cleanup);

  it("não aparece sem nada marcado", () => {
    abrir([]);
    expect(screen.queryByRole("button", { name: /duplicar/i })).toBeNull();
  });

  it("duplica e abre o lançamento novo", async () => {
    duplicarLancamento.mockResolvedValue({
      ok: true,
      id: "novo-id",
      numero: "LAN-2026-0473",
      avisos: [],
    });
    const limpar = vi.fn();
    abrir([UM], limpar);

    fireEvent.click(botao());

    await waitFor(() => expect(duplicarLancamento).toHaveBeenCalledWith(UM));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/financeiro/lancamentos/novo-id"),
    );
    expect(sucessos[0]).toBe("Lançamento duplicado em LAN-2026-0473");
    expect(limpar).toHaveBeenCalled();
  });

  describe("um por vez", () => {
    it("com dois marcados o botão fica desabilitado e diz por quê", () => {
      abrir([UM, OUTRO]);
      expect(botao()).toBeDisabled();
      expect(
        screen.getByText(/duplicar é de um lançamento por vez/i),
      ).toBeTruthy();
    });

    it("clicar com dois marcados não chama o servidor", () => {
      // A trava que importa: duplicar em lote criaria N documentos de dinheiro
      // de uma vez. O `disabled` já barra o clique; este teste garante que a
      // barreira não é só visual.
      abrir([UM, OUTRO]);
      fireEvent.click(botao());
      expect(duplicarLancamento).not.toHaveBeenCalled();
    });

    it("CONTROLE: com um marcado o botão está habilitado", () => {
      // Sem este caso, o teste acima passaria também numa versão que deixasse o
      // botão desabilitado sempre.
      abrir([UM]);
      expect(botao()).toBeEnabled();
      expect(screen.queryByText(/um lançamento por vez/i)).toBeNull();
    });
  });

  it("mostra os avisos do que precisa ser conferido, separados do sucesso", () => {
    duplicarLancamento.mockResolvedValue({
      ok: true,
      id: "novo-id",
      numero: "LAN-2026-0473",
      avisos: [
        "O número do documento (NF 12345) foi copiado: troque se a nota for outra",
      ],
    });
    abrir([UM]);

    fireEvent.click(botao());

    return waitFor(() => {
      expect(sucessos).toHaveLength(1);
      expect(avisos[0]).toContain("NF 12345");
    });
  });

  it("erro do servidor não navega e mantém a seleção", async () => {
    duplicarLancamento.mockResolvedValue({
      erro: "Este lançamento tem parcela cancelada.",
    });
    const limpar = vi.fn();
    abrir([UM], limpar);

    fireEvent.click(botao());

    await waitFor(() => expect(erros).toHaveLength(1));
    expect(push).not.toHaveBeenCalled();
    // Perder a seleção depois de um erro é castigo em cima de tropeço.
    expect(limpar).not.toHaveBeenCalled();
  });
});
