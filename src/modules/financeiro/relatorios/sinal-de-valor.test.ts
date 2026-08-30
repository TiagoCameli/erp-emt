import { describe, expect, it } from "vitest";

import {
  classeDoSinal,
  sinalDaVariacaoDeCusto,
  sinalDoResultado,
} from "@/modules/financeiro/relatorios/relatorios";

/**
 * Cor de número não empresta o vocabulário da máquina de status.
 *
 * O DRE pintava superávit de `text-status-aprovado` e déficit de
 * `text-status-rejeitado`; o Custo por centro de custo fazia o mesmo com a
 * variação. Aqueles dois hexes querem dizer "isto passou pela aprovação" e
 * "rejeitado ou vencido" no app inteiro — superávit não passou por aprovação
 * nenhuma, e custo que subiu não foi rejeitado por ninguém.
 */
describe("sinal de um valor", () => {
  it("resultado: sobrar é a favor, faltar é contra, zero é neutro", () => {
    expect(sinalDoResultado(1)).toBe("favoravel");
    expect(sinalDoResultado(-1)).toBe("desfavoravel");
    expect(sinalDoResultado(0)).toBe("neutro");
  });

  it("variação de custo anda ao contrário: subir é contra", () => {
    // É a diferença que mais engana. No resultado, número positivo é bom; na
    // variação de custo, positivo quer dizer que a obra gastou mais.
    expect(sinalDaVariacaoDeCusto(1)).toBe("desfavoravel");
    expect(sinalDaVariacaoDeCusto(-1)).toBe("favoravel");
    expect(sinalDaVariacaoDeCusto(0)).toBe("neutro");
  });

  it("nenhum sinal usa cor de status", () => {
    const classes = [
      classeDoSinal("favoravel"),
      classeDoSinal("desfavoravel"),
      classeDoSinal("neutro"),
    ];
    for (const classe of classes) {
      expect(classe).not.toContain("status-aprovado");
      expect(classe).not.toContain("status-rejeitado");
      expect(classe).not.toContain("status-");
    }
  });

  it("os três sinais são distinguíveis entre si", () => {
    // Linha de controle: devolver a mesma classe para tudo passaria no teste
    // acima e apagaria a informação da coluna.
    const classes = new Set([
      classeDoSinal("favoravel"),
      classeDoSinal("desfavoravel"),
      classeDoSinal("neutro"),
    ]);
    expect(classes.size).toBe(3);
  });
});
