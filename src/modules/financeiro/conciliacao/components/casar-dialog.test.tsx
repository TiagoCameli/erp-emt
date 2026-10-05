import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { casar, resumoDoLancamento } from "@/modules/financeiro/conciliacao/actions";
import type {
  CandidatoDoPainel,
  ParcelaLivre,
  TransacaoPainel,
} from "@/modules/financeiro/conciliacao/painel";
import { CasarDialog, opcoesDeAjuste } from "./casar-dialog";

vi.mock("@/modules/financeiro/conciliacao/actions", () => ({
  casar: vi.fn(async () => ({ ok: true })),
  resumoDoLancamento: vi.fn(async () => ({ erro: "Sem permissão para ver lançamentos" })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// O boleto real de 30/09: o banco debitou R$ 1.183,21 e a parcela é 1.183,22.
const transacao: TransacaoPainel = {
  id: "38673fc5-c55a-c7be-8687-e9b1d3589ef1",
  extratoId: "e",
  dataMovimento: "2026-09-30",
  valor: -1183.21,
  tipo: "debito",
  memo: "PAGAMENTO DE BOLETO - RB TRATOR PECAS LTDA",
  conciliada: false,
  automatica: false,
  confiraConfirmado: false,
  parcela: null,
  transferencia: null,
  estorno: null,
};

function candidato(id: string, valor: number, grupo: CandidatoDoPainel["grupo"]): CandidatoDoPainel {
  const registro: ParcelaLivre = {
    id,
    lancamentoId: "l",
    lancamentoNumero: `LAN-${id}`,
    descricao: "Motor de partida",
    nome: "RB TRATOR PECAS",
    razaoSocial: null,
    tipo: "a_pagar",
    origem: "manual",
    numeroParcela: 1,
    qtdParcelas: 1,
    valor,
    valorLiquido: valor,
    dataPagamento: "2026-09-30",
    numeroDocumento: null,
    status: grupo === "aberta" ? "aprovado" : "pago",
    contaNome: "BB",
    contaId: "bb",
    apelidos: [],
  };
  return {
    especie: "parcela",
    grupo,
    id,
    data: "2026-09-30",
    valor,
    sentido: "debito",
    nomes: [registro.nome],
    registro,
  };
}

describe("CasarDialog", () => {
  it("só casa com diferença de centavo depois de escolher o que ela é", async () => {
    render(
      <CasarDialog
        aberto
        onAbertoChange={() => {}}
        transacao={transacao}
        candidatos={[candidato("38673fc5-c55a-c7be-8687-e9b1d3589ef2", 1183.22, "paga_na_conta")]}
      />,
    );

    fireEvent.click(screen.getAllByRole("radio")[0]);
    const botao = screen.getByRole("button", { name: /^Casar$/ });
    expect(botao).toBeDisabled();
    expect(screen.getByText(/Valor difere em R\$\s?0,01/)).toBeInTheDocument();

    // Banco pagou a menos: desconto ou custo, nenhum marcado.
    expect(screen.getByLabelText("Desconto obtido (receita financeira)")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Custo do fornecedor (reduz o valor do lançamento)"));
    expect(botao).toBeEnabled();
    fireEvent.click(botao);

    await waitFor(() =>
      expect(casar).toHaveBeenCalledWith({
        transacaoId: transacao.id,
        especie: "parcela",
        alvoId: "38673fc5-c55a-c7be-8687-e9b1d3589ef2",
        ajuste: "custo",
        aprender: expect.any(Boolean),
      }),
    );
  });

  it("diz o que acontece com a parcela em aberto e casa sem ajuste no valor exato", async () => {
    render(
      <CasarDialog
        aberto
        onAbertoChange={() => {}}
        transacao={transacao}
        candidatos={[candidato("38673fc5-c55a-c7be-8687-e9b1d3589ef3", 1183.21, "aberta")]}
      />,
    );

    expect(screen.getByText("Em aberto: dá baixa na data do extrato")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Casar$/ }));
    await waitFor(() =>
      expect(casar).toHaveBeenCalledWith(expect.objectContaining({ ajuste: null })),
    );
  });
});

describe("Ver resumo do lançamento", () => {
  it("abre o resumo do lançamento do candidato sem escolher o candidato", async () => {
    render(
      <CasarDialog
        aberto
        onAbertoChange={() => {}}
        transacao={transacao}
        candidatos={[candidato("38673fc5-c55a-c7be-8687-e9b1d3589ef4", 1183.21, "paga_na_conta")]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ver resumo do lançamento" }));
    await waitFor(() => expect(resumoDoLancamento).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Sem permissão para ver lançamentos")).toBeInTheDocument();
    // O resumo abre por cima: o Casar fica escondido para leitores de tela.
    expect(screen.getAllByRole("radio", { hidden: true })[0]).toHaveAttribute("aria-checked", "false");
  });
});

describe("opcoesDeAjuste", () => {
  it("banco a mais: juros ou custo que aumenta; banco a menos: desconto ou custo que reduz", () => {
    expect(opcoesDeAjuste(0.01, false).map((o) => o.rotulo)).toEqual([
      "Juros ou multa (despesa financeira)",
      "Custo do fornecedor (aumenta o valor do lançamento)",
    ]);
    expect(opcoesDeAjuste(-0.01, false).map((o) => o.rotulo)).toEqual([
      "Desconto obtido (receita financeira)",
      "Custo do fornecedor (reduz o valor do lançamento)",
    ]);
  });

  it("origem de RH só oferece o financeiro", () => {
    expect(opcoesDeAjuste(0.01, true).map((o) => o.valor)).toEqual(["financeiro"]);
  });
});
