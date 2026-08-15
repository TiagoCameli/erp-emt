import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";

const set = vi.fn();

// Só o hook da URL é trocado: o Combobox continua o de verdade, senão o teste
// não veria o comportamento que interessa (marcar dentro do painel).
vi.mock("@/components/canonicos", async (importarOriginal) => {
  const original =
    await importarOriginal<typeof import("@/components/canonicos")>();
  return { ...original, useFiltrosUrl: () => ({ set, get: vi.fn(), setMuitos: vi.fn() }) };
});

import { SeletorFornecedor } from "@/modules/financeiro/relatorios/components/seletor-fornecedor";

// Sem o layout falso o virtualizador não desenha linha nenhuma no jsdom.
beforeAll(instalarLayoutDeLista);

afterEach(() => {
  cleanup();
  set.mockClear();
});

const FORNECEDORES = [
  { id: "id-a", nome: "Alfa Materiais" },
  { id: "id-b", nome: "Beta Transportes" },
  { id: "id-c", nome: "Gama Combustíveis" },
];

/**
 * O defeito que o Tiago pegou: "não consigo selecionar mais de um fornecedor".
 *
 * A causa era a gravação na URL ser assíncrona. O componente recebia `valores` do
 * servidor, e o segundo clique (antes da volta) partia da lista ANTIGA e gravava
 * só ele, apagando o primeiro. Marcar devagar funcionava; marcar rápido, não — foi
 * por isso que passou no meu teste manual.
 *
 * Aqui o `set` é espião e NUNCA devolve props novas, que é exatamente o pior caso:
 * a resposta do servidor demorando. Se o componente depender só da prop, o segundo
 * clique volta com um id só e o teste quebra.
 */
describe("SeletorFornecedor: marcar vários seguidos", () => {
  function abrir(valores: string[] = []) {
    render(
      <SeletorFornecedor fornecedores={FORNECEDORES} valores={valores} />,
    );
    fireEvent.click(screen.getByRole("combobox"));
  }

  /**
   * Sempre DENTRO da lista: com um selecionado, o gatilho passa a mostrar o nome
   * dele e a busca solta acharia dois nós.
   */
  function linha(nome: string) {
    const encontrada = within(screen.getByRole("listbox"))
      .getByText(nome)
      .closest('[role="option"]');
    if (!encontrada) throw new Error(`linha "${nome}" não encontrada`);
    return encontrada;
  }

  it("dois cliques seguidos SOMAM, mesmo sem a volta do servidor", () => {
    abrir([]);
    fireEvent.click(linha("Alfa Materiais"));
    fireEvent.click(linha("Beta Transportes"));

    expect(set).toHaveBeenNthCalledWith(1, "fornecedor", "id-a");
    expect(set).toHaveBeenNthCalledWith(2, "fornecedor", "id-a,id-b");
  });

  it("três seguidos continuam somando", () => {
    abrir([]);
    fireEvent.click(linha("Alfa Materiais"));
    fireEvent.click(linha("Beta Transportes"));
    fireEvent.click(linha("Gama Combustíveis"));

    expect(set).toHaveBeenLastCalledWith("fornecedor", "id-a,id-b,id-c");
  });

  it("desmarcar tira só aquele, sem derrubar os outros", () => {
    abrir(["id-a", "id-b"]);
    fireEvent.click(linha("Alfa Materiais"));

    expect(set).toHaveBeenLastCalledWith("fornecedor", "id-b");
  });

  it("marcar e desmarcar o mesmo volta para todos (parâmetro removido)", () => {
    abrir([]);
    fireEvent.click(linha("Alfa Materiais"));
    fireEvent.click(linha("Alfa Materiais"));

    expect(set).toHaveBeenLastCalledWith("fornecedor", null);
  });

  it("a caixinha marca na hora, sem esperar o servidor", () => {
    abrir([]);
    expect(linha("Beta Transportes")).toHaveAttribute("aria-selected", "false");

    fireEvent.click(linha("Beta Transportes"));

    expect(linha("Beta Transportes")).toHaveAttribute("aria-selected", "true");
  });

  it("seleção que vem do servidor (link colado) é respeitada", () => {
    abrir(["id-c"]);
    expect(linha("Gama Combustíveis")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
