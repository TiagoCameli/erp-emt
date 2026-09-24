import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AjusteDetalheView } from "@/modules/frete/ajustes/components/ajuste-detalhe";
import type { AjusteLista } from "@/modules/frete/ajustes/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/frete/ajustes/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/frete/ajustes/actions", () => ({
  aprovarAjuste: vi.fn(),
  rejeitarAjuste: vi.fn(),
  desaprovarAjuste: vi.fn(),
  salvarAjuste: vi.fn(),
}));

afterEach(cleanup);

function ajuste(status: string): AjusteLista {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    transportadoraId: "11111111-1111-4111-8111-111111111111",
    transportadoraNome: "Areacre",
    sinal: "credito",
    valor: 1000.1234,
    data: "2026-09-23T17:00:00Z",
    mesReferencia: "2026-09-01",
    centroCustoId: null,
    obraNome: null,
    descricao: "Diferença de preço",
    status,
    motivoStatus: null,
    origem: "manual",
    createdAt: "2026-09-23T17:00:00Z",
    criadoPorNome: "Ana",
    aprovadoEm: null,
    aprovadoPorNome: null,
    updatedAt: "2026-09-23T17:00:00Z",
    atualizadoPorNome: null,
  };
}

const TUDO = { criar: true, aprovar: true, desaprovar: true };
const NADA = { criar: false, aprovar: false, desaprovar: false };

function montar(status: string, permissoes = TUDO) {
  render(<AjusteDetalheView ajuste={ajuste(status)} permissoes={permissoes} trilha={[]} transportadoras={[]} obras={[]} />);
}

const botao = (nome: string) => screen.queryByRole("button", { name: nome });

describe("detalhe do ajuste: barra de aprovação por status e permissão", () => {
  it("pendente com tudo: editar, rejeitar e aprovar; avisa que não entra no saldo", () => {
    montar("pendente_aprovacao");
    expect(botao("Aprovar")).toBeInTheDocument();
    expect(botao("Rejeitar")).toBeInTheDocument();
    expect(botao("Editar ajuste")).toBeInTheDocument();
    expect(botao("Desaprovar")).not.toBeInTheDocument();
    expect(screen.getByText(/ainda não entra no saldo/)).toBeInTheDocument();
    expect(screen.getByText("R$ 1.000,1234")).toBeInTheDocument();
  });

  it("pendente sem permissão: nenhum botão de fluxo", () => {
    montar("pendente_aprovacao", NADA);
    expect(botao("Aprovar")).not.toBeInTheDocument();
    expect(botao("Rejeitar")).not.toBeInTheDocument();
    expect(botao("Editar ajuste")).not.toBeInTheDocument();
  });

  it("aprovado: só desaprovar, e só com a permissão", () => {
    montar("aprovado");
    expect(botao("Desaprovar")).toBeInTheDocument();
    expect(botao("Aprovar")).not.toBeInTheDocument();
    expect(botao("Editar ajuste")).not.toBeInTheDocument();
    cleanup();
    montar("aprovado", { ...TUDO, desaprovar: false });
    expect(botao("Desaprovar")).not.toBeInTheDocument();
  });

  it("rejeitado: nada a fazer, e avisa que não entra no saldo", () => {
    montar("rejeitado");
    expect(botao("Aprovar")).not.toBeInTheDocument();
    expect(botao("Desaprovar")).not.toBeInTheDocument();
    expect(screen.getByText(/Rejeitado: este ajuste não entra no saldo/)).toBeInTheDocument();
  });
});
