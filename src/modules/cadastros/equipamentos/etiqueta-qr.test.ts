// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  basePublica,
  CAMINHO_EQUIPAMENTO_CAMPO,
  urlDoEquipamento,
} from "@/modules/cadastros/equipamentos/etiqueta-qr";

const ID = "c4e0f922-3aec-8c72-7089-225523e04557";

describe("urlDoEquipamento", () => {
  it("monta base + /m/equipamento/{id}", () => {
    expect(urlDoEquipamento("https://erp.emt.com.br", ID)).toBe(
      `https://erp.emt.com.br/m/equipamento/${ID}`,
    );
  });

  it("não duplica a barra quando a base termina em /", () => {
    expect(urlDoEquipamento("https://erp.emt.com.br//", ID)).toBe(
      `https://erp.emt.com.br/m/equipamento/${ID}`,
    );
  });

  it("o caminho é o da tela de campo (etiqueta impressa não muda depois)", () => {
    expect(CAMINHO_EQUIPAMENTO_CAMPO).toBe("/m/equipamento");
  });
});

describe("basePublica", () => {
  it("tira a barra final", () => {
    expect(basePublica("https://erp.emt.com.br/")).toBe("https://erp.emt.com.br");
  });

  it("apara espaço", () => {
    expect(basePublica("  https://erp.emt.com.br  ")).toBe(
      "https://erp.emt.com.br",
    );
  });

  it.each([
    undefined,
    null,
    "",
    "   ",
    "erp.emt.com.br",
    "ftp://erp.emt.com.br",
    "nao e url",
  ])("recusa %s", (valor) => {
    expect(basePublica(valor)).toBeNull();
  });

  it("aceita http (preview local)", () => {
    expect(basePublica("http://localhost:3000")).toBe("http://localhost:3000");
  });
});
