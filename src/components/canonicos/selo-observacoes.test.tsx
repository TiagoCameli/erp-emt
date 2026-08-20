import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SeloObservacoes } from "@/components/canonicos/selo-observacoes";

afterEach(() => cleanup());

/**
 * O selo existe para responder de relance "esta linha tem recado?". Diferente do
 * `SeloAnexos`, aqui o CONTEÚDO importa: a observação da OC traz chave PIX, CNPJ
 * e data combinada de pagamento, e o texto vai no aria-label justamente para que
 * quem usa leitor de tela receba a mesma coisa que quem para o mouse em cima.
 *
 * O tooltip em si é do Radix e só monta no hover, então o que estes casos
 * guardam é a REGRA do sinal e do texto que ele carrega. Quem confere que o
 * balão aparece na posição certa é o navegador.
 */
describe("SeloObservacoes", () => {
  it("não desenha nada sem observação", () => {
    const { container } = render(<SeloObservacoes observacoes={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Campo ausente é a linha que a query não trouxe (o drawer aberto pela aba
   * Programados é o caso). Sinal dizendo "tem recado" onde ninguém leu nada é
   * pior que sinal nenhum.
   */
  it("não desenha nada quando o campo não veio", () => {
    const { container } = render(<SeloObservacoes observacoes={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Só branco não é observação. É o mesmo corte que o banco faz na aprovação da
   * OC, e ele precisa existir aqui também: a checagem ingênua (`observacoes ?`)
   * considera " " verdadeiro e desenharia um balão com um tooltip vazio.
   */
  it("não desenha nada com só espaços, tabs e quebras de linha", () => {
    const { container } = render(<SeloObservacoes observacoes={"  \n \t "} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("desenha o selo com o texto da observação no rótulo acessível", () => {
    render(<SeloObservacoes observacoes="Chave PIX CNPJ: 11137434000154" />);
    expect(
      screen.getByRole("img", {
        name: "Tem observação: Chave PIX CNPJ: 11137434000154",
      }),
    ).toBeInTheDocument();
  });

  /**
   * O rótulo carrega o texto INTEIRO, sem o corte de 600 caracteres do tooltip:
   * o corte é uma decisão de layout do balão, e leitor de tela não tem balão.
   * Cortar ali faria quem usa leitor perder o fim da observação sem nem saber.
   */
  it("o rótulo acessível não sofre o corte do tooltip", () => {
    const longa = `${"a".repeat(700)}FIM`;
    render(<SeloObservacoes observacoes={longa} />);
    expect(
      screen.getByRole("img", { name: `Tem observação: ${longa}` }),
    ).toBeInTheDocument();
  });

  /** A observação multilinha chega inteira: é ela que tem CNPJ e PIX separados. */
  it("preserva as quebras de linha da observação", () => {
    const texto = "PAGAMENTO DIA 19/08\nCNPJ: 11137434000154";
    render(<SeloObservacoes observacoes={texto} />);
    const selo = screen.getByRole("img");
    expect(selo).toHaveAttribute("aria-label", `Tem observação: ${texto}`);
  });
});
