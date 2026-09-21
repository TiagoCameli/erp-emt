import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DefinirParcelasDialog } from "@/modules/financeiro/lancamentos/components/definir-parcelas-dialog";
import type { ParcelaGravada } from "@/modules/financeiro/lancamentos/parcelas-editaveis";

vi.mock("@/modules/financeiro/lancamentos/actions", () => ({
  definirParcelasLancamento: vi.fn(async () => ({ ok: true as const })),
  sugerirParcelasDoLancamento: vi.fn(async () => ({ parcelas: [] })),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/canonicos/toast", () => ({ toast: toastMock }));

/**
 * O diálogo de parcelas com um lançamento REAL do banco: doze parcelas já pagas
 * e uma em aberto (o financiamento que o Tiago tentou editar em 21/09/2026).
 *
 * O defeito: o bloco das já pagas não tinha teto de altura, então crescia com o
 * número de parcelas e não sobrava altura para a lista de baixo, a única que se
 * edita. O campo de vencimento ficava com uns poucos pixels, cortado ao meio
 * pela borda do diálogo, e "Adicionar parcela" parecia não fazer nada.
 *
 * **jsdom não faz layout**, então o esmagamento em si não dá para medir aqui: o
 * que estes testes travam é o que o conserta e é verificável — o teto e a
 * rolagem do bloco só-leitura, o piso da área editável, e o foco indo para a
 * linha nova. A altura de verdade se confere na tela.
 */
function parcelasPagas(quantas: number): ParcelaGravada[] {
  return Array.from({ length: quantas }, (_, i) => ({
    numeroParcela: i + 1,
    dataVencimento: `2025-${String((i % 12) + 1).padStart(2, "0")}-20`,
    valor: 1000,
    status: "pago",
  }));
}

const EM_ABERTO: ParcelaGravada = {
  numeroParcela: 13,
  dataVencimento: "2026-10-20",
  valor: 500,
  status: "pendente",
};

function montar(
  props: Partial<React.ComponentProps<typeof DefinirParcelasDialog>> = {},
) {
  return render(
    <DefinirParcelasDialog
      aberto
      onAbertoChange={() => {}}
      lancamentoId="lanc-1"
      valor={12500}
      origem="manual"
      parcelasAtuais={[...parcelasPagas(12), EM_ABERTO]}
      condicaoDescricao={null}
      {...props}
    />,
  );
}

const botaoAdicionar = () =>
  screen.getByRole("button", { name: "Adicionar parcela" });

/** Os campos de vencimento das parcelas EDITÁVEIS, na ordem da tela. */
function camposDeVencimento() {
  // `queryAll` e não `getAll`: lançamento com tudo pago abre a lista VAZIA, e o
  // teste precisa poder afirmar que ela está vazia em vez de estourar.
  return screen.queryAllByLabelText(/^Vencimento da parcela/);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DefinirParcelasDialog: dá para ver e mexer nas parcelas em aberto", () => {
  it("as já pagas ficam num bloco com teto e rolagem próprios", () => {
    // Sem isto, doze parcelas pagas empurram a área editável para fora da tela.
    // É proxy do layout (jsdom não mede altura), mas trava exatamente a classe
    // cuja falta causou o defeito.
    montar();
    const bloco = screen.getByText(/12 já pagas ou aprovadas/).parentElement!;
    expect(bloco.className).toContain("overflow-y-auto");
    expect(bloco.className).toMatch(/max-h-/);
  });

  it("a área editável tem PISO de altura, e não autorização para encolher", () => {
    // `min-h-0` num flex item é a licença para ele ser espremido até zero. Na
    // única parte editável do diálogo, isso é o defeito, não o conserto.
    montar();
    const area = camposDeVencimento()[0]!.closest(".overflow-y-auto")!;
    expect(area.className).toMatch(/min-h-\[/);
    expect(area.className).not.toContain("min-h-0");
  });

  it("a lista editável se apresenta, com a contagem do que está em aberto", () => {
    // Duas listas de parcelas sem nome, uma embaixo da outra, não dizem onde é
    // que se mexe.
    montar();
    expect(screen.getByText(/Em aberto · 1 parcela/)).toBeTruthy();
  });

  it("adicionar parcela cria a linha E leva o cursor até ela", () => {
    montar();
    expect(camposDeVencimento()).toHaveLength(1);

    fireEvent.click(botaoAdicionar());

    const campos = camposDeVencimento();
    expect(campos).toHaveLength(2);
    // O foco é o que faz o botão parecer ter funcionado: a linha nova nasce no
    // fim de uma área que rola, fora do campo de visão de quem clicou.
    expect(document.activeElement).toBe(campos[1]);
    expect((campos[1] as HTMLInputElement).value).toBe("");
  });

  it("a numeração da linha nova continua a das pagas", () => {
    // Doze pagas e uma em aberto: a próxima é a 14, não a 2.
    montar();
    fireEvent.click(botaoAdicionar());
    expect(
      screen.getByLabelText("Vencimento da parcela 14"),
    ).toBeTruthy();
  });

  it("digitar numa parcela não rouba o foco para a última linha", () => {
    // O efeito do foco olha o TAMANHO da lista; se olhasse qualquer mudança,
    // cada tecla digitada no valor da primeira parcela jogaria o cursor para a
    // última.
    montar();
    fireEvent.click(botaoAdicionar());

    const primeiro = camposDeVencimento()[0]!;
    primeiro.focus();
    fireEvent.change(primeiro, { target: { value: "2026-11-20" } });

    expect(document.activeElement).toBe(primeiro);
  });

  it("sem parcela nenhuma em aberto, o botão ainda cria a primeira", () => {
    // Lançamento com tudo pago: a lista abre vazia, e é só pelo botão que se
    // acrescenta a próxima.
    montar({ parcelasAtuais: parcelasPagas(12) });
    expect(camposDeVencimento()).toHaveLength(0);

    fireEvent.click(botaoAdicionar());

    const campos = camposDeVencimento();
    expect(campos).toHaveLength(1);
    expect(document.activeElement).toBe(campos[0]);
  });
});
