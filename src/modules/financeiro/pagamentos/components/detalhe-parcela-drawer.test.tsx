import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { desaprovarParcela } from "@/modules/financeiro/aprovacao-pagamentos/actions";
import { detalheDaParcela } from "@/modules/financeiro/pagamentos/actions";
import { DetalheParcelaDrawer } from "@/modules/financeiro/pagamentos/components/detalhe-parcela-drawer";
import type { EspelhoPagamento } from "@/modules/financeiro/pagamentos/espelho";
import type { StatusParcela } from "@/modules/financeiro/_shared/formato";

vi.mock("@/modules/financeiro/pagamentos/actions", () => ({
  detalheDaParcela: vi.fn(),
}));

vi.mock("@/modules/financeiro/aprovacao-pagamentos/actions", () => ({
  desaprovarParcela: vi.fn(async () => ({ ok: true as const })),
}));

// Anexos fala com o servidor por conta própria; aqui o assunto é o rodapé.
vi.mock("@/components/canonicos/anexos", () => ({
  Anexos: () => null,
}));

vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const ID = "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b";

function espelho(status: StatusParcela): EspelhoPagamento {
  return {
    id: ID,
    titulo: "LAN-2026-4839 parcela 3",
    numeroParcela: 3,
    dataVencimento: "2026-08-20",
    valor: 29700,
    desconto: 0,
    juros: 0,
    outrasDespesas: 0,
    valorLiquido: 29700,
    status,
    dataPagamento: null,
    contaNome: "BANCO DO BRASIL 102.124-9",
    lancamentoId: "550e8400-e29b-41d4-a716-446655440000",
    lancamentoNumero: "LAN-2026-4839",
    lancamentoDescricao: "REFERENTE COMPRA DE 01 CAMINHÃO",
    lancamentoValor: 89100,
    lancamentoStatus: "a_pagar",
    lancamentoTipo: "a_pagar",
    lancamentoObservacoes: null,
    mesCompetencia: "2026-08-01",
    fornecedorNome: "NISSEY CAMINHOES LTDA",
    clienteNome: null,
    categoriaNome: "Aquisição de Equipamento",
    formaPagamentoNome: "Cartão de crédito",
    rateios: [],
    somaRateios: 0,
    resumoParcelas: null,
  };
}

function prepararDetalhe(status: StatusParcela) {
  vi.mocked(detalheDaParcela).mockResolvedValue({
    espelho: espelho(status),
    anexos: [],
    trilha: [],
  });
}

/** Renderiza o painel aberto e espera o carregamento terminar. */
async function abrir(props: {
  status: StatusParcela;
  podeDesaprovar?: boolean;
  onMudou?: () => void;
  onAbertoChange?: (aberto: boolean) => void;
}) {
  prepararDetalhe(props.status);
  render(
    <DetalheParcelaDrawer
      aberto
      onAbertoChange={props.onAbertoChange ?? (() => {})}
      parcelaId={ID}
      podeAnexar={false}
      podePagar
      podeDesaprovar={props.podeDesaprovar ?? true}
      // O botão de pagar só aparece com o callback: sem ele o rodapé não teria
      // como levar a lugar nenhum.
      onPagar={() => {}}
      onMudou={props.onMudou}
    />,
  );
  await screen.findByText("LAN-2026-4839 parcela 3");
}

afterEach(() => {
  cleanup();
  vi.mocked(desaprovarParcela).mockClear();
  vi.mocked(detalheDaParcela).mockReset();
});

describe("DetalheParcelaDrawer, voltar para aprovação", () => {
  it("oferece o botão numa parcela aprovada, para quem tem a permissão", async () => {
    await abrir({ status: "aprovado", podeDesaprovar: true });

    expect(
      screen.getByRole("button", { name: "Voltar para aprovação" }),
    ).toBeInTheDocument();
  });

  it("some sem a permissão de desaprovar, que é de quem aprova e não de quem paga", async () => {
    await abrir({ status: "aprovado", podeDesaprovar: false });

    expect(
      screen.queryByRole("button", { name: "Voltar para aprovação" }),
    ).not.toBeInTheDocument();
    // O de pagar continua lá: são permissões diferentes.
    expect(
      screen.getByRole("button", { name: "Pagar esta parcela" }),
    ).toBeInTheDocument();
  });

  it("some na parcela já paga: a fn_desaprovar_parcela só aceita aprovada", async () => {
    await abrir({ status: "pago", podeDesaprovar: true });

    expect(
      screen.queryByRole("button", { name: "Voltar para aprovação" }),
    ).not.toBeInTheDocument();
  });

  it("some na parcela pendente: ela já está na fila de aprovação", async () => {
    await abrir({ status: "pendente", podeDesaprovar: true });

    expect(
      screen.queryByRole("button", { name: "Voltar para aprovação" }),
    ).not.toBeInTheDocument();
  });

  it("manda o motivo digitado para a action e fecha o painel", async () => {
    const onMudou = vi.fn();
    const onAbertoChange = vi.fn();
    await abrir({
      status: "aprovado",
      podeDesaprovar: true,
      onMudou,
      onAbertoChange,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Voltar para aprovação" }),
    );

    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "  Forma é cartão de crédito, não passa pela fila  " },
    });
    // O diálogo repete o rótulo no botão de confirmar; o segundo é o dele.
    const confirmar = screen.getAllByRole("button", {
      name: "Voltar para aprovação",
    });
    fireEvent.click(confirmar[confirmar.length - 1]);

    await vi.waitFor(() =>
      // Trimado: motivo com espaço nas pontas é o mesmo motivo, e a action
      // rejeita motivo só de espaço.
      expect(vi.mocked(desaprovarParcela)).toHaveBeenCalledWith(
        ID,
        "Forma é cartão de crédito, não passa pela fila",
      ),
    );

    // O painel fecha: ele descreve uma parcela aprovada que deixou de existir.
    await vi.waitFor(() => expect(onAbertoChange).toHaveBeenCalledWith(false));
    expect(onMudou).toHaveBeenCalled();
  });

  it("sem motivo, o confirmar do diálogo fica travado", async () => {
    await abrir({ status: "aprovado", podeDesaprovar: true });

    fireEvent.click(
      screen.getByRole("button", { name: "Voltar para aprovação" }),
    );

    const confirmar = screen.getAllByRole("button", {
      name: "Voltar para aprovação",
    });
    expect(confirmar[confirmar.length - 1]).toBeDisabled();
    expect(vi.mocked(desaprovarParcela)).not.toHaveBeenCalled();
  });
});

describe("DetalheParcelaDrawer, os ajustes do pagamento", () => {
  it("mostra outras despesas junto de desconto e juros", async () => {
    vi.mocked(detalheDaParcela).mockResolvedValue({
      espelho: {
        ...espelho("pago"),
        desconto: 100,
        juros: 42.5,
        outrasDespesas: 3.9,
        // 29.700 - 100 + 42,50 + 3,90.
        valorLiquido: 29646.4,
        dataPagamento: "2026-08-20",
      },
      anexos: [],
      trilha: [],
    });
    render(
      <DetalheParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcelaId={ID}
        podeAnexar={false}
        podePagar={false}
      />,
    );
    await screen.findByText("LAN-2026-4839 parcela 3");

    expect(screen.getByText("Outras despesas")).toBeInTheDocument();
    const texto = (document.body.textContent ?? "").replace(/ /g, " ");
    // O que saiu da conta, com os três ajustes dentro.
    expect(texto).toContain("R$ 29.646,40");
  });
});

describe("DetalheParcelaDrawer no lançamento A RECEBER", () => {
  /** O mesmo painel, com o tipo do lançamento invertido. */
  function comoReceber(status: StatusParcela) {
    return {
      ...espelho(status),
      lancamentoTipo: "a_receber" as const,
      clienteNome: "DEPART. NAC. INFRA ESTRUTURA",
      fornecedorNome: null,
      dataPagamento: status === "pago" ? "2026-08-20" : null,
    };
  }

  async function abrirReceber(status: StatusParcela) {
    vi.mocked(detalheDaParcela).mockResolvedValue({
      espelho: comoReceber(status),
      anexos: [],
      trilha: [],
    });
    render(
      <DetalheParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcelaId={ID}
        podeAnexar={false}
        // Mesmo com as duas permissões ligadas, as ações de pagamento não
        // aparecem num recebimento: elas são de outro fluxo.
        podePagar
        podeDesaprovar
        onPagar={() => {}}
      />,
    );
    await screen.findByText("LAN-2026-4839 parcela 3");
  }

  it("o dinheiro ENTRA: o rótulo não diz que saiu", async () => {
    await abrirReceber("pago");

    expect(screen.getByText("Entrou na conta")).toBeInTheDocument();
    expect(screen.queryByText("Saiu da conta")).not.toBeInTheDocument();
    expect(screen.getByText("Recebido em")).toBeInTheDocument();
    expect(screen.queryByText("Pago em")).not.toBeInTheDocument();
  });

  it("mostra QUEM PAGA, e não um fornecedor que não existe", async () => {
    await abrirReceber("pago");

    // Antes de 22/08/2026 o espelho só lia `fornecedores`, então o recebimento
    // exibia "Sem fornecedor" no lugar do nome de quem estava pagando.
    expect(screen.getByText("Quem paga")).toBeInTheDocument();
    expect(
      screen.getByText("DEPART. NAC. INFRA ESTRUTURA"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Fornecedor")).not.toBeInTheDocument();
  });

  it("não oferece pagar nem devolver para aprovação", async () => {
    await abrirReceber("aprovado");

    expect(
      screen.queryByRole("button", { name: "Pagar esta parcela" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Voltar para aprovação" }),
    ).not.toBeInTheDocument();
  });

  it("a seção se chama Recebimento quando já entrou", async () => {
    await abrirReceber("pago");
    expect(screen.getByText("Recebimento")).toBeInTheDocument();
    expect(screen.queryByText("Pagamento")).not.toBeInTheDocument();
  });
});
