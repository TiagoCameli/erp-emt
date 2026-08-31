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
