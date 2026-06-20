import { describe, expect, it } from "vitest";

import {
  saidaFormParaInput,
  saidaSchema,
} from "@/modules/estoque/saidas/schemas";
import {
  transferenciaFormParaInput,
  transferenciaSchema,
} from "@/modules/estoque/transferencias/schemas";
import {
  ajusteFormParaInput,
  ajusteSchema,
} from "@/modules/estoque/inventario/schemas";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

describe("saidaSchema", () => {
  it("exige centro de custo no consumo", () => {
    const r = saidaSchema.safeParse({
      insumoId: UUID_A,
      depositoId: UUID_B,
      quantidade: 10,
      data: undefined,
      observacao: undefined,
    });
    expect(r.success).toBe(false);
  });

  it("aceita saída válida com centro de custo", () => {
    const r = saidaSchema.safeParse({
      insumoId: UUID_A,
      depositoId: UUID_B,
      quantidade: 10,
      centroCustoId: UUID_C,
    });
    expect(r.success).toBe(true);
  });

  it("recusa quantidade zero ou negativa", () => {
    const base = { insumoId: UUID_A, depositoId: UUID_B, centroCustoId: UUID_C };
    expect(saidaSchema.safeParse({ ...base, quantidade: 0 }).success).toBe(
      false,
    );
    expect(saidaSchema.safeParse({ ...base, quantidade: -5 }).success).toBe(
      false,
    );
  });
});

describe("transferenciaSchema", () => {
  it("recusa origem igual ao destino", () => {
    const r = transferenciaSchema.safeParse({
      insumoId: UUID_A,
      origemId: UUID_B,
      destinoId: UUID_B,
      quantidade: 5,
    });
    expect(r.success).toBe(false);
  });

  it("aceita origem e destino diferentes", () => {
    const r = transferenciaSchema.safeParse({
      insumoId: UUID_A,
      origemId: UUID_B,
      destinoId: UUID_C,
      quantidade: 5,
    });
    expect(r.success).toBe(true);
  });
});

describe("ajusteSchema", () => {
  it("exige motivo", () => {
    const r = ajusteSchema.safeParse({
      insumoId: UUID_A,
      depositoId: UUID_B,
      quantidadeNova: 12,
      motivo: "   ",
    });
    expect(r.success).toBe(false);
  });

  it("aceita quantidade nova zero (zerar o saldo) com motivo", () => {
    const r = ajusteSchema.safeParse({
      insumoId: UUID_A,
      depositoId: UUID_B,
      quantidadeNova: 0,
      motivo: "Contagem física",
    });
    expect(r.success).toBe(true);
  });
});

describe("conversões form -> input", () => {
  it("saidaFormParaInput coage números pt-BR e limpa vazios", () => {
    const out = saidaFormParaInput({
      insumoId: UUID_A,
      depositoId: UUID_B,
      quantidade: "1.234,5",
      centroCustoId: UUID_C,
      data: "",
      observacao: "",
    });
    expect(out.quantidade).toBe(1234.5);
    expect(out.data).toBeUndefined();
    expect(out.observacao).toBeUndefined();
  });

  it("transferenciaFormParaInput coage a quantidade", () => {
    const out = transferenciaFormParaInput({
      insumoId: UUID_A,
      origemId: UUID_B,
      destinoId: UUID_C,
      quantidade: "30",
      data: "",
      observacao: "",
    });
    expect(out.quantidade).toBe(30);
  });

  it("ajusteFormParaInput coage a quantidade contada", () => {
    const out = ajusteFormParaInput({
      insumoId: UUID_A,
      depositoId: UUID_B,
      quantidadeNova: "0,75",
      motivo: "Sobra",
    });
    expect(out.quantidadeNova).toBe(0.75);
  });
});
