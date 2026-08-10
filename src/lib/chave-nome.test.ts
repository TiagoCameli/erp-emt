import { describe, expect, it } from "vitest";

import { chaveNome } from "@/lib/chave-nome";

describe("chaveNome", () => {
  it("casa a grafia antiga com a nova dos centros de sistema", () => {
    // O caso que motivou o helper: planilha antiga contra dado renomeado.
    expect(chaveNome("Escritorio Central")).toBe(chaveNome("Escritório Central"));
    expect(chaveNome("Manutencao de equipamentos")).toBe(
      chaveNome("Manutenção de equipamentos"),
    );
  });

  it("ignora caixa", () => {
    expect(chaveNome("TERRAPLENAGEM")).toBe(chaveNome("terraplenagem"));
  });

  it("colapsa espaço repetido e apara as pontas", () => {
    expect(chaveNome("  Base   e   Sub-base  ")).toBe("base e sub-base");
  });

  it("remove cedilha e til", () => {
    expect(chaveNome("Pavimentação")).toBe("pavimentacao");
    expect(chaveNome("Manutenção")).toBe("manutencao");
  });

  it("não junta palavras diferentes", () => {
    expect(chaveNome("Corte")).not.toBe(chaveNome("Aterro"));
  });

  it("é idempotente", () => {
    const uma = chaveNome("Escritório Central");
    expect(chaveNome(uma)).toBe(uma);
  });

  it("aguenta string vazia", () => {
    expect(chaveNome("")).toBe("");
    expect(chaveNome("   ")).toBe("");
  });
});
