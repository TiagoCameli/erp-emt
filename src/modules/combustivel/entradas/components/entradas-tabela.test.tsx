import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { formatarBRL } from "@/lib/formatadores";
import type { EntradaLinha } from "@/modules/combustivel/entradas/queries";

/**
 * A lista de Entradas como a EntradaListV2 da origem: faixa de resumo do filtro, recorte da
 * URL, drawer de detalhe no clique e `?novo=1` do "+ Nova Entrada" do topo.
 */

const navegacao = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: navegacao.replace }),
  usePathname: () => "/combustivel/entradas",
  useSearchParams: () => navegacao.params,
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/combustivel/entradas/actions", () => ({
  salvarEntrada: vi.fn(),
  excluirEntrada: vi.fn(),
  restaurarEntrada: vi.fn(),
}));

vi.mock("@/modules/combustivel/entradas/components/entrada-form-drawer", () => ({
  EntradaFormDrawer: ({ aberto, entrada }: { aberto: boolean; entrada: unknown }) =>
    aberto ? <div role="dialog">{entrada ? "Editar entrada" : "Nova entrada"}</div> : null,
}));

import { EntradasTabela } from "@/modules/combustivel/entradas/components/entradas-tabela";

beforeEach(() => {
  navegacao.params = new URLSearchParams();
  navegacao.replace.mockReset();
  sessionStorage.clear();
});
afterEach(cleanup);

const TANQUE = "11111111-1111-4111-8111-111111111111";
const OUTRO = "44444444-4444-4444-8444-444444444444";

function entrada(troca: Partial<EntradaLinha> = {}): EntradaLinha {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    dataHora: "2026-09-20T19:30:00Z",
    tanqueId: TANQUE,
    tanqueNome: "Tanque Canteiro",
    insumoId: "22222222-2222-4222-8222-222222222222",
    insumoNome: "Diesel S10",
    unidade: "L",
    quantidade: 1000,
    litros: 1000,
    valorTotal: 6394.7,
    precoLitro: 6.3947,
    fornecedorId: null,
    fornecedorNome: "Posto Progresso",
    notaFiscal: "4455",
    observacoes: null,
    origem: "manual",
    excluidoEm: null,
    motivoExclusao: null,
    ...troca,
  };
}

const SEM_RECORTE = { de: "", ate: "", tanqueIds: [], insumoIds: [], fornecedorIds: [] };

function montar(props: Partial<React.ComponentProps<typeof EntradasTabela>> = {}) {
  return render(
    <EntradasTabela
      entradas={[entrada(), entrada({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tanqueId: OUTRO, tanqueNome: "Comboio", litros: 500.5, valorTotal: 3200 })]}
      filtrosUrl={SEM_RECORTE}
      tanquesFiltro={[]}
      tanquesEdicao={[]}
      insumos={[]}
      fornecedores={[]}
      podeCriar
      podeEditar
      podeExcluir
      {...props}
    />,
  );
}

describe("EntradasTabela", () => {
  it("a faixa soma o que o filtro acha", () => {
    montar();
    const faixa = screen.getByTestId("faixa-resumo");
    expect(faixa.textContent).toContain("2 entradas");
    expect(faixa.textContent).toContain("1.500,50 L");
    expect(faixa.textContent).toContain(formatarBRL(9594.7));
  });

  it("o recorte da URL filtra a lista e a faixa junto", () => {
    montar({ filtrosUrl: { ...SEM_RECORTE, tanqueIds: [OUTRO] } });
    expect(screen.queryByText("Tanque Canteiro")).not.toBeInTheDocument();
    expect(screen.getByTestId("faixa-resumo").textContent).toContain("1 entrada");
  });

  it("litros com + como na origem, e combustível em badge", () => {
    montar();
    const linha = screen.getByText("Tanque Canteiro").closest("tr")!;
    expect(within(linha).getByText("+1.000,00 L")).toBeInTheDocument();
    expect(within(linha).getByText("Diesel S10")).toBeInTheDocument();
    expect(within(linha).getByText("20/09/26 14:30")).toBeInTheDocument();
  });

  it("clique na linha abre o detalhe com R$/L de 4 casas", () => {
    montar();
    fireEvent.click(screen.getByText("Tanque Canteiro"));
    expect(screen.getByText("Entrada de combustível")).toBeInTheDocument();
    expect(screen.getByText("Nota fiscal")).toBeInTheDocument();
  });

  it("?novo=1 abre o formulário de nova entrada e sai da URL", () => {
    navegacao.params = new URLSearchParams("novo=1&tanque=" + TANQUE);
    montar();
    expect(screen.getByRole("dialog")).toHaveTextContent("Nova entrada");
    expect(navegacao.replace).toHaveBeenCalledWith(`/combustivel/entradas?tanque=${TANQUE}`, { scroll: false });
  });

  it("?detalhe=<id> (link do detalhe do tanque) abre o detalhe daquela entrada e sai da URL", () => {
    navegacao.params = new URLSearchParams("detalhe=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    montar();
    expect(screen.getByText("Entrada de combustível")).toBeInTheDocument();
    expect(navegacao.replace).toHaveBeenCalledWith("/combustivel/entradas", { scroll: false });
  });

  it("?detalhe= de id que não está na lista não abre nada, só sai da URL", () => {
    navegacao.params = new URLSearchParams("detalhe=99999999-9999-4999-8999-999999999999");
    montar();
    expect(screen.queryByText("Entrada de combustível")).not.toBeInTheDocument();
    expect(navegacao.replace).toHaveBeenCalledWith("/combustivel/entradas", { scroll: false });
  });

  it("linha de controle: sem ?novo=1 o formulário não abre", () => {
    montar();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(navegacao.replace).not.toHaveBeenCalled();
  });

  it("sem editar nem excluir, a linha não tem menu (como a origem)", () => {
    montar({ podeEditar: false, podeExcluir: false });
    expect(screen.queryByRole("button", { name: /ações/i })).not.toBeInTheDocument();
  });
});
