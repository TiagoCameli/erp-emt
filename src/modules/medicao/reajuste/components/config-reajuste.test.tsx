import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Seção Reajuste do contrato: tem reajuste, data-base (mês), periodicidade, aniversário e índice.
 * Quem tem `medicao.reajuste/editar` abre o FormDrawer e grava por `salvarConfigReajuste`; a RPC
 * confere tudo de novo e a recusa dela aparece como veio.
 */

const salvarConfigReajuste = vi.fn();
const refresh = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));
vi.mock("@/modules/medicao/reajuste/actions", () => ({
  salvarConfigReajuste: (...a: unknown[]) => salvarConfigReajuste(...a),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: (...a: unknown[]) => toastErro(...a), success: (...a: unknown[]) => toastSucesso(...a), warning: vi.fn(), info: vi.fn() },
}));

import { ConfigReajuste } from "@/modules/medicao/reajuste/components/config-reajuste";
import type { ConfigReajuste as DadosConfig } from "@/modules/medicao/reajuste/tipos";

const CONTRATO = "33333333-3333-4333-8333-333333333333";
const SEM: DadosConfig = { temReajuste: false, dataBase: null, periodicidadeMeses: 12, indiceDescricao: null };
const L09: DadosConfig = { temReajuste: true, dataBase: "2025-01-01", periodicidadeMeses: 12, indiceDescricao: "Índices FGV/DNIT do setor rodoviário" };

beforeEach(() => {
  salvarConfigReajuste.mockReset();
  refresh.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

function secao(): HTMLElement {
  return screen.getByRole("heading", { name: "Reajuste" }).closest("section")!;
}

function texto(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ");
}

describe("ConfigReajuste", () => {
  it("mostra tem reajuste, data-base, periodicidade, aniversário e índice", () => {
    render(<ConfigReajuste contratoId={CONTRATO} config={L09} podeEditar={false} />);
    const t = texto(secao());
    expect(t).toContain("Tem reajuste");
    expect(t).toContain("Sim");
    expect(t).toContain("01/2025");
    expect(t).toContain("12 meses");
    expect(t).toContain("01/2026");
    expect(t).toContain("Índices FGV/DNIT do setor rodoviário");
  });

  it("sem reajuste: Não, e os outros campos vazios", () => {
    render(<ConfigReajuste contratoId={CONTRATO} config={SEM} podeEditar={false} />);
    const t = texto(secao());
    expect(t).toContain("Não");
    expect(t).not.toContain("01/");
  });

  it("sem medicao.reajuste/editar não há botão Editar", () => {
    render(<ConfigReajuste contratoId={CONTRATO} config={L09} podeEditar={false} />);
    expect(within(secao()).queryByRole("button", { name: /Editar/ })).toBeNull();
  });

  it("gravar manda o mês da data-base, a periodicidade em número e o índice", async () => {
    salvarConfigReajuste.mockResolvedValue({ ok: true });
    render(<ConfigReajuste contratoId={CONTRATO} config={SEM} podeEditar />);
    fireEvent.click(within(secao()).getByRole("button", { name: /Editar/ }));

    fireEvent.click(screen.getByRole("switch", { name: "Tem reajuste" }));
    fireEvent.change(screen.getByLabelText(/Data-base/), { target: { value: "2025-01" } });
    fireEvent.change(screen.getByLabelText(/Periodicidade/), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/Índice/), { target: { value: "Índices FGV/DNIT do setor rodoviário" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar reajuste" }));

    await waitFor(() =>
      expect(salvarConfigReajuste).toHaveBeenCalledWith(CONTRATO, {
        temReajuste: true,
        dataBase: "2025-01",
        periodicidadeMeses: 12,
        indiceDescricao: "Índices FGV/DNIT do setor rodoviário",
      }),
    );
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("Reajuste do contrato salvo"));
    expect(refresh).toHaveBeenCalled();
  });

  it("abre com o que está gravado (data-base em mês e ano)", () => {
    render(<ConfigReajuste contratoId={CONTRATO} config={L09} podeEditar />);
    fireEvent.click(within(secao()).getByRole("button", { name: /Editar/ }));
    expect(screen.getByRole("switch", { name: "Tem reajuste" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText(/Data-base/) as HTMLInputElement).value).toBe("2025-01");
    expect((screen.getByLabelText(/Periodicidade/) as HTMLInputElement).value).toBe("12");
  });

  it("com reajuste e sem data-base não vai ao servidor", async () => {
    render(<ConfigReajuste contratoId={CONTRATO} config={SEM} podeEditar />);
    fireEvent.click(within(secao()).getByRole("button", { name: /Editar/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Tem reajuste" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar reajuste" }));
    expect(await screen.findByText("Informe o mês da data-base do reajuste")).toBeTruthy();
    expect(salvarConfigReajuste).not.toHaveBeenCalled();
  });

  it("erro do banco aparece como veio e o drawer fica aberto", async () => {
    salvarConfigReajuste.mockResolvedValue({ erro: "Sem permissão para configurar o reajuste" });
    render(<ConfigReajuste contratoId={CONTRATO} config={L09} podeEditar />);
    fireEvent.click(within(secao()).getByRole("button", { name: /Editar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar reajuste" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Sem permissão para configurar o reajuste"));
    expect(screen.getByRole("button", { name: "Salvar reajuste" })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
