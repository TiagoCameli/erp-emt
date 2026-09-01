import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { formatarBRL } from "@/lib/formatadores";
import { DefinirRateioDialog } from "@/modules/financeiro/lancamentos/components/definir-rateio-dialog";
import { definirRateioLancamento } from "@/modules/financeiro/lancamentos/actions";

vi.mock("@/modules/financeiro/lancamentos/actions", () => ({
  definirRateioLancamento: vi.fn(async () => ({ ok: true as const })),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/canonicos/toast", () => ({ toast: toastMock }));

const CAVALO_03 = "11111111-1111-4111-8111-111111111111";
const CAVALO_04 = "22222222-2222-4222-8222-222222222222";

const CENTROS = [
  { id: CAVALO_03, nome: "Caminhão 03", codigo: null, paiId: null, tipo: "obra" },
  { id: CAVALO_04, nome: "Caminhão 04", codigo: null, paiId: null, tipo: "obra" },
];

const RATEIOS = [
  { centroCustoId: CAVALO_03, valor: 60 },
  { centroCustoId: CAVALO_04, valor: 40 },
];

function montar(props: Partial<React.ComponentProps<typeof DefinirRateioDialog>> = {}) {
  return render(
    <DefinirRateioDialog
      aberto
      onAbertoChange={() => {}}
      lancamentoId="lanc-1"
      valor={100}
      origem="manual"
      rateiosAtuais={RATEIOS}
      centrosCusto={CENTROS}
      {...props}
    />,
  );
}

/** O botão de salvar, achado pelo rótulo que ele mostra parado. */
function botaoSalvar() {
  return screen.getByRole("button", { name: "Salvar rateio" });
}

/** Escreve a justificativa, que é o último obstáculo antes de salvar. */
function escreverMotivo(texto: string) {
  fireEvent.change(screen.getByLabelText(/Por que o rateio está mudando/), {
    target: { value: texto },
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DefinirRateioDialog", () => {
  it("abre com o rateio gravado e a soma fechando", () => {
    montar();
    // Os dois valores gravados chegam nos campos, não zerados.
    expect(screen.getByLabelText("Valor do rateio 1")).toHaveValue("60,00");
    expect(screen.getByLabelText("Valor do rateio 2")).toHaveValue("40,00");
    // Nenhum aviso de dinheiro: 60 + 40 fecha com os 100 do lançamento. (O aviso
    // de motivo existe desde a abertura, e é assunto do teste seguinte.)
    expect(screen.queryByText(/Faltam|Sobram/)).toBeNull();
  });

  it("não deixa salvar sem motivo, mesmo com tudo certo", () => {
    // O botão desabilitado é a única defesa visível: a mensagem de motivo só
    // aparece depois que o dinheiro fecha, e um clique que não faz nada é pior
    // que um botão apagado.
    montar();
    expect(botaoSalvar()).toBeDisabled();
    expect(
      screen.getByText("Explique por que o rateio está mudando."),
    ).toBeInTheDocument();
  });

  it("salva mandando os centros e valores para a action", async () => {
    montar();
    escreverMotivo("Apólice mudou");
    expect(botaoSalvar()).toBeEnabled();

    await act(async () => {
      fireEvent.click(botaoSalvar());
    });

    expect(definirRateioLancamento).toHaveBeenCalledWith(
      "lanc-1",
      [
        { centroCustoId: CAVALO_03, valor: 60 },
        { centroCustoId: CAVALO_04, valor: 40 },
      ],
      "Apólice mudou",
    );
    expect(toastMock.success).toHaveBeenCalledWith("Rateio salvo");
  });

  it("avisa quanto falta e não deixa salvar com a soma aberta", () => {
    montar();
    escreverMotivo("Apólice mudou");
    fireEvent.change(screen.getByLabelText("Valor do rateio 2"), {
      target: { value: "10,00" },
    });

    // Comparado no `textContent` cru, e não por `getByText`: o BRL do Intl usa
    // espaço NÃO SEPARÁVEL depois do "R$", e a normalização de whitespace do
    // testing-library o troca por espaço comum só de um lado da comparação.
    expect(screen.getByRole("alert").textContent).toContain(
      `Faltam ${formatarBRL(30)} para fechar.`,
    );
    expect(botaoSalvar()).toBeDisabled();
  });

  it("fecha a diferença na última linha quando pedem", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Valor do rateio 1"), {
      target: { value: "70,00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Jogar na última linha" }));

    expect(screen.getByLabelText("Valor do rateio 2")).toHaveValue("30,00");
  });

  it("não deixa remover a última linha, que deixaria o lançamento sem centro", () => {
    montar({
      rateiosAtuais: [{ centroCustoId: CAVALO_03, valor: 100 }],
    });
    expect(screen.getByRole("button", { name: "Remover rateio 1" })).toBeDisabled();
  });

  it("avisa que reaprovar a OC desfaz a edição", () => {
    montar({ origem: "oc" });
    expect(
      screen.getByText(/Reaprovar a OC reescreve a divisão pelos itens dela/),
    ).toBeInTheDocument();
  });

  it("não avisa nada em lançamento manual, que não tem origem para reescrever", () => {
    montar({ origem: "manual" });
    expect(screen.queryByText(/desfaz esta edição/)).toBeNull();
  });

  it("avisa e não fecha quando a action recusa", async () => {
    vi.mocked(definirRateioLancamento).mockResolvedValueOnce({
      erro: "Competência fechada",
    });
    const onAbertoChange = vi.fn();
    montar({ onAbertoChange });
    escreverMotivo("Apólice mudou");

    await act(async () => {
      fireEvent.click(botaoSalvar());
    });

    expect(toastMock.error).toHaveBeenCalledWith("Competência fechada");
    expect(onAbertoChange).not.toHaveBeenCalled();
  });
});
