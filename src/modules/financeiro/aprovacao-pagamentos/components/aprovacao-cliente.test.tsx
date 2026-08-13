import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AprovacaoCliente } from "@/modules/financeiro/aprovacao-pagamentos/components/aprovacao-cliente";
import type {
  PagamentoDireto,
  ParcelaPendente,
} from "@/modules/financeiro/aprovacao-pagamentos/queries";
import { CONFERENCIA } from "@/modules/financeiro/aprovacao-pagamentos/rotulos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/aprovacao-pagamentos",
  useSearchParams: () => new URLSearchParams(),
}));

// Sem este mock o DataTable chama cookies() fora de uma requisição e o render
// lança como unhandled error.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/financeiro/aprovacao-pagamentos/actions", () => ({
  aprovarParcela: vi.fn(),
  aprovarParcelasEmLote: vi.fn(),
  revisarParcela: vi.fn(),
  revisarParcelasEmLote: vi.fn(),
  marcarParcelaConferida: vi.fn(),
  marcarParcelasConferidasEmLote: vi.fn(),
  detalheDaFila: vi.fn(),
}));

beforeAll(() => {
  const memoria = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (chave: string) => memoria.get(chave) ?? null,
      setItem: (chave: string, valor: string) => void memoria.set(chave, valor),
      removeItem: (chave: string) => void memoria.delete(chave),
      clear: () => memoria.clear(),
      key: () => null,
      length: 0,
    },
  });
});

afterEach(() => cleanup());

const parcela: ParcelaPendente = {
  id: "11111111-1111-4111-8111-111111111111",
  numeroParcela: 1,
  totalParcelas: 1,
  valor: 3600,
  dataVencimento: "2026-08-14",
  lancamentoId: "22222222-2222-4222-8222-222222222222",
  lancamentoNumero: "LAN-2026-0015",
  lancamentoDescricao: "Compra de cimento",
  fornecedorNome: "A CRUZEIRENSE",
  origem: "manual",
  origemId: null,
  origemNumero: null,
  categoriaNome: "Material",
  formaPagamentoNome: "PIX",
  contaBancariaId: "55555555-5555-4555-8555-555555555555",
  contaBancariaNome: "Caixa 1234",
  dataCompra: "2026-07-30",
  mesCompetencia: "2026-07-01",
  dataProgramada: null,
  rateios: [],
  anexos: 0,
  semNota: false,
};

const direto: PagamentoDireto = {
  id: "99999999-9999-4999-8999-999999999999",
  numeroParcela: 1,
  totalParcelas: 1,
  valor: 250.5,
  desconto: 0,
  valorLiquido: 250.5,
  dataVencimento: "2026-08-14",
  dataPagamento: "2026-08-14",
  status: "pago",
  lancamentoId: "88888888-8888-4888-8888-888888888888",
  lancamentoNumero: "LAN-2026-0031",
  lancamentoDescricao: "Diesel do caminhão pipa",
  fornecedorNome: "POSTO CENTRAL",
  origem: "manual",
  origemId: null,
  origemNumero: null,
  categoriaNome: "Combustível",
  formaPagamentoNome: "Espécie",
  formaPagamentoTipo: "dinheiro",
  contaBancariaId: null,
  contaBancariaNome: null,
  dataCompra: "2026-08-14",
  mesCompetencia: "2026-08-01",
  rateios: [],
  anexos: 0,
  semNota: false,
  conferidoEm: null,
  conferidoPorNome: null,
};

function renderizar() {
  return render(
    <AprovacaoCliente
      fila={{
        parcelas: [parcela],
        incompletas: { parcelas: 0, valor: 0, lancamentos: 0 },
        emRevisao: { parcelas: 0, valor: 0 },
        aguardandoData: { parcelas: 0, valor: 0 },
        aguardandoConta: { parcelas: 0, valor: 0 },
        contas: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            nome: "Caixa 1234",
            banco: "caixa",
          },
        ],
        podeAprovar: true,
        podeRevisar: true,
        podeEditarLancamento: true,
        idUsuario: "44444444-4444-4444-8444-444444444444",
        parcelasDoLink: [],
        foraDaFila: [],
      }}
      diretos={{
        pagamentos: [direto],
        podeConferir: true,
        podeVerLancamento: true,
      }}
    />,
  );
}

describe("AprovacaoCliente", () => {
  it("mostra as duas abas, com a fila aberta por padrão", () => {
    expect(() => renderizar()).not.toThrow();

    expect(
      screen.getByRole("tab", { name: "Fila de aprovação" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: CONFERENCIA.aba }),
    ).toBeInTheDocument();

    // A fila continua sendo a primeira coisa que aparece: a aba nova é registro
    // de conferência, não o trabalho principal da tela.
    expect(screen.getByText("Compra de cimento")).toBeInTheDocument();
    expect(
      screen.queryByText("Diesel do caminhão pipa"),
    ).not.toBeInTheDocument();
  });
});
