import { describe, expect, it } from "vitest";

import { enderecoCelula, lerCelula, numeroParaTexto } from "./leitor";

describe("lerCelula", () => {
  it("número vira texto sem arredondar (casas escondidas)", () => {
    expect(lerCelula(580.8642996)).toEqual({ tipo: "numero", texto: "580.8642996" });
    expect(lerCelula(17057.717)).toEqual({ tipo: "numero", texto: "17057.717" });
  });

  it("fórmula usa o resultado guardado no arquivo", () => {
    expect(lerCelula({ formula: "D5*E5", result: 9908218.84 })).toEqual({ tipo: "numero", texto: "9908218.84" });
  });

  it("fórmula sem valor calculado é marcada, nunca vira zero", () => {
    expect(lerCelula({ formula: "D5*E5", result: undefined } as never)).toEqual({ tipo: "formula_sem_valor" });
  });

  it("erro de fórmula é marcado", () => {
    expect(lerCelula({ formula: "D5/0", result: { error: "#DIV/0!" } } as never)).toEqual({ tipo: "erro", bruto: "#DIV/0!" });
  });

  it("texto fica como veio, com o espaço sobrando", () => {
    expect(lerCelula("un ")).toEqual({ tipo: "texto", bruto: "un " });
    expect(lerCelula("1.234,56")).toEqual({ tipo: "texto", bruto: "1.234,56" });
  });

  it("vazio é vazio, e não zero", () => {
    expect(lerCelula(null)).toEqual({ tipo: "vazia" });
    expect(lerCelula(undefined as never)).toEqual({ tipo: "vazia" });
    expect(lerCelula("   ")).toEqual({ tipo: "vazia" });
    expect(lerCelula(0)).toEqual({ tipo: "numero", texto: "0" });
  });

  it("número com expoente é marcado, sem derrubar a leitura do arquivo", () => {
    expect(lerCelula(1e-7)).toEqual({ tipo: "numero_fora_da_faixa", bruto: "1e-7" });
    expect(lerCelula(1e21)).toEqual({ tipo: "numero_fora_da_faixa", bruto: "1e+21" });
    expect(lerCelula({ formula: "D5*E5", result: 1e-9 } as never)).toEqual({ tipo: "numero_fora_da_faixa", bruto: "1e-9" });
  });

  it("rich text vira o texto emendado", () => {
    expect(lerCelula({ richText: [{ text: "Imprima" }, { text: "ção" }] } as never)).toEqual({ tipo: "texto", bruto: "Imprimação" });
  });
});

describe("numeroParaTexto", () => {
  it("recusa número que precisaria de expoente", () => {
    expect(() => numeroParaTexto(1e-7)).toThrow("fora da faixa");
    expect(() => numeroParaTexto(1e21)).toThrow("fora da faixa");
  });
});

describe("enderecoCelula", () => {
  it("monta o endereço do Excel", () => {
    expect(enderecoCelula(12, 6)).toBe("F12");
    expect(enderecoCelula(3, 28)).toBe("AB3");
  });
});
