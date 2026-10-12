import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { MapaComparativo } from "@/modules/compras/cotacoes/components/mapa-comparativo";
import type {
  CotacaoDetalhe,
  FornecedorCotacao,
} from "@/modules/compras/cotacoes/queries";

/**
 * O mapa comparativo em DataTable (12/10/2026): colunas por fornecedor com o id
 * da cotacao_fornecedor, verde no menor preço da linha e no menor total, Total
 * preso embaixo enquanto a matriz rola, e os campos de preço sem perder o foco
 * no meio da digitação.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/compras/cotacoes",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));
vi.mock("@/modules/compras/cotacoes/actions", () => ({
  salvarPrecos: vi.fn(async () => ({ ok: true })),
}));

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

const CF_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CF_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INSUMO = "11111111-1111-4111-8111-111111111111";

function fornecedor(id: string, nome: string): FornecedorCotacao {
  return {
    id,
    fornecedorId: `${id}-f`,
    fornecedorNome: nome,
    condicaoPagamentoId: null,
    condicaoPagamentoDescricao: null,
    prazoEntregaDias: null,
    observacao: null,
    total: 0,
    menorTotal: false,
  };
}

function cotacao(status: CotacaoDetalhe["status"]): CotacaoDetalhe {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    numero: "COT-2026-0001",
    status,
    descricao: null,
    categoriaId: null,
    categoriaNome: null,
    motivoSelecao: null,
    observacoes: null,
    vencedorFornecedorId: null,
    vencedorNome: null,
    createdAt: "2026-10-01T12:00:00Z",
    fornecedores: [fornecedor(CF_A, "Fornecedor A"), fornecedor(CF_B, "Fornecedor B")],
    insumos: [
      {
        insumoId: INSUMO,
        insumoNome: "CIMENTO",
        insumoCodigo: null,
        unidadeSigla: "sc",
        quantidade: 10,
      },
    ],
    precos: {
      [INSUMO]: {
        [CF_A]: { precoUnitario: 30, subtotal: 300, menorPrecoDaLinha: false },
        [CF_B]: { precoUnitario: 25, subtotal: 250, menorPrecoDaLinha: true },
      },
    },
  };
}

describe("MapaComparativo", () => {
  it("pinta de verde a célula do menor preço e o Total sugerido, com o pé preso", () => {
    const { container } = render(
      <MapaComparativo cotacao={cotacao("finalizada")} insumos={[]} podeEditar={false} />,
    );

    const celulaA = container.querySelector(`tbody td[data-coluna="${CF_A}"]`);
    const celulaB = container.querySelector(`tbody td[data-coluna="${CF_B}"]`);
    expect(celulaB?.className).toContain("bg-status-aprovado/10");
    expect(celulaA?.className).not.toContain("bg-status-aprovado/10");

    const peA = container.querySelector(`tfoot td[data-coluna="${CF_A}"]`);
    const peB = container.querySelector(`tfoot td[data-coluna="${CF_B}"]`);
    expect(peB?.className).toContain("from-status-aprovado/10");
    expect(peA?.className).not.toContain("from-status-aprovado/10");
    expect(peB?.className).toContain("sticky");
    expect(peB?.textContent).toContain("sugerido");
  });

  it("o campo de preço continua focado enquanto a pessoa digita, mesmo quando o menor muda", () => {
    render(<MapaComparativo cotacao={cotacao("aberta")} insumos={[]} podeEditar />);

    const campo = screen.getByLabelText(
      "Preço de CIMENTO no fornecedor Fornecedor A",
    ) as HTMLInputElement;
    campo.focus();
    // 20 passa a ser o menor da linha e o menor total: a coluna de A ganha o verde.
    fireEvent.change(campo, { target: { value: "20" } });

    const depois = screen.getByLabelText(
      "Preço de CIMENTO no fornecedor Fornecedor A",
    ) as HTMLInputElement;
    expect(depois).toBe(campo);
    expect(document.activeElement).toBe(campo);
    expect(depois.value).toBe("20");
    expect(depois.closest("td")?.className).toContain("bg-status-aprovado/10");
  });
});
