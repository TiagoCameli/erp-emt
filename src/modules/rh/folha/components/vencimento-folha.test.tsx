import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { formatarData } from "@/lib/formatadores";
import { VencimentoFolha } from "@/modules/rh/folha/components/vencimento-folha";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

// Server Action usa cookies(), que não existe fora de uma requisição.
type Dados = { folhaId: string; data: string };
const definir = vi.fn<(dados: Dados) => Promise<{ ok: true }>>(async () => ({
  ok: true,
}));
vi.mock("@/modules/rh/folha/actions", () => ({
  definirVencimentoDaFolha: (dados: Dados) => definir(dados),
}));

// Sem globals: true no vitest.config, o cleanup automático da RTL não roda.
afterEach(() => {
  cleanup();
  definir.mockClear();
});

const FOLHA = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

function campoData(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[type="date"]');
}

describe("VencimentoFolha", () => {
  it("em rascunho, com permissão, deixa editar a data", () => {
    render(
      <VencimentoFolha
        folhaId={FOLHA}
        status="rascunho"
        dataVencimento="2026-09-11"
        podeEditar
      />,
    );

    expect(campoData()?.value).toBe("2026-09-11");
  });

  it("fora do rascunho não tem campo: vira texto e diz por quê", () => {
    render(
      <VencimentoFolha
        folhaId={FOLHA}
        status="pendente_aprovacao"
        dataVencimento="2026-09-11"
        podeEditar
      />,
    );

    expect(campoData()).toBeNull();
    // Asserção pelo formatador, e não pela string literal: a data é exibida no
    // fuso de Rio Branco, e digitar "11/09/2026" à mão esconderia um erro de
    // fuso em vez de pegá-lo.
    expect(screen.getByText(formatarData("2026-09-11"))).toBeTruthy();
    expect(
      screen.getByText(/só muda com a folha em rascunho/i),
    ).toBeTruthy();
  });

  it("sem permissão de editar, o rascunho também é só leitura", () => {
    render(
      <VencimentoFolha
        folhaId={FOLHA}
        status="rascunho"
        dataVencimento="2026-09-11"
        podeEditar={false}
      />,
    );

    expect(campoData()).toBeNull();
  });

  it("sem data escolhida, diz que vale o dia dos parâmetros", () => {
    render(
      <VencimentoFolha
        folhaId={FOLHA}
        status="pendente_aprovacao"
        dataVencimento={null}
        podeEditar
      />,
    );

    expect(screen.getByText("Não definida")).toBeTruthy();
    expect(
      screen.getByText(/vale o dia de pagamento dos Parâmetros da folha/i),
    ).toBeTruthy();
  });

  it("Salvar só acorda quando a data muda, e manda o que está na tela", async () => {
    render(
      <VencimentoFolha
        folhaId={FOLHA}
        status="rascunho"
        dataVencimento="2026-09-11"
        podeEditar
      />,
    );

    const botao = screen.getByRole("button", { name: /salvar data/i });
    // Desabilitado de saída: gravar o que já está gravado daria um toast de
    // sucesso sobre nada acontecido.
    expect(botao).toHaveProperty("disabled", true);

    fireEvent.change(campoData()!, { target: { value: "2026-09-15" } });

    expect(botao).toHaveProperty("disabled", false);
    await act(async () => {
      fireEvent.click(botao);
    });

    expect(definir).toHaveBeenCalledWith({
      folhaId: FOLHA,
      data: "2026-09-15",
    });
  });

  it("apagar a data manda string vazia, que o schema vira null", async () => {
    render(
      <VencimentoFolha
        folhaId={FOLHA}
        status="rascunho"
        dataVencimento="2026-09-11"
        podeEditar
      />,
    );

    fireEvent.change(campoData()!, { target: { value: "" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /salvar data/i }));
    });

    // "" e não null: é o que um <input type="date"> esvaziado devolve, e o
    // schema é quem traduz para null. Mandar null daqui esconderia a tradução.
    expect(definir).toHaveBeenCalledWith({ folhaId: FOLHA, data: "" });
  });
});
