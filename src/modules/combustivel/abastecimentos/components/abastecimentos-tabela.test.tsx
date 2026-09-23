import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { formatarBRL } from "@/lib/formatadores";
import { lerFiltrosAbastecimentos } from "@/modules/combustivel/abastecimentos/filtros";
import type { SaidaLista } from "@/modules/combustivel/abastecimentos/queries";

/**
 * A lista de Saídas como a SaidaCombustivelListV2 da origem: sub-abas com contagem, a faixa
 * de resumo do FILTRO (não da página) e o `?novo=1` do "+ Nova Saída" do topo, que abre o
 * formulário e sai da URL.
 */

const navegacao = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: navegacao.refresh, replace: navegacao.replace }),
  usePathname: () => "/combustivel/abastecimentos",
  useSearchParams: () => navegacao.params,
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/combustivel/abastecimentos/actions", () => ({
  excluirAbastecimento: vi.fn(),
  restaurarAbastecimento: vi.fn(),
}));

vi.mock("@/modules/combustivel/abastecimentos/detalhe-actions", () => ({
  // Nunca volta: o drawer fica no "Carregando", que é o que o teste quer ver.
  carregarAbastecimento: vi.fn(() => new Promise(() => {})),
}));

// O formulário tem teste próprio; aqui só importa se abriu.
vi.mock("@/modules/combustivel/abastecimentos/components/abastecimento-form-drawer", () => ({
  AbastecimentoFormDrawer: ({ aberto, abastecimento }: { aberto: boolean; abastecimento: unknown }) =>
    aberto ? <div role="dialog">{abastecimento ? "Editar abastecimento" : "Novo abastecimento"}</div> : null,
}));

import { AbastecimentosTabela } from "@/modules/combustivel/abastecimentos/components/abastecimentos-tabela";

beforeEach(() => {
  navegacao.params = new URLSearchParams();
  navegacao.replace.mockReset();
});
afterEach(cleanup);

function saida(troca: Partial<SaidaLista> = {}): SaidaLista {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    data: "2026-09-20T19:30:00Z",
    origem: "tanque",
    tipoConsumidor: "equipamento_proprio",
    consumidor: "EQ-01 Escavadeira 320",
    equipamentoCodigo: "EQ-01",
    equipamentoDescricao: "Escavadeira 320",
    equipamentoSentinela: false,
    transportadoraNome: null,
    placa: null,
    motorista: null,
    obraNome: "009 - BR-364/AC",
    tanqueNome: "Tanque 1",
    tanqueExterno: false,
    insumoNome: "Diesel S10",
    litros: 150,
    precoUnitario: 6.3947,
    valorTotal: 959.21,
    canal: "computador",
    observacoes: null,
    excluidoEm: null,
    motivoExclusao: null,
    ...troca,
  };
}

const OPCOES_FILTRO = { tanques: [], equipamentos: [], transportadoras: [], obras: [], combustiveis: [] };
const OPCOES_FORM = { tanques: [], equipamentos: [], transportadoras: [], insumos: [], obras: [] };

function montar(props: Partial<React.ComponentProps<typeof AbastecimentosTabela>> = {}) {
  return render(
    <AbastecimentosTabela
      abastecimentos={[saida()]}
      total={115}
      litrosDoFiltro={12784.1}
      valorDoFiltro={85087.6}
      contagens={{ todas: 115, internas: 90, externas: 25 }}
      filtros={lerFiltrosAbastecimentos({})}
      podeCriar
      podeEditar
      podeExcluir
      opcoesFormulario={OPCOES_FORM}
      opcoesFiltro={OPCOES_FILTRO}
      {...props}
    />,
  );
}

describe("AbastecimentosTabela", () => {
  it("a faixa de resumo mostra o total do FILTRO, não o da página", () => {
    montar();
    const faixa = screen.getByTestId("faixa-resumo");
    // Uma linha na página, 115 no filtro: o resumo é o do servidor.
    expect(faixa.textContent).toContain("115 saídas");
    expect(faixa.textContent).toContain("12.784,10 L");
    expect(faixa.textContent).toContain(formatarBRL(85087.6));
  });

  it("sem nenhuma saída, a faixa some", () => {
    montar({ abastecimentos: [], total: 0, litrosDoFiltro: 0, valorDoFiltro: 0 });
    expect(screen.queryByTestId("faixa-resumo")).not.toBeInTheDocument();
  });

  it("sub-abas com a contagem de cada uma", () => {
    montar();
    expect(screen.getByRole("tab", { name: /Todas \(115\)/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Internas \(90\)/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Externas \(25\)/ })).toBeInTheDocument();
  });

  it("colunas da origem: data curta, COD — Nome, obra e combustível", () => {
    montar();
    const linha = screen.getByText("EQ-01 — Escavadeira 320").closest("tr")!;
    expect(within(linha).getByText("20/09/26 14:30")).toBeInTheDocument();
    expect(within(linha).getByText("009 - BR-364/AC")).toBeInTheDocument();
    expect(within(linha).getByText("Diesel S10")).toBeInTheDocument();
    expect(within(linha).getByText("150,00 L")).toBeInTheDocument();
  });

  it("carreta: transportadora · placa", () => {
    montar({
      abastecimentos: [
        saida({
          tipoConsumidor: "carreta_transportadora",
          transportadoraNome: "Transterra",
          placa: "ABC1D23",
          equipamentoCodigo: null,
          equipamentoDescricao: null,
        }),
      ],
      filtros: lerFiltrosAbastecimentos({ modo: "carretas" }),
    });
    expect(screen.getByText("Transterra")).toBeInTheDocument();
    expect(screen.getByText(/· ABC1D23/)).toBeInTheDocument();
  });

  it("clique na linha abre o drawer de detalhe", () => {
    montar();
    fireEvent.click(screen.getByText("EQ-01 — Escavadeira 320"));
    expect(screen.getByText("Saída de combustível")).toBeInTheDocument();
    expect(screen.getByText("Carregando o detalhe")).toBeInTheDocument();
  });

  it("?novo=1 abre o formulário e tira o novo da URL, mantendo o recorte", () => {
    navegacao.params = new URLSearchParams("modo=carretas&novo=1");
    montar();
    expect(screen.getByRole("dialog")).toHaveTextContent("Novo abastecimento");
    expect(navegacao.replace).toHaveBeenCalledWith("/combustivel/abastecimentos?modo=carretas", { scroll: false });
  });

  it("linha de controle: sem ?novo=1, nem abre nem mexe na URL", () => {
    montar();
    expect(screen.queryByText("Novo abastecimento")).not.toBeInTheDocument();
    expect(navegacao.replace).not.toHaveBeenCalled();
  });

  it("?novo=1 sem permissão de criar: não abre, mas o parâmetro sai da URL", () => {
    navegacao.params = new URLSearchParams("novo=1");
    montar({ podeCriar: false });
    expect(screen.queryByText("Novo abastecimento")).not.toBeInTheDocument();
    expect(navegacao.replace).toHaveBeenCalledWith("/combustivel/abastecimentos", { scroll: false });
  });
});
