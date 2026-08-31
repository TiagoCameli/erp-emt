import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

/**
 * A barra de aprovação quando a Server Action NÃO devolve `{ erro }`: ela lança.
 *
 * O contrato das actions é devolver `{ erro }`, e as telas tratam isso com
 * toast. Mas há um caminho em que nada disso roda: a action nem chega a
 * executar. O POST dela pode falhar por rede caída, por 504 do servidor, ou —
 * o caso real aqui — porque o build de produção mudou depois de a página ter
 * sido aberta, e o id da Server Action que o cliente antigo manda não existe
 * mais no build novo. Nesses casos o `await` REJEITA.
 *
 * Sem `catch`, essa rejeição morre como unhandled rejection: nenhum toast,
 * nenhuma mudança de estado, e NENHUM pedido chega ao banco. Do lado de quem
 * clicou, o botão pisca e o mundo fica igual — foi exatamente o que aconteceu
 * na aprovação da folha de 08/2026 (a `fn_aprovar_folha` não aparece uma vez
 * nos logs do banco, mesmo com a pessoa clicando).
 *
 * Aprovar é botão de dinheiro: quem clica precisa saber que NÃO aprovou. Vale a
 * doutrina que já está escrita na própria folha, no `aoCopiarMensagem`:
 * "avisar é melhor que o silêncio de um botão que parece ter funcionado".
 */

const erros: string[] = [];
const sucessos: string[] = [];
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    success: (m: string) => sucessos.push(m),
    error: (m: string) => erros.push(m),
    warning: () => {},
    info: () => {},
  },
  DURACAO_TOAST: { sucesso: 2000, info: 3000, aviso: 5000, erro: 6000 },
}));

import { ApprovalBar } from "@/components/canonicos/approval-bar";

/** O erro que o Next lança quando o id da action não existe no build novo. */
function acaoQueLanca() {
  return vi.fn().mockRejectedValue(
    new Error("Failed to find Server Action 'abc123'."),
  );
}

function montar(props: Partial<React.ComponentProps<typeof ApprovalBar>> = {}) {
  const padrao = {
    status: "pendente_aprovacao",
    podeAprovar: true,
    podeDesaprovar: false,
    onAprovar: vi.fn(),
    onRejeitar: vi.fn(),
    onDesaprovar: vi.fn(),
  };
  return render(<ApprovalBar {...padrao} {...props} />);
}

beforeEach(() => {
  erros.length = 0;
  sucessos.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("ApprovalBar quando a action lança", () => {
  it("avisa quem clicou em Aprovar, em vez de ficar em silêncio", async () => {
    const onAprovar = acaoQueLanca();
    montar({ onAprovar });

    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));

    await waitFor(() => expect(onAprovar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(erros.length).toBe(1));
    // A mensagem tem que dizer o que fazer: recarregar é o que resolve o id
    // de action velho, e é a única saída que a pessoa tem na mão.
    expect(erros[0]).toMatch(/recarregue/i);
    // E não pode anunciar sucesso do que não aconteceu.
    expect(sucessos).toEqual([]);
  });

  it("devolve o botão Aprovar ao normal, para dar outra tentativa", async () => {
    montar({ onAprovar: acaoQueLanca() });

    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));

    await waitFor(() => expect(erros.length).toBe(1));
    const botao = screen.getByRole("button", { name: "Aprovar" });
    expect(botao).not.toBeDisabled();
  });

  it("avisa também no caminho do diálogo, que pede motivo", async () => {
    const onRejeitar = acaoQueLanca();
    montar({ onRejeitar });

    fireEvent.click(screen.getByRole("button", { name: "Rejeitar" }));
    const motivo = await screen.findByLabelText("Motivo");
    fireEvent.change(motivo, { target: { value: "faltou conferir" } });
    // Dois botões "Rejeitar" na tela agora (o da barra e o do diálogo): o de
    // confirmar é o que está DENTRO do diálogo.
    const dialogo = screen.getByRole("dialog");
    const confirmar = [...dialogo.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Rejeitar",
    );
    expect(confirmar).toBeTruthy();
    fireEvent.click(confirmar!);

    await waitFor(() => expect(onRejeitar).toHaveBeenCalled());
    await waitFor(() => expect(erros.length).toBe(1));
    expect(erros[0]).toMatch(/recarregue/i);
  });
});

/**
 * Layout no celular.
 *
 * jsdom não faz layout, então aqui não se mede pixel: o que estes testes
 * trancam é o CONTRATO de classes que impede o botão de sair da tela. A medição
 * de verdade foi feita em produção, na folha de 08/2026: a barra de uma linha só
 * exigia 816 px de largura mínima (badge 154 + quatro botões 590 + vãos +
 * recuo), com `flex-nowrap` nos dois níveis — num telefone de 390-414 px o
 * "Aprovar", que é o último da fila, ficava uns 400 px FORA da tela.
 */
describe("ApprovalBar no celular", () => {
  it("empilha a barra e deixa a fila de ações quebrar linha", () => {
    montar();
    const barra = screen
      .getByRole("button", { name: "Aprovar" })
      .closest("div.rounded-md");
    expect(barra).toBeTruthy();
    // Empilhado por padrão; uma linha só a partir de `sm`.
    expect(barra!.className).toContain("flex-col");
    expect(barra!.className).toContain("sm:flex-row");

    // Sem `flex-wrap` o botão sai da tela em vez de descer de linha.
    const acoes = screen.getByRole("button", { name: "Aprovar" }).parentElement;
    expect(acoes!.className).toContain("flex-wrap");
  });

  it("nunca desliga a quebra de linha, em nenhuma largura", () => {
    montar();
    const acoes = screen.getByRole("button", { name: "Aprovar" }).parentElement!;
    /*
     * Esta é a regressão que a medição pegou: com `sm:flex-nowrap` a barra
     * voltava a uma linha só a partir de 640 px, mas a linha exige 816 px —
     * então entre 640 e 816 px dois botões saíam da tela de novo, um deles o
     * Aprovar. Tablet, notebook pequeno e telefone deitado caem nessa faixa.
     *
     * Medido depois de tirar o `nowrap`, com o CSS compilado do app: de 360 a
     * 1512 px, zero botão fora da tela, zero não clicável, zero scroll
     * horizontal (4 linhas em 360, 2 até 768, 1 de 820 para cima).
     */
    expect(acoes.className).not.toContain("flex-nowrap");
  });

  it("dá ao Aprovar linha própria e alvo de toque de 44px no celular", () => {
    montar();
    const aprovar = screen.getByRole("button", { name: "Aprovar" });
    // Linha própria: não divide linha com o botão de devolver.
    expect(aprovar.className).toContain("max-sm:basis-full");

    // h-11 = 44px, o mínimo de alvo de toque.
    const acoes = aprovar.parentElement!;
    expect(acoes.className).toContain("max-sm:[&>button]:h-11");
    expect(acoes.className).toContain("max-sm:[&>button]:flex-1");
  });

  it("não fixa altura de botão para o desktop", () => {
    montar();
    const acoes = screen.getByRole("button", { name: "Aprovar" }).parentElement!;
    // Um par `h-11 sm:h-9` fixaria a altura do desktop aqui e passaria a mentir
    // no dia que o tamanho padrão do Button mudar. Só `max-sm:` é o certo.
    expect(acoes.className).not.toMatch(/(^|\s)h-11/);
    expect(acoes.className).not.toContain("sm:[&>button]:h-9");
  });
});
