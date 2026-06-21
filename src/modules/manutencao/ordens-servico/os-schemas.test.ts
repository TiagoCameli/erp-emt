import { describe, expect, it } from "vitest";

import {
  abrirOsSchema,
  maoObraSchema,
  pecaSchema,
  terceiroSchema,
} from "@/modules/manutencao/ordens-servico/schemas";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

describe("abrirOsSchema", () => {
  it("aceita OS válida sem leituras", () => {
    const r = abrirOsSchema.safeParse({
      equipamentoId: UUID_A,
      tipo: "corretiva",
      descricao: "Vazamento de óleo",
      prioridade: "alta",
    });
    expect(r.success).toBe(true);
  });

  it("exige descrição", () => {
    const r = abrirOsSchema.safeParse({
      equipamentoId: UUID_A,
      tipo: "corretiva",
      descricao: "   ",
      prioridade: "media",
    });
    expect(r.success).toBe(false);
  });

  it("recusa tipo e prioridade fora do domínio", () => {
    expect(
      abrirOsSchema.safeParse({ equipamentoId: UUID_A, tipo: "urgente", descricao: "x", prioridade: "media" }).success,
    ).toBe(false);
    expect(
      abrirOsSchema.safeParse({ equipamentoId: UUID_A, tipo: "corretiva", descricao: "x", prioridade: "critica" }).success,
    ).toBe(false);
  });
});

describe("pecaSchema", () => {
  it("aceita peça válida", () => {
    expect(
      pecaSchema.safeParse({ insumoId: UUID_A, depositoId: UUID_B, quantidade: 2 }).success,
    ).toBe(true);
  });

  it("recusa quantidade zero ou negativa", () => {
    expect(pecaSchema.safeParse({ insumoId: UUID_A, depositoId: UUID_B, quantidade: 0 }).success).toBe(false);
    expect(pecaSchema.safeParse({ insumoId: UUID_A, depositoId: UUID_B, quantidade: -1 }).success).toBe(false);
  });
});

describe("maoObraSchema", () => {
  it("aceita horas positivas e valor não negativo", () => {
    expect(
      maoObraSchema.safeParse({ colaboradorId: UUID_C, horas: 5, valorHora: 50 }).success,
    ).toBe(true);
    expect(
      maoObraSchema.safeParse({ colaboradorId: UUID_C, horas: 1, valorHora: 0 }).success,
    ).toBe(true);
  });

  it("recusa horas zero e valor negativo", () => {
    expect(maoObraSchema.safeParse({ colaboradorId: UUID_C, horas: 0, valorHora: 50 }).success).toBe(false);
    expect(maoObraSchema.safeParse({ colaboradorId: UUID_C, horas: 5, valorHora: -1 }).success).toBe(false);
  });
});

describe("terceiroSchema", () => {
  it("aceita terceiro com fornecedor opcional", () => {
    expect(
      terceiroSchema.safeParse({ descricao: "Solda", valor: 300 }).success,
    ).toBe(true);
    expect(
      terceiroSchema.safeParse({ fornecedorId: UUID_A, descricao: "Solda", valor: 300, dataVencimento: "2026-07-20" }).success,
    ).toBe(true);
  });

  it("exige descrição e recusa valor negativo", () => {
    expect(terceiroSchema.safeParse({ descricao: "", valor: 300 }).success).toBe(false);
    expect(terceiroSchema.safeParse({ descricao: "Solda", valor: -1 }).success).toBe(false);
  });
});
