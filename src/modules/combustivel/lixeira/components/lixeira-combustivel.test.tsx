import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
  usePathname: () => "/combustivel/lixeira",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/combustivel/abastecimentos/actions", () => ({
  restaurarAbastecimento: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/modules/combustivel/entradas/actions", () => ({
  restaurarEntrada: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/modules/combustivel/transferencias/actions", () => ({
  restaurarTransferencia: vi.fn(async () => ({ erro: "Saldo do tanque ficaria negativo" })),
}));
vi.mock("@/modules/combustivel/esvaziamentos/actions", () => ({
  restaurarEsvaziamento: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { toast } from "@/components/canonicos/toast";
import { restaurarAbastecimento } from "@/modules/combustivel/abastecimentos/actions";
import { restaurarEntrada } from "@/modules/combustivel/entradas/actions";
import { restaurarEsvaziamento } from "@/modules/combustivel/esvaziamentos/actions";
import { LixeiraCombustivel } from "@/modules/combustivel/lixeira/components/lixeira-combustivel";
import type { ItemLixeira } from "@/modules/combustivel/lixeira/montar";
import type { PermissoesLixeira, TipoLixeira } from "@/modules/combustivel/lixeira/permissoes";
import { restaurarTransferencia } from "@/modules/combustivel/transferencias/actions";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function item(tipo: TipoLixeira, id: string, titulo: string): ItemLixeira {
  return {
    tipo,
    id,
    titulo,
    subtitulo: "23/09/2026 07:05 · Tanque Base",
    motivo: "lançado em dobro",
    excluidoEm: "2026-09-23T15:00:00Z",
    excluidoPor: "Tiago",
  };
}

const ITENS: Record<TipoLixeira, ItemLixeira[]> = {
  saida: [item("saida", "s1", "100,00 L saída")],
  entrada: [item("entrada", "e1", "5.000,00 L entrada")],
  transferencia: [item("transferencia", "t1", "300,00 L transferência")],
  esvaziamento: [item("esvaziamento", "v1", "20,00 L esvaziamento")],
};

function permissoes(parcial: Partial<PermissoesLixeira>): PermissoesLixeira {
  const nada = { ver: false, restaurar: false };
  return { saida: nada, entrada: nada, transferencia: nada, esvaziamento: nada, ...parcial };
}

function abrirSecao(nome: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: nome }));
}

async function restaurarItem(titulo: string) {
  const linha = screen.getByText(titulo).closest("li")!;
  fireEvent.click(within(linha).getByRole("button", { name: /restaurar/i }));
  const dialogo = await screen.findByRole("dialog");
  fireEvent.click(within(dialogo).getByRole("button", { name: /^restaurar$/i }));
}

describe("Lixeira do Combustível", () => {
  it("só mostra as seções que a pessoa pode ver", () => {
    render(<LixeiraCombustivel itens={ITENS} permissoes={permissoes({ saida: { ver: true, restaurar: false } })} />);
    expect(screen.getByRole("button", { name: /saídas excluídas/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /entradas excluídas/i })).not.toBeInTheDocument();
    expect(screen.queryByText("5.000,00 L entrada")).not.toBeInTheDocument();
  });

  it("mostra quem excluiu, quando e o motivo; sem restaurar, não há botão", () => {
    render(<LixeiraCombustivel itens={ITENS} permissoes={permissoes({ saida: { ver: true, restaurar: false } })} />);
    // Saídas abre sozinha, como na origem.
    expect(screen.getByText("100,00 L saída")).toBeInTheDocument();
    expect(screen.getByText("Excluído por Tiago em 23/09/2026 10:00")).toBeInTheDocument();
    expect(screen.getByText("Motivo: lançado em dobro")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^restaurar$/i })).not.toBeInTheDocument();
  });

  it("o Restaurar de cada seção chama a action do próprio módulo, com o id", async () => {
    const todas = { ver: true, restaurar: true };
    render(
      <LixeiraCombustivel
        itens={ITENS}
        permissoes={permissoes({ saida: todas, entrada: todas, transferencia: todas, esvaziamento: todas })}
      />,
    );

    await restaurarItem("100,00 L saída");
    await waitFor(() => expect(restaurarAbastecimento).toHaveBeenCalledWith("s1"));

    abrirSecao(/entradas excluídas/i);
    await restaurarItem("5.000,00 L entrada");
    await waitFor(() => expect(restaurarEntrada).toHaveBeenCalledWith("e1"));

    abrirSecao(/esvaziamentos excluídos/i);
    await restaurarItem("20,00 L esvaziamento");
    await waitFor(() => expect(restaurarEsvaziamento).toHaveBeenCalledWith("v1"));

    expect(restaurarTransferencia).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledTimes(3);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("a recusa do banco vai para a tela e a lista não é recarregada", async () => {
    render(
      <LixeiraCombustivel itens={ITENS} permissoes={permissoes({ transferencia: { ver: true, restaurar: true } })} />,
    );
    abrirSecao(/transferências excluídas/i);
    await restaurarItem("300,00 L transferência");
    await waitFor(() => expect(restaurarTransferencia).toHaveBeenCalledWith("t1"));
    expect(toast.error).toHaveBeenCalledWith("Saldo do tanque ficaria negativo");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("restaurar na seção que não pode: sem botão, mesmo com outra seção liberada", () => {
    render(
      <LixeiraCombustivel
        itens={ITENS}
        permissoes={permissoes({ saida: { ver: true, restaurar: true }, entrada: { ver: true, restaurar: false } })}
      />,
    );
    abrirSecao(/entradas excluídas/i);
    const linhaEntrada = screen.getByText("5.000,00 L entrada").closest("li")!;
    expect(within(linhaEntrada).queryByRole("button", { name: /restaurar/i })).not.toBeInTheDocument();
    const linhaSaida = screen.getByText("100,00 L saída").closest("li")!;
    expect(within(linhaSaida).getByRole("button", { name: /restaurar/i })).toBeInTheDocument();
  });

  it("vazia: o estado vazio da origem", () => {
    render(
      <LixeiraCombustivel
        itens={{ saida: [], entrada: [], transferencia: [], esvaziamento: [] }}
        permissoes={permissoes({ saida: { ver: true, restaurar: true } })}
      />,
    );
    expect(screen.getByText("Lixeira vazia")).toBeInTheDocument();
  });
});
