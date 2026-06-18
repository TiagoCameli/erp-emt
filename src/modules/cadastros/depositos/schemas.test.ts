// @vitest-environment node
import { describe, expect, it } from "vitest";

import { depositoSchema, ehTanque } from "@/modules/cadastros/depositos/schemas";
import { obraSchema } from "@/modules/cadastros/obras/schemas";
import { insumoSchema } from "@/modules/cadastros/insumos/schemas";

const UUID_INSUMO = "11111111-1111-4111-8111-111111111111";
const UUID_OBRA = "22222222-2222-4222-8222-222222222222";
const UUID_CATEGORIA = "33333333-3333-4333-8333-333333333333";
const UUID_UNIDADE = "44444444-4444-4444-8444-444444444444";

/** Busca o erro do refine numa lista de issues do safeParse. */
function temErroNoCampo(
  resultado: ReturnType<typeof depositoSchema.safeParse>,
  campo: string,
): boolean {
  if (resultado.success) return false;
  return resultado.error.issues.some((issue) => issue.path[0] === campo);
}

describe("ehTanque", () => {
  it("classifica tanques de combustível e betuminoso como tanque", () => {
    expect(ehTanque("tanque_combustivel")).toBe(true);
    expect(ehTanque("tanque_betuminoso")).toBe(true);
  });

  it("não classifica central, obra e almoxarifado como tanque", () => {
    expect(ehTanque("central")).toBe(false);
    expect(ehTanque("obra")).toBe(false);
    expect(ehTanque("almoxarifado_mecanica")).toBe(false);
  });

  it("não quebra com tipo desconhecido", () => {
    expect(ehTanque("qualquer_coisa")).toBe(false);
  });
});

describe("depositoSchema: regra de tanque exige insumo", () => {
  it("aceita tanque de combustível com insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Tanque diesel 1",
      tipo: "tanque_combustivel",
      obraId: null,
      insumoId: UUID_INSUMO,
      ativo: true,
    });
    expect(resultado.success).toBe(true);
  });

  it("aceita tanque de betuminoso com insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Tanque CAP",
      tipo: "tanque_betuminoso",
      obraId: UUID_OBRA,
      insumoId: UUID_INSUMO,
      ativo: true,
    });
    expect(resultado.success).toBe(true);
  });

  it("rejeita tanque de combustível sem insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Tanque diesel 1",
      tipo: "tanque_combustivel",
      obraId: null,
      insumoId: null,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    expect(temErroNoCampo(resultado, "insumoId")).toBe(true);
  });

  it("rejeita tanque de betuminoso sem insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Tanque CAP",
      tipo: "tanque_betuminoso",
      obraId: null,
      insumoId: null,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    expect(temErroNoCampo(resultado, "insumoId")).toBe(true);
  });
});

describe("depositoSchema: não-tanque não pode ter insumo", () => {
  it("aceita depósito central sem insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Central de materiais",
      tipo: "central",
      obraId: null,
      insumoId: null,
      ativo: true,
    });
    expect(resultado.success).toBe(true);
  });

  it("aceita depósito de obra sem insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Depósito BR-364",
      tipo: "obra",
      obraId: UUID_OBRA,
      insumoId: null,
      ativo: true,
    });
    expect(resultado.success).toBe(true);
  });

  it("aceita almoxarifado de mecânica sem insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Almoxarifado oficina",
      tipo: "almoxarifado_mecanica",
      obraId: null,
      insumoId: null,
      ativo: true,
    });
    expect(resultado.success).toBe(true);
  });

  it("rejeita depósito central com insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Central de materiais",
      tipo: "central",
      obraId: null,
      insumoId: UUID_INSUMO,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    expect(temErroNoCampo(resultado, "insumoId")).toBe(true);
  });

  it("rejeita depósito de obra com insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Depósito BR-364",
      tipo: "obra",
      obraId: UUID_OBRA,
      insumoId: UUID_INSUMO,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    expect(temErroNoCampo(resultado, "insumoId")).toBe(true);
  });

  it("rejeita almoxarifado de mecânica com insumo", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Almoxarifado oficina",
      tipo: "almoxarifado_mecanica",
      obraId: null,
      insumoId: UUID_INSUMO,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    expect(temErroNoCampo(resultado, "insumoId")).toBe(true);
  });
});

describe("depositoSchema: campos base", () => {
  it("exige nome do depósito", () => {
    const resultado = depositoSchema.safeParse({
      nome: "",
      tipo: "central",
      obraId: null,
      insumoId: null,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    expect(temErroNoCampo(resultado, "nome")).toBe(true);
  });

  it("rejeita tipo fora da lista", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Depósito X",
      tipo: "garagem",
      obraId: null,
      insumoId: null,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    expect(temErroNoCampo(resultado, "tipo")).toBe(true);
  });

  it("rejeita insumoId que não é uuid quando é tanque", () => {
    const resultado = depositoSchema.safeParse({
      nome: "Tanque diesel",
      tipo: "tanque_combustivel",
      obraId: null,
      insumoId: "nao-e-uuid",
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    expect(temErroNoCampo(resultado, "insumoId")).toBe(true);
  });
});

describe("obraSchema: obrigatórios", () => {
  it("exige nome com pelo menos 2 caracteres", () => {
    const resultado = obraSchema.safeParse({
      nome: "A",
      status: "planejamento",
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(
        resultado.error.issues.some((issue) => issue.path[0] === "nome"),
      ).toBe(true);
    }
  });

  it("aceita obra só com nome e status (demais opcionais)", () => {
    const resultado = obraSchema.safeParse({
      nome: "BR-364 Lote 09",
      status: "em_andamento",
      ativo: true,
    });
    expect(resultado.success).toBe(true);
  });

  it("rejeita status fora da lista", () => {
    const resultado = obraSchema.safeParse({
      nome: "BR-364 Lote 09",
      status: "arquivada",
      ativo: true,
    });
    expect(resultado.success).toBe(false);
  });
});

describe("insumoSchema: categoria e unidade obrigatórias", () => {
  it("aceita insumo com categoria e unidade válidas", () => {
    const resultado = insumoSchema.safeParse({
      nome: "Brita 1",
      categoriaId: UUID_CATEGORIA,
      unidadeId: UUID_UNIDADE,
      ativo: true,
    });
    expect(resultado.success).toBe(true);
  });

  it("rejeita insumo sem categoria", () => {
    const resultado = insumoSchema.safeParse({
      nome: "Brita 1",
      unidadeId: UUID_UNIDADE,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(
        resultado.error.issues.some((issue) => issue.path[0] === "categoriaId"),
      ).toBe(true);
    }
  });

  it("rejeita insumo sem unidade", () => {
    const resultado = insumoSchema.safeParse({
      nome: "Brita 1",
      categoriaId: UUID_CATEGORIA,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(
        resultado.error.issues.some((issue) => issue.path[0] === "unidadeId"),
      ).toBe(true);
    }
  });

  it("rejeita categoria que não é uuid", () => {
    const resultado = insumoSchema.safeParse({
      nome: "Brita 1",
      categoriaId: "categoria-x",
      unidadeId: UUID_UNIDADE,
      ativo: true,
    });
    expect(resultado.success).toBe(false);
  });
});
