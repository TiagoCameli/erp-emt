import { beforeEach, describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: sonner }));

const { toast, DURACAO_TOAST } = await import("@/components/canonicos/toast");

beforeEach(() => {
  sonner.success.mockClear();
  sonner.error.mockClear();
  sonner.warning.mockClear();
  sonner.info.mockClear();
});

describe("duração por tipo", () => {
  it("sucesso é curto: é confirmação, e em lote se vê centenas por dia", () => {
    toast.success("Conta bancária definida");
    expect(sonner.success).toHaveBeenCalledWith("Conta bancária definida", {
      duration: DURACAO_TOAST.sucesso,
    });
  });

  it("erro fica mais tempo que sucesso: em app de dinheiro precisa ser lido", () => {
    toast.error("Não foi possível definir a conta bancária");
    expect(sonner.error).toHaveBeenCalledWith(
      "Não foi possível definir a conta bancária",
      { duration: DURACAO_TOAST.erro },
    );
    expect(DURACAO_TOAST.erro).toBeGreaterThan(DURACAO_TOAST.sucesso);
    // O padrão do sonner é 4s. Erro não pode ficar MENOS que isso.
    expect(DURACAO_TOAST.erro).toBeGreaterThanOrEqual(4000);
  });

  it("aviso e info ficam entre o sucesso e o erro", () => {
    toast.warning("Competência fechada");
    toast.info("Nada a fazer");
    expect(sonner.warning).toHaveBeenCalledWith("Competência fechada", {
      duration: DURACAO_TOAST.aviso,
    });
    expect(sonner.info).toHaveBeenCalledWith("Nada a fazer", {
      duration: DURACAO_TOAST.info,
    });
    expect(DURACAO_TOAST.info).toBeGreaterThan(DURACAO_TOAST.sucesso);
    expect(DURACAO_TOAST.aviso).toBeLessThan(DURACAO_TOAST.erro);
  });

  it("quem chamar pode passar duração própria e ela ganha", () => {
    toast.success("pronto", { duration: 100 });
    expect(sonner.success).toHaveBeenCalledWith("pronto", { duration: 100 });
  });
});
