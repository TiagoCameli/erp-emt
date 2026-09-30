import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Lista de Lançamentos: as colunas (data, item, quantidade, km/local, excesso, medição), o botão
 * "Lançar" só para quem tem `criar`, e editar/excluir só aparecem quando a permissão E a medição
 * do lançamento estão abertas — nunca um dos dois sozinho. `LancamentoDrawer`/`ExcluirLancamento`
 * são mockados: o comportamento deles é testado nos próprios arquivos.
 */

const refresh = vi.fn();
let searchParamsAtual = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  usePathname: () => "/medicao/lancamentos",
  useSearchParams: () => searchParamsAtual,
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

const drawerProps = vi.fn();
const excluirProps = vi.fn();
vi.mock("@/modules/medicao/lancamentos/components/lancamento-drawer", () => ({
  LancamentoDrawer: (props: { aberto: boolean; lancamento: { id: string } | null }) => {
    drawerProps(props);
    return props.aberto ? <div data-testid={`drawer-${props.lancamento?.id ?? "novo"}`} /> : null;
  },
}));
vi.mock("@/modules/medicao/lancamentos/components/excluir-lancamento", () => ({
  ExcluirLancamento: (props: { lancamento: { id: string } | null }) => {
    excluirProps(props);
    return props.lancamento ? <div data-testid={`excluir-${props.lancamento.id}`} /> : null;
  },
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { LancamentosTabela } from "@/modules/medicao/lancamentos/components/lancamentos-tabela";
import type { LancamentoLista } from "@/modules/medicao/lancamentos/tipos";

const CONTRATO = "33333333-3333-4333-8333-333333333333";

function lancamento(over: Partial<LancamentoLista> = {}): LancamentoLista {
  return {
    id: "l1",
    contratoId: CONTRATO,
    medicaoId: "m11",
    medicaoNumero: 11,
    medicaoStatus: "aberta",
    itemId: "44444444-4444-4444-8444-444444444444",
    codigo: "02.02",
    descricao: "Escavação",
    unidade: "m3",
    data: "2026-09-10",
    quantidade: "10.5",
    kmInicial: "100.250",
    kmFinal: "120.500",
    estaca: "E-10",
    localTexto: null,
    observacao: "Trecho seco",
    motivoExcesso: null,
    createdAt: "2026-09-10T12:00:00Z",
    createdBy: "u1",
    anexos: 2,
    ...over,
  };
}

beforeEach(() => {
  searchParamsAtual = new URLSearchParams();
  refresh.mockReset();
  drawerProps.mockReset();
  excluirProps.mockReset();
});
afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

function texto(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("LancamentosTabela", () => {
  it("mostra data, item, quantidade, km e medição da linha", () => {
    const { container } = render(
      <LancamentosTabela
        lancamentos={[lancamento()]}
        contratoId={CONTRATO}
        tipoLocalizacao="rodovia"
        servicos={[]}
        medicoesParaFiltro={[{ numero: 11, periodoInicio: "2026-09-01", periodoFim: "2026-09-30" }]}
        podeCriar={false}
        podeEditar={false}
        podeExcluir={false}
      />,
    );
    expect(texto(container.querySelector('tbody [data-coluna="item"]'))).toBe("02.02Escavação");
    expect(texto(container.querySelector('tbody [data-coluna="quantidade"]'))).toBe("10,5");
    expect(texto(container.querySelector('tbody [data-coluna="localizacao"]'))).toBe("100,25 a 120,5");
    expect(texto(container.querySelector('tbody [data-coluna="medicao"]'))).toBe("11ª");
  });

  it("motivo de excesso: ícone visível só quando o lançamento tem motivo", () => {
    const { container, rerender } = render(
      <LancamentosTabela
        lancamentos={[lancamento({ motivoExcesso: null })]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar={false}
        podeEditar={false}
        podeExcluir={false}
      />,
    );
    expect(container.querySelector('tbody [data-coluna="excesso"] svg')).toBeNull();

    rerender(
      <LancamentosTabela
        lancamentos={[lancamento({ motivoExcesso: "Chuva atrasou o cronograma" })]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar={false}
        podeEditar={false}
        podeExcluir={false}
      />,
    );
    expect(container.querySelector('tbody [data-coluna="excesso"] svg')).toBeTruthy();
  });

  it("sem podeCriar, o botão Lançar e o link para o celular não aparecem", () => {
    render(
      <LancamentosTabela
        lancamentos={[]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar={false}
        podeEditar={false}
        podeExcluir={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /Lançar/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Lançar pelo celular/ })).toBeNull();
  });

  it("com podeCriar, mostra o link para lançar pelo celular apontando para /m/medicao", () => {
    render(
      <LancamentosTabela
        lancamentos={[]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar
        podeEditar={false}
        podeExcluir={false}
      />,
    );
    const link = screen.getByRole("link", { name: /Lançar pelo celular/ });
    expect(link.getAttribute("href")).toBe("/m/medicao");
  });

  it("com podeCriar, clicar em Lançar abre o drawer de novo lançamento", () => {
    render(
      <LancamentosTabela
        lancamentos={[]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar
        podeEditar={false}
        podeExcluir={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));
    expect(screen.getByTestId("drawer-novo")).toBeTruthy();
  });

  it("medição aberta com permissão: o menu da linha mostra Editar e Excluir", () => {
    render(
      <LancamentosTabela
        lancamentos={[lancamento({ medicaoStatus: "aberta" })]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar={false}
        podeEditar
        podeExcluir
      />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Ações" }));
    expect(screen.getByText("Editar")).toBeTruthy();
    expect(screen.getByText("Excluir")).toBeTruthy();
  });

  it("medição aprovada (fechada): mesmo com permissão, o menu da linha abre vazio (sem Editar nem Excluir)", () => {
    render(
      <LancamentosTabela
        lancamentos={[lancamento({ medicaoStatus: "aprovada" })]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar={false}
        podeEditar
        podeExcluir
      />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Ações" }));
    expect(screen.queryByText("Editar")).toBeNull();
    expect(screen.queryByText("Excluir")).toBeNull();
  });

  it("sem permissão: mesmo com a medição aberta, sem Editar nem Excluir", () => {
    render(
      <LancamentosTabela
        lancamentos={[lancamento({ medicaoStatus: "aberta" })]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar={false}
        podeEditar={false}
        podeExcluir={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ações" })).toBeNull();
  });

  it("clicar em Editar abre o drawer com o lançamento da linha", () => {
    render(
      <LancamentosTabela
        lancamentos={[lancamento({ id: "l7" })]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar={false}
        podeEditar
        podeExcluir={false}
      />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByText("Editar"));
    expect(screen.getByTestId("drawer-l7")).toBeTruthy();
  });

  it("clicar em Excluir abre o diálogo com o lançamento da linha", () => {
    render(
      <LancamentosTabela
        lancamentos={[lancamento({ id: "l9" })]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar={false}
        podeEditar={false}
        podeExcluir
      />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Ações" }));
    fireEvent.click(screen.getByText("Excluir"));
    expect(screen.getByTestId("excluir-l9")).toBeTruthy();
  });

  it("nenhum lançamento: estado vazio", () => {
    render(
      <LancamentosTabela
        lancamentos={[]}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[]}
        medicoesParaFiltro={[]}
        podeCriar={false}
        podeEditar={false}
        podeExcluir={false}
      />,
    );
    expect(screen.getByText("Nenhum lançamento")).toBeTruthy();
  });
});
