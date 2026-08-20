import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PagarLoteDrawer } from "@/modules/financeiro/pagamentos/components/pagar-lote-drawer";
import { pagarParcela } from "@/modules/financeiro/pagamentos/actions";
import type {
  ContaBancariaOpcao,
  ParcelaAprovada,
} from "@/modules/financeiro/pagamentos/queries";

/**
 * O pagamento em lote é a única tela do app que mexe em várias parcelas de
 * dinheiro num clique. O que este arquivo prende:
 *
 * - uma parcela recusada pelo banco não derruba as outras, e o motivo da recusa
 *   fica na tela;
 * - pagar fora da data autorizada exige motivo ANTES de mandar, com a mesma
 *   regra do banco;
 * - o saldo que sobra é mostrado antes de tentar, porque o banco recusa
 *   pagamento sem saldo.
 */

vi.mock("@/modules/financeiro/pagamentos/actions", () => ({
  pagarParcela: vi.fn(async () => ({ ok: true })),
}));

const CONTA: ContaBancariaOpcao = {
  id: "77777777-7777-4777-8777-777777777777",
  nome: "Obra 364",
  banco: "bb",
  saldoAtual: 1200,
};

function parcela(troca: Partial<ParcelaAprovada> = {}): ParcelaAprovada {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    lancamentoId: "44444444-4444-4444-8444-444444444444",
    lancamentoNumero: "LAN-2026-0015",
    numeroParcela: 1,
    descricao: "Diesel S10",
    categoriaNome: "Combustível",
    fornecedorNome: "Areacre",
    fornecedorId: null,
    contaBancariaId: CONTA.id,
    dataVencimento: "2026-08-25",
    // Autorizada para hoje: sem exigência de motivo por padrão.
    dataProgramada: hojeISO(),
    dataProgramadaOrigem: null,
    valor: 500,
    aprovadoEm: null,
    status: "aprovado",
    ...troca,
  };
}

/** A data que o drawer usa como padrão é "hoje" em Rio Branco. */
function hojeISO(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Rio_Branco",
  });
}

const DUAS = [
  parcela({ id: "11111111-1111-4111-8111-111111111111", valor: 500 }),
  parcela({
    id: "22222222-2222-4222-8222-222222222222",
    numeroParcela: 2,
    lancamentoNumero: "LAN-2026-0016",
    valor: 300,
  }),
];

function montar(parcelas = DUAS) {
  return render(
    <PagarLoteDrawer
      aberto
      onAbertoChange={vi.fn()}
      parcelas={parcelas}
      contas={[CONTA]}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(pagarParcela).mockReset();
  vi.mocked(pagarParcela).mockResolvedValue({ ok: true });
});

describe("PagarLoteDrawer", () => {
  it("mostra o total, o saldo da conta e o saldo depois", () => {
    montar();
    // 500 + 300 = 800, saldo 1.200 => sobra 400.
    expect(screen.getByText("Total: R$ 800,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.200,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 400,00")).toBeInTheDocument();
  });

  it("avisa quando o saldo não cobre o lote", () => {
    montar([parcela({ valor: 5000 })]);
    expect(
      screen.getByText(/saldo desta conta não cobre o lote/i),
    ).toBeInTheDocument();
    // Diz quanto falta, para o operador escolher outra conta ou um lote menor.
    expect(screen.getByText(/faltam R\$ 3.800,00/i)).toBeInTheDocument();
  });

  it("paga uma por uma, em sequência", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Pagar 2 parcelas" }));

    await waitFor(() => {
      expect(vi.mocked(pagarParcela)).toHaveBeenCalledTimes(2);
    });
    // Mesma conta e mesma data para as duas, e NENHUM ajuste de dinheiro no
    // lote: desconto, juros e despesas são acerto de uma parcela só.
    const [primeira, segunda] = vi.mocked(pagarParcela).mock.calls;
    expect(primeira[0]).toBe(DUAS[0].id);
    expect(segunda[0]).toBe(DUAS[1].id);
    expect(primeira[1]).toBe(CONTA.id);
    expect(segunda[1]).toBe(CONTA.id);
    expect(primeira[3]?.desconto).toBeUndefined();
    expect(primeira[3]?.juros).toBeUndefined();
    expect(primeira[3]?.outrasDespesas).toBeUndefined();
  });

  it("recusa de uma não impede as outras, e o motivo fica na tela", async () => {
    vi.mocked(pagarParcela)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        erro: "Saldo insuficiente na conta: saldo atual R$ 700,00, pagamento de R$ 300,00.",
      });

    montar();
    fireEvent.click(screen.getByRole("button", { name: "Pagar 2 parcelas" }));

    await waitFor(() => {
      expect(screen.getByText("1 parcela não foi paga")).toBeInTheDocument();
    });
    expect(screen.getByText(/Saldo insuficiente/)).toBeInTheDocument();
    // A que passou não some do relatório por causa da que falhou.
    expect(vi.mocked(pagarParcela)).toHaveBeenCalledTimes(2);
  });

  it("exige motivo quando alguma parcela está fora da data autorizada", () => {
    montar([
      parcela({ valor: 500 }),
      parcela({
        id: "22222222-2222-4222-8222-222222222222",
        dataProgramada: "2026-01-05",
        valor: 300,
      }),
    ]);

    expect(
      screen.getByText("1 parcela está fora da data autorizada"),
    ).toBeInTheDocument();
    // Trava antes de mandar: o banco exigiria o mesmo, e descobrir isso depois
    // de meia dúzia de pagamentos feitos é a pior hora.
    expect(
      screen.getByRole("button", { name: "Pagar 2 parcelas" }),
    ).toBeDisabled();
  });

  it("com o motivo preenchido, libera e manda o motivo junto", async () => {
    montar([
      parcela({ dataProgramada: "2026-01-05", valor: 500 }),
    ]);

    fireEvent.change(screen.getByLabelText(/Motivo/i), {
      target: { value: "Fornecedor antecipou a cobrança" },
    });

    const botao = screen.getByRole("button", { name: "Pagar parcela" });
    expect(botao).not.toBeDisabled();
    fireEvent.click(botao);

    await waitFor(() => {
      expect(vi.mocked(pagarParcela)).toHaveBeenCalledTimes(1);
    });
    // Pelo NOME do campo, não pela posição: o motivo virou uma chave de
    // `ajustes` junto com desconto, juros e despesas, e uma asserção posicional
    // passaria a apontar para dinheiro sem que o teste mudasse de cor.
    expect(vi.mocked(pagarParcela).mock.calls[0][3]?.motivo).toBe(
      "Fornecedor antecipou a cobrança",
    );
  });

  it("sem conta escolhida não deixa pagar", () => {
    render(
      <PagarLoteDrawer
        aberto
        onAbertoChange={vi.fn()}
        // Parcelas de contas diferentes: o drawer abre sem conta sugerida, para
        // não pagar as outras da conta de uma delas.
        parcelas={[
          parcela({ contaBancariaId: CONTA.id }),
          parcela({
            id: "22222222-2222-4222-8222-222222222222",
            contaBancariaId: "99999999-9999-4999-8999-999999999999",
          }),
        ]}
        contas={[CONTA]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Pagar 2 parcelas" }),
    ).toBeDisabled();
  });
});
