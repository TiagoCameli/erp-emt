import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Detalhe da medição: cabeçalho (Nª, período, selo, versão, revisão corrente, valor), os passos que
 * o servidor liberou, o botão de Lançamentos para quem pode, a tabela de itens, as revisões e a trilha
 * com os eventos traduzidos.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/medicoes/m1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));
vi.mock("@/modules/medicao/medicoes/ciclo-actions", () => ({
  fecharMedicao: vi.fn(),
  reabrirMedicao: vi.fn(),
  enviarMedicao: vi.fn(),
  novaRevisao: vi.fn(),
  revisarAprovada: vi.fn(),
  lancarAjuste: vi.fn(),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { MedicaoDetalhe } from "@/modules/medicao/medicoes/components/medicao-detalhe";
import type { MedicaoDetalhe as MedicaoDetalheDados } from "@/modules/medicao/medicoes/tipos";

afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);

const REV0 = { id: "r0", numero: 0, fase: "antes_aprovacao", status: "substituida", motivo: null, criadoEm: "2026-02-01T10:00:00Z" };
const REV1 = { id: "r1", numero: 1, fase: "antes_aprovacao", status: "em_aberto", motivo: "DNIT devolveu", criadoEm: "2026-03-05T10:00:00Z" };

function medicao(over: Partial<MedicaoDetalheDados> = {}): MedicaoDetalheDados {
  return {
    id: "m1",
    contratoId: "c1",
    contratoCodigo: "K5",
    contratoNome: "Obra teste",
    numero: 2,
    periodoInicio: "2026-02-01",
    periodoFim: "2026-02-28",
    status: "em_conferencia",
    versaoNumero: 1,
    valor: "70.00",
    revisoes: [REV0, REV1],
    revisaoCorrente: REV1,
    itens: [],
    servicos: [],
    eventos: [
      { id: "e1", evento: "abrir", deStatus: null, paraStatus: "aberta", motivo: null, criadoEm: "2026-02-01T10:00:00Z", usuarioNome: "Tiago" },
      {
        id: "e2",
        evento: "versao",
        deStatus: null,
        paraStatus: null,
        motivo: "Passou da planilha v0 para a v1, vigente em 28/02/2026 (fim do período)",
        criadoEm: "2026-03-01T10:00:00Z",
        usuarioNome: "Tiago",
      },
    ],
    ...over,
  };
}

describe("MedicaoDetalhe", () => {
  it("cabeçalho com Nª, contrato, período, selo, versão, revisão corrente e valor", () => {
    render(<MedicaoDetalhe medicao={medicao()} passos={[]} podeVerLancamentos={false} />);
    expect(screen.getByRole("heading", { level: 1, name: "2ª medição" })).toBeTruthy();
    expect(screen.getByText(/K5 · Obra teste/)).toBeTruthy();
    expect(screen.getAllByText("01/02 a 28/02/2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Em conferência").length).toBeGreaterThan(0);
    expect(screen.getByText("v1")).toBeTruthy();
    expect(screen.getByText("REV01 · Em aberto")).toBeTruthy();
    expect(screen.getAllByText("R$ 70,00").length).toBeGreaterThan(0);
  });

  it("aprovada sem revisão pendente: diz que não há revisão em curso", () => {
    render(
      <MedicaoDetalhe
        medicao={medicao({ status: "aprovada", revisaoCorrente: null, revisoes: [{ ...REV1, status: "aprovada" }] })}
        passos={[]}
        podeVerLancamentos={false}
      />,
    );
    expect(screen.getByText("Nenhuma em curso")).toBeTruthy();
  });

  it("mostra os passos liberados pelo servidor", () => {
    render(<MedicaoDetalhe medicao={medicao()} passos={["reabrir", "ajuste", "enviar"]} podeVerLancamentos={false} />);
    expect(screen.getByRole("button", { name: "Enviar REV01" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lançar ajuste" })).toBeTruthy();
  });

  it("Lançamentos é botão do detalhe, só para quem pode ver", () => {
    const { unmount } = render(<MedicaoDetalhe medicao={medicao()} passos={[]} podeVerLancamentos />);
    expect(screen.getByRole("link", { name: /Lançamentos/ }).getAttribute("href")).toBe("/medicao/lancamentos?contrato=c1&medicao=2");
    unmount();
    render(<MedicaoDetalhe medicao={medicao()} passos={[]} podeVerLancamentos={false} />);
    expect(screen.queryByRole("link", { name: /Lançamentos/ })).toBeNull();
  });

  it("revisões com número, fase, status e motivo", () => {
    render(<MedicaoDetalhe medicao={medicao()} passos={[]} podeVerLancamentos={false} />);
    expect(screen.getByText("REV00")).toBeTruthy();
    expect(screen.getByText("Substituída")).toBeTruthy();
    expect(screen.getByText("DNIT devolveu")).toBeTruthy();
  });

  it("trilha traduz os eventos", () => {
    render(<MedicaoDetalhe medicao={medicao()} passos={[]} podeVerLancamentos={false} />);
    expect(screen.getByText("Medição aberta")).toBeTruthy();
    expect(screen.getByText("Planilha da medição trocada")).toBeTruthy();
    expect(screen.getByText("Passou da planilha v0 para a v1, vigente em 28/02/2026 (fim do período)")).toBeTruthy();
  });
});
