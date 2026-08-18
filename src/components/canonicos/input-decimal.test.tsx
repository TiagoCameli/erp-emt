import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";

import { InputDecimal } from "@/components/canonicos/input-numerico";

afterEach(cleanup);

/**
 * O teste usa `form.register` de propósito: é assim que os 27 campos de valor do
 * app estão escritos, e é justamente o caminho em que o valor NÃO passava por
 * normalização nenhuma antes de chegar no schema.
 *
 * O `<output>` mostra o que o formulário GUARDOU no envio — não o que está na
 * tela. É essa string que o `paraNumero` de cada schema vai converter.
 */
function Formulario({ casas }: { casas?: number }) {
  const form = useForm<{ valor: string }>({ defaultValues: { valor: "" } });
  const [guardado, setGuardado] = React.useState("");
  return (
    <form onSubmit={form.handleSubmit((dados) => setGuardado(dados.valor))}>
      <InputDecimal
        aria-label="Valor"
        casas={casas}
        {...form.register("valor")}
      />
      <button type="submit">enviar</button>
      <output data-testid="guardado">{guardado}</output>
    </form>
  );
}

function campo() {
  return screen.getByLabelText("Valor") as HTMLInputElement;
}

/** Digita tecla por tecla, como uma pessoa faz. */
function digitar(texto: string) {
  const input = campo();
  for (const tecla of texto) {
    fireEvent.change(input, { target: { value: input.value + tecla } });
  }
  return input;
}

/**
 * O que o react-hook-form entrega ao schema depois de sair do campo.
 *
 * Limpa antes de renderizar para poder ser chamada várias vezes no mesmo teste
 * sem deixar dois campos com o mesmo rótulo na tela.
 */
function aoSairDoCampo(texto: string, casas?: number): string {
  cleanup();
  render(<Formulario casas={casas} />);
  const input = digitar(texto);
  fireEvent.blur(input);
  return input.value;
}

describe("InputDecimal: o ponto do teclado numérico", () => {
  it("aparece como vírgula enquanto a pessoa digita", () => {
    render(<Formulario />);
    const input = digitar("2194.56");
    expect(input.value).toBe("2194,56");
  });

  it("vírgula digitada continua vírgula", () => {
    render(<Formulario />);
    expect(digitar("2194,56").value).toBe("2194,56");
  });

  it("no meio da digitação, o último separador vence", () => {
    render(<Formulario />);
    // "1.234.567,89" no teclado numérico.
    expect(digitar("1.234.567,89").value).toBe("1234567,89");
  });
});

describe("InputDecimal: o valor que chega no schema", () => {
  it("dinheiro digitado com ponto decimal", () => {
    expect(aoSairDoCampo("2194.56")).toBe("2194,56");
  });

  it("MIL E QUINHENTOS não pode virar um e meio", () => {
    // O risco que a troca na tecla cria: "1.500" passa a aparecer como "1,500",
    // e todo `paraNumero` do app leria 1,5 -- mil vezes menos. A normalização ao
    // sair do campo desfaz isso, porque dinheiro não tem três centavos.
    expect(aoSairDoCampo("1.500")).toBe("1500");
    expect(aoSairDoCampo("1.234.567")).toBe("1234567");
    expect(aoSairDoCampo("12.345,67")).toBe("12345,67");
  });

  it("percentual tem 3 casas: 1,5 continua 1,5", () => {
    // Espelho do caso acima. Em `numeric(6,3)` "1,500" é 1,5 de verdade, e ler
    // como 1500 transformaria 1,5% em 1500%.
    expect(aoSairDoCampo("1.500", 3)).toBe("1,500");
    expect(aoSairDoCampo("8.33", 3)).toBe("8,33");
  });

  it("valor sem separador nenhum atravessa intacto", () => {
    expect(aoSairDoCampo("1500")).toBe("1500");
    expect(aoSairDoCampo("0")).toBe("0");
  });

  it("centavos com zero à esquerda não são confundidos com milhar", () => {
    expect(aoSairDoCampo("0.50")).toBe("0,50");
  });

  it("texto que não é número fica como a pessoa escreveu", () => {
    // Quem reclama é a validação da tela, não o campo apagando o que foi digitado.
    expect(aoSairDoCampo("abc")).toBe("abc");
  });
});

describe("InputDecimal: Enter envia normalizado", () => {
  it("Enter sem passar pelo blur não manda o valor cru", () => {
    // Este era o furo: Enter envia o formulário SEM disparar blur, então o
    // schema receberia "1,500" e gravaria 1,5.
    render(<Formulario />);
    const input = digitar("1.500");
    expect(input.value).toBe("1,500");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("1500");
  });

  it("o formulário guarda o valor normalizado, não o da tela", async () => {
    render(<Formulario />);
    const input = digitar("2194.56");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "enviar" }));

    await screen.findByText("2194,56");
    expect(screen.getByTestId("guardado")).toHaveTextContent("2194,56");
  });

  it("outra tecla não normaliza no meio da digitação", () => {
    render(<Formulario />);
    const input = digitar("1.5");
    fireEvent.keyDown(input, { key: "0" });
    // Continua editável: normalizar aqui apagaria a vírgula que a pessoa
    // acabou de pôr e que ela ainda vai completar.
    expect(input.value).toBe("1,5");
  });
});
