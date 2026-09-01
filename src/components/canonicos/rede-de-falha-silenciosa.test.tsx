import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * A rede que faz o silêncio deixar de ser possível.
 *
 * Antes dela, uma Server Action que REJEITAVA (em vez de devolver `{ erro }`)
 * não tinha para onde ir: error boundary do React não pega rejeição de handler
 * de evento, e o navegador só escrevia no console. O botão piscava e nada
 * acontecia — foi o que travou a aprovação da folha de 08/2026.
 *
 * A varredura achou 20 `try/finally` sem `catch` no app, mais handlers que dão
 * `await` numa action sem `try` nenhum. Consertar um por um deixaria o próximo
 * botão que alguém escrever descoberto; esta rede é o piso.
 */

const erros: string[] = [];
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    success: () => {},
    error: (m: string) => erros.push(m),
    warning: () => {},
    info: () => {},
  },
  DURACAO_TOAST: { sucesso: 2000, info: 3000, aviso: 5000, erro: 6000 },
}));

import { RedeDeFalhaSilenciosa } from "@/components/canonicos/rede-de-falha-silenciosa";

/**
 * jsdom não tem `PromiseRejectionEvent`, então o evento é montado na mão com o
 * `reason` que o navegador entregaria.
 */
function rejeitar(motivo: unknown) {
  const evento = new Event("unhandledrejection");
  Object.defineProperty(evento, "reason", { value: motivo });
  window.dispatchEvent(evento);
}

beforeEach(() => {
  erros.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RedeDeFalhaSilenciosa", () => {
  it("avisa quando uma action rejeita sem ninguém pegar", () => {
    render(<RedeDeFalhaSilenciosa />);

    rejeitar(new Error("Failed to find Server Action 'abc123'."));

    expect(erros.length).toBe(1);
    expect(erros[0]).toMatch(/recarregue/i);
    /*
     * "PODE não ter sido concluída" e "confira", não "tente de novo".
     *
     * Chegar aqui significa que a invocação morreu (as actions não lançam mais:
     * devolvem `{ erro }` até para falha inesperada). Invocação morta não é o
     * mesmo que nada aconteceu — o lote de aprovação de pagamentos é uma
     * transação por parcela, então parte pode estar commitada. Mandar tentar de
     * novo convida a aprovar o mesmo dinheiro duas vezes.
     */
    expect(erros[0]).toMatch(/pode não ter sido concluída/i);
    expect(erros[0]).toMatch(/confira/i);
  });

  it("não avisa de requisição cancelada de propósito", () => {
    render(<RedeDeFalhaSilenciosa />);

    const abortada = new Error("cancelado");
    abortada.name = "AbortError";
    rejeitar(abortada);

    // Cancelar não é falhar: navegação, desmontagem e busca com debounce
    // cancelam a toda hora, e um toast a cada uma seria ruído puro.
    expect(erros).toEqual([]);
  });

  it("não avisa do controle de fluxo do Next", () => {
    render(<RedeDeFalhaSilenciosa />);

    rejeitar(new Error("NEXT_REDIRECT;replace;/login;307;"));
    rejeitar(new Error("NEXT_NOT_FOUND"));

    expect(erros).toEqual([]);
  });

  it("dá um aviso só quando o lote falha em rajada", () => {
    render(<RedeDeFalhaSilenciosa />);

    // Um clique de "aprovar selecionados" dispara N chamadas; N toasts em cima
    // do outro não dizem mais do que um.
    for (let i = 0; i < 5; i++) rejeitar(new Error(`falhou ${i}`));

    expect(erros.length).toBe(1);
  });

  it("solta o listener ao desmontar", () => {
    const { unmount } = render(<RedeDeFalhaSilenciosa />);
    unmount();

    rejeitar(new Error("depois de desmontar"));

    expect(erros).toEqual([]);
  });
});
