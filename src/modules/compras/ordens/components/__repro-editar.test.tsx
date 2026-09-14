import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const editarOrdem = vi.fn(async () => ({ ok: true as const }));
const criarOrdem = vi.fn(async () => ({ id: "x" }));
const sugerirParcelasPelaCondicao = vi.fn(async () => ({ parcelas: [] }));

vi.mock("@/modules/compras/ordens/actions", () => ({
  editarOrdem: (...a: unknown[]) => editarOrdem(...(a as [])),
  criarOrdem: (...a: unknown[]) => criarOrdem(...(a as [])),
  sugerirParcelasPelaCondicao: (...a: unknown[]) =>
    sugerirParcelasPelaCondicao(...(a as [])),
}));
vi.mock("@/components/canonicos/anexos", () => ({ Anexos: () => null }));
vi.mock("@/components/canonicos/fila-anexos", () => ({
  FilaAnexos: () => null,
  subirFilaDeAnexos: async () => 0,
}));

const avisos: unknown[] = [];
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (m: unknown) => avisos.push(["erro", m]),
    success: (m: unknown) => avisos.push(["ok", m]),
  },
}));

import { OrdemFormDrawer } from "./ordem-form-drawer";

const PIX = "11111111-1111-4111-8111-111111111111";
const CC = "22222222-2222-4222-8222-222222222222";
const FORNECEDOR = "33333333-3333-4333-8333-333333333333";
const CONDICAO = "44444444-4444-4444-8444-444444444444";
const CATEGORIA = "9351f74e-df06-4f84-b1ee-98b2ea770d8a";
const CENTRO = "057cfab1-5866-416d-8bd8-f4a474b4e4a1";
const INSUMO = "8bdaa2c0-6949-4388-8e4a-2ff3ba2a2b17";

const base = {
  id: "9d6e3e3c-f52d-4ce8-8b3b-be40da0a9081",
  numero: "OC-2026-0026",
  fornecedorId: FORNECEDOR,
  fornecedorNome: "Fornecedor Teste",
  condicaoPagamentoId: CONDICAO,
  condicaoPagamentoDescricao: "À vista",
  formaPagamentoId: null,
  cotacaoId: null,
  cotacaoNumero: null,
  descricao: "REFERENTE CONSERTO MOTOR DA PATROL 12H - 01",
  categoriaId: CATEGORIA,
  categoriaNome: "Manutenção",
  valorTotal: 15400,
  ajustes: { frete: 0, outrasDespesas: 0, impostos: 0, desconto: 0 },
  status: "pendente_aprovacao",
  motivoRejeicao: null,
  dataCompra: "2026-08-17",
  mesCompetencia: "2026-08-01",
  criadoEm: "2026-08-17T12:00:00Z",
  numeroDocumento: null,
  observacoes: null,
  itens: [
    {
      id: "i1",
      insumoId: INSUMO,
      insumoNome: "Serviço Prestado",
      unidade: "UN",
      quantidade: 1,
      precoUnitario: 15400,
      subtotal: 15400,
      centroCustoId: CENTRO,
      centroCustoNome: "Motoniveladora 12H - 01",
      semCategoriaDeCusto: false,
    },
  ],
  parcelas: [
    { numeroParcela: 1, dataVencimento: "2026-08-17", valor: 400, formaPagamentoId: PIX },
    { numeroParcela: 2, dataVencimento: "2026-08-28", valor: 3000, formaPagamentoId: CC },
    { numeroParcela: 3, dataVencimento: "2026-09-28", valor: 3000, formaPagamentoId: CC },
    { numeroParcela: 4, dataVencimento: "2026-10-28", valor: 3000, formaPagamentoId: CC },
    { numeroParcela: 5, dataVencimento: "2026-11-28", valor: 3000, formaPagamentoId: CC },
    { numeroParcela: 6, dataVencimento: "2026-12-28", valor: 3000, formaPagamentoId: CC },
  ],
  formas: [
    { id: "f1", formaPagamentoId: PIX, formaPagamentoNome: "PIX", valor: 400 },
    { id: "f2", formaPagamentoId: CC, formaPagamentoNome: "Cartão de Crédito", valor: 15000 },
  ],
  lancamento: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function abrir(ordem: any) {
  render(
    <OrdemFormDrawer
      aberto
      onAbertoChange={() => {}}
      ordem={ordem}
      fornecedores={[{ id: FORNECEDOR, nome: "Fornecedor Teste" }]}
      insumos={[{ id: INSUMO, nome: "Serviço Prestado", unidade: "UN" }]}
      centrosCusto={[{ id: CENTRO, nome: "Motoniveladora 12H - 01", codigo: "01", tipo: null, paiId: null } as never]}
      condicoesPagamento={[{ id: CONDICAO, descricao: "À vista" } as never]}
      formasPagamento={[
        { id: PIX, nome: "PIX", tipo: "bancario" },
        { id: CC, nome: "Cartão de Crédito", tipo: "cartao_credito" },
      ]}
      categorias={[{ id: CATEGORIA, nome: "Manutenção" }]}
    />,
  );
}

/** Tudo que a tela mostra em vermelho depois do submit. */
function mensagensDeErro(): string[] {
  return Array.from(
    document.querySelectorAll('[role="alert"], .text-destructive'),
  )
    .map((el) => (el.textContent ?? "").trim())
    .filter(Boolean);
}

describe("diagnóstico: editar OC e salvar", () => {
  beforeEach(() => {
    editarOrdem.mockClear();
    avisos.length = 0;
  });
  afterEach(cleanup);

  const cenarios: Array<[string, unknown]> = [
    ["formas duplicadas (soma fecha)", {
      ...base,
      formas: [
        { id: "f1", formaPagamentoId: CC, formaPagamentoNome: "Cartão de Crédito", valor: 400 },
        { id: "f2", formaPagamentoId: CC, formaPagamentoNome: "Cartão de Crédito", valor: 15000 },
      ],
      parcelas: base.parcelas.map((p: { formaPagamentoId: string }) => ({ ...p, formaPagamentoId: CC })),
    }],
    ["soma das formas não fecha", {
      ...base,
      formas: [
        { id: "f1", formaPagamentoId: PIX, formaPagamentoNome: "PIX", valor: 400 },
        { id: "f2", formaPagamentoId: CC, formaPagamentoNome: "Cartão de Crédito", valor: 14000 },
      ],
    }],
    ["parcela sem forma", {
      ...base,
      parcelas: base.parcelas.map((p: object, i: number) =>
        i === 0 ? { ...p, formaPagamentoId: null } : p,
      ),
    }],
  ];

  for (const [nome, ordem] of cenarios) {
    it(`cenário: ${nome}`, async () => {
      abrir(ordem);
      fireEvent.click(await screen.findByRole("button", { name: /salvar ordem/i }));
      await new Promise((r) => setTimeout(r, 300));
      const { appendFileSync } = await import("node:fs");
      appendFileSync(process.env.DIAG_OUT ?? "/tmp/diag.txt",
        `\n### ${nome}\n  editarOrdem chamado: ${editarOrdem.mock.calls.length}` +
          `\n  toasts: ${JSON.stringify(avisos)}` +
          `\n  erros na tela: ${JSON.stringify(mensagensDeErro())}\n`,
      );
      expect(true).toBe(true);
    });
  }
});
