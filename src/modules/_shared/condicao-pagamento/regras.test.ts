import { describe, expect, it } from "vitest";

import { parcelasDoNome } from "./regras";

/**
 * `salvar_condicao` recusa a condição se a soma dos percentuais não fechar
 * 100,00 exatos. O nome é digitado à mão por quem está no meio de uma OC ou de
 * um lançamento, então o que não pode acontecer é a criação falhar por causa de
 * arredondamento: é o teste que mais importa aqui.
 */
describe("parcelasDoNome", () => {
  it("uma parcela: o número é o prazo e leva os 100%", () => {
    expect(parcelasDoNome("15 dias")).toEqual([
      { dias_offset: 15, percentual: 100 },
    ]);
  });

  it("divide o total entre os prazos, na ordem em que foram escritos", () => {
    expect(parcelasDoNome("30/60 dias")).toEqual([
      { dias_offset: 30, percentual: 50 },
      { dias_offset: 60, percentual: 50 },
    ]);
  });

  it("a última parcela absorve a sobra do arredondamento", () => {
    expect(parcelasDoNome("30/60/90")).toEqual([
      { dias_offset: 30, percentual: 33.33 },
      { dias_offset: 60, percentual: 33.33 },
      { dias_offset: 90, percentual: 33.34 },
    ]);
  });

  it("sem número reconhecido cai em à vista", () => {
    expect(parcelasDoNome("à vista")).toEqual([
      { dias_offset: 0, percentual: 100 },
    ]);
    expect(parcelasDoNome("na entrega")).toEqual([
      { dias_offset: 0, percentual: 100 },
    ]);
  });

  it("lê o prazo mesmo com texto em volta", () => {
    expect(parcelasDoNome("Boleto 28/56/84 dias fora quinzena")).toEqual([
      { dias_offset: 28, percentual: 33.33 },
      { dias_offset: 56, percentual: 33.33 },
      { dias_offset: 84, percentual: 33.34 },
    ]);
  });

  it("fecha em 100 para qualquer quantidade de parcelas", () => {
    for (let k = 1; k <= 12; k += 1) {
      const nome = Array.from({ length: k }, (_, i) => (i + 1) * 30).join("/");
      const soma = parcelasDoNome(nome).reduce(
        (total, parcela) => total + parcela.percentual,
        0,
      );
      // A soma é comparada em centavos porque é assim que o banco valida
      // (round(soma, 2) <> 100.00), e não em ponto flutuante cru.
      expect(Number(soma.toFixed(2))).toBe(100);
    }
  });

  it("prazo repetido não é inventado nem removido: vira parcela mesmo", () => {
    // "30/30 dias" é entrada esquisita, mas quem digitou espera duas parcelas, e
    // salvar_condicao renumera por dias_offset sem reclamar de empate.
    expect(parcelasDoNome("30/30 dias")).toEqual([
      { dias_offset: 30, percentual: 50 },
      { dias_offset: 30, percentual: 50 },
    ]);
  });
});
