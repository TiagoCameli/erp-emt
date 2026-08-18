import { describe, expect, it } from "vitest";

import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";

const A = "550e8400-e29b-41d4-a716-446655440000";
const B = "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b";

describe("lerIdsDoEspelho", () => {
  it("sem parâmetro devolve nada para imprimir", () => {
    expect(lerIdsDoEspelho(undefined)).toEqual({
      ids: [],
      invalidos: 0,
      excedeu: false,
    });
  });

  it("parâmetro vazio devolve nada para imprimir", () => {
    expect(lerIdsDoEspelho("")).toEqual({
      ids: [],
      invalidos: 0,
      excedeu: false,
    });
  });

  it("lê os ids separados por vírgula, na ordem em que vieram", () => {
    expect(lerIdsDoEspelho(`${A},${B}`).ids).toEqual([A, B]);
  });

  it("tolera espaço em volta da vírgula, que link colado à mão costuma ter", () => {
    expect(lerIdsDoEspelho(` ${A} , ${B} `).ids).toEqual([A, B]);
  });

  it("conta o que não é id e segue com o resto, em vez de derrubar a impressão", () => {
    const lido = lerIdsDoEspelho(`${A},nao-e-id,${B}`);
    expect(lido.ids).toEqual([A, B]);
    expect(lido.invalidos).toBe(1);
  });

  it("não repete id, porque repetido imprimiria a mesma folha duas vezes", () => {
    expect(lerIdsDoEspelho(`${A},${A}`).ids).toEqual([A]);
  });

  it("aceita o id derivado de md5 da carga do maiscontrole", () => {
    // Caso real em produção: variante 7 e versão 8, o que z.uuid() recusa.
    // Recusar aqui seria recusar justamente o histórico que o espelho existe
    // para imprimir, E passaria em todo teste escrito com uuid novo.
    const md5 = "c4e0f922-3aec-8c72-7089-225523e04557";
    expect(lerIdsDoEspelho(md5).ids).toEqual([md5]);
  });

  it("acima do limite marca excedeu, sem truncar em silêncio", () => {
    const muitos = Array.from(
      { length: MAX_ESPELHOS + 1 },
      (_, i) => `550e8400-e29b-41d4-a716-4466554${String(i).padStart(5, "0")}`,
    );
    const lido = lerIdsDoEspelho(muitos.join(","));
    expect(lido.excedeu).toBe(true);
    // Os ids continuam aí: quem chama decide recusar. Truncar aqui faria o
    // papel parecer completo quando não é.
    expect(lido.ids).toHaveLength(MAX_ESPELHOS + 1);
  });

  it("exatamente no limite não excede", () => {
    const noLimite = Array.from(
      { length: MAX_ESPELHOS },
      (_, i) => `550e8400-e29b-41d4-a716-4466554${String(i).padStart(5, "0")}`,
    );
    expect(lerIdsDoEspelho(noLimite.join(",")).excedeu).toBe(false);
  });
});
