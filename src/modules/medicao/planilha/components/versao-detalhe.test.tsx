import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Detalhe da versão: a casa escondida aparece inteira (o texto do numeric, sem passar por
 * Number), a faixa de "sem regra" e as ações só com a permissão e o status certos.
 */

const estado = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const aprovarVersao = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: estado.push, refresh: estado.refresh, replace: vi.fn() }),
  usePathname: () => "/medicao/planilha/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/medicao/planilha/actions", () => ({
  aprovarVersao: (...a: unknown[]) => aprovarVersao(...a),
  desaprovarVersao: vi.fn(),
  excluirVersao: vi.fn(),
}));
vi.mock("@/modules/_shared/anexos/actions", () => ({ urlDoAnexo: vi.fn() }));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { VersaoDetalhe } from "@/modules/medicao/planilha/components/versao-detalhe";
import type { VersaoCarregada } from "@/modules/medicao/planilha/queries";

const V = "33333333-3333-4333-8333-333333333333";

function dados(over: { status?: string; regra?: string | null; contratoExcluido?: boolean } = {}): VersaoCarregada {
  return {
    versao: {
      id: V, contratoId: "c", numero: 0, status: over.status ?? "rascunho", vigenteDesde: "2025-10-01", aditivoNumero: null,
      arquivoNome: "planilha.xlsx", arquivoHash: "abc", motivo: null, motivoDesaprovacao: null, aprovadaEm: null,
      excluidoEm: null, motivoExclusao: null,
    },
    contrato: { id: "c", codigo: "L09", nomeObra: "BR-364 Lote 09", regraArredondamento: over.regra === undefined ? "sem_arredondar" : over.regra,
      excluidoEm: over.contratoExcluido ? "2026-01-01T00:00:00Z" : null },
    linhas: [
      { id: "1", ordem: 1, codigo: "02.07", paiId: null, nivel: 1, descricao: "Pavimentação", unidade: null, tipo: "titulo",
        precoUnitario: null, quantidadePrevista: null, valorPrevisto: 9908218.84 },
      { id: "2", ordem: 2, codigo: "02.07.04", paiId: "1", nivel: 2, descricao: "CBUQ", unidade: "t", tipo: "servico",
        precoUnitario: "580.86429960000000001", quantidadePrevista: "17057.717", valorPrevisto: 9908218.84 },
    ],
    totalPrevisto: 9908218.84,
  };
}

const props = { xlsx: null, podeCriar: true, podeAprovar: true, podeDesaprovar: true, podeExcluir: true };

afterEach(cleanup);

describe("VersaoDetalhe", () => {
  it("mostra o preço com todas as casas do banco", () => {
    render(<VersaoDetalhe dados={dados()} {...props} />);
    expect(screen.getByText("580,86429960000000001")).toBeTruthy();
    expect(screen.getByText("17.057,717")).toBeTruthy();
  });

  it("sem regra de arredondamento avisa no topo", () => {
    render(<VersaoDetalhe dados={dados({ regra: null })} {...props} />);
    expect(screen.getByText(/ainda não tem regra de arredondamento/)).toBeTruthy();
  });

  it("rascunho oferece tornar vigente e chama a action", async () => {
    aprovarVersao.mockResolvedValue({ ok: true });
    render(<VersaoDetalhe dados={dados()} {...props} />);
    expect(screen.queryByRole("button", { name: /Voltar a rascunho/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tornar vigente/ }));
    const botoes = await screen.findAllByRole("button", { name: /Tornar vigente/ });
    fireEvent.click(botoes[botoes.length - 1]);
    await waitFor(() => expect(aprovarVersao).toHaveBeenCalledWith(V));
  });

  it("vigente não tem importar nem excluir; sem desaprovar não tem voltar", () => {
    render(<VersaoDetalhe dados={dados({ status: "vigente" })} {...props} podeDesaprovar={false} />);
    expect(screen.queryByRole("link", { name: /Reimportar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir rascunho/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Voltar a rascunho/ })).toBeNull();
  });

  it("contrato na lixeira: rascunho sem importar, aprovar nem excluir, e com o aviso", () => {
    render(<VersaoDetalhe dados={dados({ contratoExcluido: true })} {...props} />);
    expect(screen.queryByRole("link", { name: /Reimportar|Importar planilha/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tornar vigente/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir rascunho/ })).toBeNull();
    expect(screen.getByText(/O contrato desta versão está na lixeira/)).toBeTruthy();
  });

  it("contrato na lixeira: vigente sem voltar a rascunho", () => {
    render(<VersaoDetalhe dados={dados({ status: "vigente", contratoExcluido: true })} {...props} />);
    expect(screen.queryByRole("button", { name: /Voltar a rascunho/ })).toBeNull();
  });
});
