import { describe, expect, it } from "vitest";

import { paraEstadoMapa } from "@/modules/mapa/dados";
import {
  diaristaFormSchema,
  entrarDiaristaSchema,
} from "@/modules/mapa/schemas";

const ID = "6f1c2b9e-3d4a-4c8b-9e2f-1a2b3c4d5e6f";

describe("Adicionar diarista", () => {
  it("aceita um diarista do RH ou um novo, e recusa nenhum dos dois", () => {
    expect(entrarDiaristaSchema.safeParse({ colaboradorId: ID }).success).toBe(
      true,
    );
    expect(
      entrarDiaristaSchema.safeParse({
        colaboradorId: null,
        novo: { nome: "Fulano" },
      }).success,
    ).toBe(true);
    const nada = entrarDiaristaSchema.safeParse({
      colaboradorId: null,
      novo: null,
    });
    expect(nada.success).toBe(false);
    expect(nada.error?.issues[0]?.message).toBe(
      "Escolha o diarista ou cadastre um novo",
    );
  });

  it("o formulário cobra o campo da origem escolhida", () => {
    const base = { colaboradorId: "", nome: "", cpf: "", funcaoId: "" };
    const existente = diaristaFormSchema.safeParse({
      ...base,
      origem: "existente",
    });
    expect(existente.error?.issues.map((i) => i.path[0])).toEqual([
      "colaboradorId",
    ]);
    const novo = diaristaFormSchema.safeParse({ ...base, origem: "novo" });
    expect(novo.error?.issues.map((i) => i.path[0])).toEqual(["nome"]);
    expect(
      diaristaFormSchema.safeParse({ ...base, origem: "novo", nome: "Ciclano" })
        .success,
    ).toBe(true);
  });

  it("o estado traz os diaristas fora do mapa e as funções", () => {
    const estado = paraEstadoMapa({
      equipamentos: [],
      trechos: [],
      diaristas_fora: [{ id: ID, nome: "Fulano", funcao: "Ajudante" }],
      funcoes: [{ id: ID, nome: "Ajudante" }],
    });
    expect(estado?.diaristasFora).toEqual([
      { id: ID, nome: "Fulano", funcao: "Ajudante" },
    ]);
    expect(estado?.funcoes).toEqual([{ id: ID, nome: "Ajudante" }]);
  });
});
