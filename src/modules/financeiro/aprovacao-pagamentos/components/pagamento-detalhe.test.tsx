import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PagamentoDetalheView } from "@/modules/financeiro/aprovacao-pagamentos/components/pagamento-detalhe";
import type {
  LancamentoDetalhe,
  ParcelaLancamento,
} from "@/modules/financeiro/lancamentos/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/financeiro/aprovacao-pagamentos/1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/financeiro/aprovacao-pagamentos/actions", () => ({
  aprovarParcela: vi.fn(),
  revisarParcela: vi.fn(),
}));

// A seção de anexos busca por Server Action ao remover/enviar; aqui é read-only,
// mas o módulo é importado no render.
vi.mock("@/modules/_shared/anexos/actions", () => ({
  listarAnexos: vi.fn(async () => []),
  removerAnexo: vi.fn(),
  registrarAnexo: vi.fn(),
}));

afterEach(() => cleanup());

const ID_PARCELA = "11111111-1111-4111-8111-111111111111";
const ID_OUTRA = "22222222-2222-4222-8222-222222222222";

function parcela(troca: Partial<ParcelaLancamento> = {}): ParcelaLancamento {
  return {
    id: ID_PARCELA,
    numeroParcela: 2,
    valor: 7204.66,
    desconto: 0,
    valorLiquido: 7204.66,
    dataVencimento: "2026-08-15",
    status: "pendente",
    dataProgramada: null,
    dataProgramadaOrigem: null,
    contaBancariaId: "55555555-5555-4555-8555-555555555555",
    contaBancariaNome: "Bradesco 1234",
    dataPagamento: null,
    ...troca,
  };
}

function lancamento(troca: Partial<LancamentoDetalhe> = {}): LancamentoDetalhe {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    numero: "LAN-2026-1362",
    numeroDocumento: null,
    tipo: "a_pagar",
    origem: "manual",
    origemId: null,
    fornecedorId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    fornecedorNome: "GUERRA IMPLEMENTOS RODOVIARIOS S.A",
    categoriaId: null,
    categoriaNome: "Aquisição de Equipamento",
    descricao: "1 SR LS BASCULHANTE D 2E 9351",
    valor: 410665.62,
    status: "a_pagar",
    mesCompetencia: "2026-04-01",
    dataCompra: "2026-04-07",
    criadoEm: "2026-08-11T14:52:00Z",
    dataVencimento: "2026-08-15",
    observacoes: null,
    parcelas: [parcela(), parcela({ id: ID_OUTRA, numeroParcela: 3 })],
    rateios: [
      {
        id: "rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr",
        centroCustoId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        centroCustoNome: "Escritório Central",
        centroCustoCodigo: "001",
        valor: 410665.62,
      },
    ],
    condicaoPagamentoId: null,
    condicaoPagamentoDescricao: null,
    formaPagamentoId: null,
    formaPagamentoNome: "Boleto",
    formaPagamentoTipo: null,
    origemNumero: null,
    notaRegistrada: true,
    ...troca,
  };
}

const PADRAO = {
  anexos: [],
  trilha: [],
  itensOrigem: [],
  contas: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      nome: "Bradesco 1234",
      banco: "outro" as const,
      saldoAtual: 0,
    },
  ],
  podeAprovar: true,
  podeRevisar: true,
  podeEditarLancamento: true,
  semNota: false,
};

describe("PagamentoDetalheView mostra o pagamento inteiro", () => {
  it("traz fornecedor, valor da parcela e descrição", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento()}
        parcela={parcela()}
        {...PADRAO}
      />,
    );

    // Duas vezes de propósito: subtítulo do cabeçalho e a linha da seção
    // Lançamento. Quem confere vê de quem é o pagamento sem rolar.
    expect(
      screen.getAllByText("GUERRA IMPLEMENTOS RODOVIARIOS S.A"),
    ).toHaveLength(2);
    expect(screen.getByText("1 SR LS BASCULHANTE D 2E 9351")).toBeInTheDocument();
    // Pela parte numérica: o `getByText` normaliza o espaço não separável que o
    // formatarBRL põe depois do "R$", e comparar com a string crua nunca casa.
    expect(screen.getAllByText(/7\.204,66/).length).toBeGreaterThan(0);
  });

  it("marca qual das parcelas é a desta tela", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento()}
        parcela={parcela()}
        {...PADRAO}
      />,
    );

    // Num lançamento de 57 parcelas, a tabela sem marca faz a pessoa perder de
    // vista o que ela está aprovando.
    expect(screen.getByText("esta")).toBeInTheDocument();
  });

  it("centraliza o cabeçalho das tabelas de leitura, igual ao DataTable", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento()}
        parcela={parcela()}
        {...PADRAO}
      />,
    );

    // Estas tabelas são à mão (leitura pura, sem filtro nem ordenação), então não
    // herdam nada do DataTable: a régua do cabeçalho tinha que ser repetida aqui,
    // e "Valor" nasceu à direita. O valor da célula segue à direita, o rótulo não.
    for (const rotulo of ["#", "Vencimento", "Status", "Valor"]) {
      const cabecalho = screen.getByRole("columnheader", { name: rotulo });
      expect(cabecalho).toHaveClass("text-center");
      expect(cabecalho).not.toHaveClass("text-right");
    }
  });

  it("mostra o rateio por centro de custo", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento()}
        parcela={parcela()}
        {...PADRAO}
      />,
    );

    expect(screen.getByText("001 - Escritório Central")).toBeInTheDocument();
  });
});

describe("PagamentoDetalheView e a decisão de aprovar", () => {
  it("oferece aprovar e revisar quando a parcela está na fila", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento()}
        parcela={parcela()}
        {...PADRAO}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Aprovar pagamento/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Enviar para revisão/i }),
    ).toBeInTheDocument();
  });

  it("explica em vez de esconder quando a parcela já foi aprovada", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento({ status: "aprovado" })}
        parcela={parcela({ status: "aprovado" })}
        {...PADRAO}
      />,
    );

    // Chega-se aqui por link do WhatsApp dias depois. Tela sem botão e sem
    // explicação faz quem abriu achar que perdeu o acesso.
    expect(screen.getByText(/já está aprovada/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Aprovar pagamento/i }),
    ).not.toBeInTheDocument();
  });

  it("explica quando falta a conta bancária no lançamento", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento()}
        parcela={parcela({ contaBancariaId: null, contaBancariaNome: null })}
        {...PADRAO}
      />,
    );

    // Pela frase da explicação, não pelo termo solto: "conta bancária" também é
    // o rótulo do campo na seção Pagamento, e casar com ele não provaria nada.
    expect(
      screen.getByText(/Falta escolher a conta bancária no lançamento/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Aprovar pagamento/i }),
    ).not.toBeInTheDocument();
  });

  it("quem só tem ver não recebe botão de aprovar, e a tela diz isso", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento()}
        parcela={parcela()}
        {...PADRAO}
        podeAprovar={false}
        podeRevisar={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Aprovar pagamento/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/não tem permissão para aprovar/i),
    ).toBeInTheDocument();
  });

  it("oferece o espelho também em parcela que ainda não foi paga", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento()}
        parcela={parcela()}
        {...PADRAO}
      />,
    );

    // Este teste já afirmou o contrário. Mudou por decisão do dono: a aba de
    // aprovação imprime o espelho igual à de lançamentos, nos dois lugares
    // (listagem e detalhe), em qualquer status.
    //
    // Continua não gerando papel mentiroso, e a garantia não mora mais aqui:
    // src/app/(espelho)/espelho/pagamentos/page.tsx degrada sozinha quando a
    // parcela não tem status 'pago' — o documento sai intitulado "Parcela", e
    // "Saiu da conta" e "Pago em" saem como travessão. Precisa ser lá porque o
    // link do espelho é colável, e guarda que só existe no botão não é guarda.
    expect(
      screen.getByRole("button", { name: /Imprimir espelho/i }),
    ).toBeInTheDocument();
  });

  it("oferece o espelho quando a parcela está paga", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento({ status: "pago" })}
        parcela={parcela({ status: "pago", dataPagamento: "2026-08-15" })}
        {...PADRAO}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Imprimir espelho/i }),
    ).toBeInTheDocument();
  });

  it("avisa da nota fiscal sem impedir a aprovação", () => {
    render(
      <PagamentoDetalheView
        lancamento={lancamento({ origem: "oc", notaRegistrada: false })}
        parcela={parcela()}
        {...PADRAO}
        semNota
      />,
    );

    expect(screen.getByText(/não tem nota fiscal/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Aprovar pagamento/i }),
    ).toBeInTheDocument();
  });
});
