import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/financeiro/relatorios/rateio-indireto-actions", () => ({
  salvarRateioIndireto: vi.fn(async () => ({ ok: true })),
  voltarRateioAutomatico: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RateioIndiretoTabela } from "@/modules/financeiro/relatorios/components/rateio-indireto-tabela";
import type { RateioDoMes } from "@/modules/financeiro/relatorios/rateio-indireto";

afterEach(cleanup);

const BR = "11111111-1111-4111-8111-111111111111";
const ESCOLA = "22222222-2222-4222-8222-222222222222";

const rateio = (extra: Partial<RateioDoMes> = {}): RateioDoMes => ({
  mes: "2026-04",
  status: "automatico",
  custoIndiretoMes: 1000,
  naoRateado: 0,
  linhas: [
    { centroId: BR, centro: "009 - BR-364", custoDireto: 9000, pctSugerido: 90, pctVigente: 90, indireto: 900, semCusto: false },
    { centroId: ESCOLA, centro: "012 - Escola", custoDireto: 1000, pctSugerido: 10, pctVigente: 10, indireto: 100, semCusto: false },
  ],
  ...extra,
});

const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");

describe("RateioIndiretoTabela", () => {
  it("mostra o status e o indireto de cada obra", () => {
    render(<RateioIndiretoTabela rateio={rateio()} podeAjustar />);
    expect(screen.getByText("Automático (pelo custo direto)")).toBeTruthy();
    expect(texto(screen.getByRole("row", { name: /009 - BR-364/ }))).toContain("R$ 900,00");
  });

  it("soma diferente de 100% bloqueia salvar e diz quanto falta", () => {
    render(<RateioIndiretoTabela rateio={rateio()} podeAjustar />);
    fireEvent.change(screen.getByLabelText("Percentual de 009 - BR-364"), { target: { value: "80" } });
    expect(screen.getByText(/Faltam 10/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salvar ajuste" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sem permissão não mostra campo nem botões", () => {
    render(<RateioIndiretoTabela rateio={rateio()} podeAjustar={false} />);
    expect(screen.queryByLabelText("Percentual de 009 - BR-364")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar ajuste" })).toBeNull();
  });

  it("mostra o que não foi rateado quando existe", () => {
    render(<RateioIndiretoTabela rateio={rateio({ naoRateado: 250 })} podeAjustar />);
    expect(texto(screen.getByRole("row", { name: /Não rateado/ }))).toContain("R$ 250,00");
  });
});
