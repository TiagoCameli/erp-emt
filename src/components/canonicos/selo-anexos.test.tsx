import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SeloAnexos } from "@/components/canonicos/selo-anexos";

afterEach(() => cleanup());

/**
 * O selo existe para responder de relance "esta linha tem a nota junto?". O que
 * estes casos guardam é a regra do sinal: aparece quando há anexo, some quando
 * não há, e diz quantos são para quem parar em cima.
 */
describe("SeloAnexos", () => {
  it("não desenha nada quando não há anexo", () => {
    const { container } = render(<SeloAnexos quantidade={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Nulo é o caso da listagem que ainda não sabe a contagem, e undefined é o da
   * linha antiga sem o campo. Nenhum dos dois pode virar um clipe: um sinal
   * dizendo "tem anexo" onde ninguém contou nada é pior que sinal nenhum.
   */
  it("não desenha nada com contagem nula ou ausente", () => {
    const { container: comNulo } = render(<SeloAnexos quantidade={null} />);
    expect(comNulo).toBeEmptyDOMElement();

    const { container: semNada } = render(<SeloAnexos quantidade={undefined} />);
    expect(semNada).toBeEmptyDOMElement();
  });

  it("desenha o clipe quando há anexo", () => {
    render(<SeloAnexos quantidade={3} />);
    expect(screen.getByRole("img", { name: "3 anexos" })).toBeInTheDocument();
  });

  /** Um anexo é "1 anexo", não "1 anexos". */
  it("usa o singular com um anexo só", () => {
    render(<SeloAnexos quantidade={1} />);
    expect(screen.getByRole("img", { name: "1 anexo" })).toBeInTheDocument();
  });

  /**
   * O title é o que o mouse mostra e o aria-label é o que o leitor de tela lê:
   * os dois têm que dizer a mesma coisa, senão uma das duas pessoas recebe uma
   * versão pior da informação.
   */
  it("o texto do mouse e o do leitor de tela são o mesmo", () => {
    render(<SeloAnexos quantidade={2} />);
    const selo = screen.getByRole("img", { name: "2 anexos" });
    expect(selo).toHaveAttribute("title", "2 anexos");
  });
});
