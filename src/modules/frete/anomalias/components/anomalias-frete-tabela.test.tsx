import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { AnomaliaFreteLista } from "@/modules/frete/anomalias/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/frete/anomalias",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));
vi.mock("@/modules/frete/anomalias/actions", () => ({ conferirAnomaliaFrete: vi.fn(async () => ({ ok: true })) }));

import { AnomaliasFreteTabela, type AnomaliasFreteTabelaProps } from "./anomalias-frete-tabela";

afterEach(() => cleanup());

const FRETE = "c4e0f922-3aec-4c72-8089-225523e04557";

function f2(over: Partial<AnomaliaFreteLista> = {}): AnomaliaFreteLista {
  return {
    id: `F2-${FRETE}`,
    severity: "warning",
    detector: "F2",
    title: "BGS transportado sem pedido (Britam)",
    description: "Nota 1: não há pedido de BGS cadastrado para Britam.",
    affectedFreteIds: [FRETE],
    data: "2026-09-10",
    acaoSugerida: "Cadastrar o pedido de material correspondente, ou conferir a origem do frete.",
    rotuloDetector: "Frete de material sem pedido",
    conferencia: null,
    fretes: [],
    ...over,
  };
}

function montar(props: Partial<AnomaliasFreteTabelaProps>) {
  return render(
    <AnomaliasFreteTabela
      anomalias={[f2()]}
      situacao="pendentes"
      severidade=""
      regra=""
      de=""
      ate=""
      podeEditar={false}
      veFretes={false}
      {...props}
    />,
  );
}

describe("AnomaliasFreteTabela", () => {
  it("sem frete.anomalias/editar não mostra o botão de conferir; com, mostra", () => {
    montar({ podeEditar: false });
    expect(screen.getByText("BGS transportado sem pedido (Britam)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar como conferida" })).toBeNull();
    cleanup();
    montar({ podeEditar: true });
    expect(screen.getByRole("button", { name: "Marcar como conferida" })).toBeTruthy();
  });

  it("link do frete só para quem vê fretes", () => {
    montar({ veFretes: false });
    expect(screen.queryByRole("link", { name: "Abrir frete" })).toBeNull();
    cleanup();
    montar({ veFretes: true });
    expect(screen.getByRole("link", { name: "Abrir frete" }).getAttribute("href")).toBe(`/frete/fretes/${FRETE}`);
  });

  it("período recorta pela data da anomalia; conferida sai das pendentes", () => {
    montar({ de: "2026-09-11" });
    expect(screen.queryByText("BGS transportado sem pedido (Britam)")).toBeNull();
    cleanup();
    montar({ anomalias: [f2({ conferencia: { motivo: null, conferidoEm: "2026-09-12T12:00:00Z" } })] });
    expect(screen.queryByText("BGS transportado sem pedido (Britam)")).toBeNull();
    cleanup();
    montar({ situacao: "conferidas", anomalias: [f2({ conferencia: { motivo: null, conferidoEm: "2026-09-12T12:00:00Z" } })] });
    expect(screen.getByText("BGS transportado sem pedido (Britam)")).toBeTruthy();
  });
});
