import { describe, expect, it } from "vitest";

import { podeTransicionar } from "@/modules/rh/folha/transicoes";

describe("podeTransicionar", () => {
  it("permite enviar rascunho para aprovação", () => {
    expect(podeTransicionar("rascunho", "pendente_aprovacao")).toBe(true);
  });

  it("permite aprovar e rejeitar a folha pendente", () => {
    expect(podeTransicionar("pendente_aprovacao", "aprovado")).toBe(true);
    expect(podeTransicionar("pendente_aprovacao", "rascunho")).toBe(true);
  });

  it("permite desaprovar a folha aprovada de volta para rascunho", () => {
    expect(podeTransicionar("aprovado", "rascunho")).toBe(true);
  });

  it("recusa pular a aprovação", () => {
    expect(podeTransicionar("rascunho", "aprovado")).toBe(false);
  });

  it("recusa voltar a folha aprovada para pendente", () => {
    // Não existe esse caminho: desaprovar leva a rascunho, para poder regenerar.
    expect(podeTransicionar("aprovado", "pendente_aprovacao")).toBe(false);
  });

  it("recusa transição para o mesmo status", () => {
    expect(podeTransicionar("rascunho", "rascunho")).toBe(false);
  });
});
