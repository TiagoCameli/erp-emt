import { describe, expect, it } from "vitest";

import { apontamentoSchema } from "@/modules/rh/apontamentos/schemas";
import { gerarFolhaSchema } from "@/modules/rh/folha/schemas";
import { diariaSchema } from "@/modules/rh/diaristas/schemas";
import { STATUS_FOLHA, type StatusFolha } from "@/modules/rh/_shared/formato";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("apontamentoSchema", () => {
  it("aceita horas dentro de 0..24", () => {
    expect(
      apontamentoSchema.safeParse({ colaboradorId: UUID_A, horasNormais: 8, horasExtras: 2, tipo: "normal" }).success,
    ).toBe(true);
  });

  it("recusa horas acima de 24", () => {
    expect(
      apontamentoSchema.safeParse({ colaboradorId: UUID_A, horasNormais: 25, horasExtras: 0, tipo: "normal" }).success,
    ).toBe(false);
  });

  it("recusa horas negativas e tipo invalido", () => {
    expect(apontamentoSchema.safeParse({ colaboradorId: UUID_A, horasNormais: -1, horasExtras: 0, tipo: "normal" }).success).toBe(false);
    expect(apontamentoSchema.safeParse({ colaboradorId: UUID_A, horasNormais: 8, horasExtras: 0, tipo: "ferias" }).success).toBe(false);
  });
});

describe("gerarFolhaSchema", () => {
  it("aceita competência no formato yyyy-MM-01 (sem % de encargos: vem da config)", () => {
    expect(gerarFolhaSchema.safeParse({ competencia: "2026-06-01" }).success).toBe(true);
  });

  it("recusa competência fora do formato yyyy-MM-01", () => {
    expect(gerarFolhaSchema.safeParse({ competencia: "2026-06" }).success).toBe(false);
  });
});

describe("diariaSchema", () => {
  const base = {
    colaboradorId: UUID_A,
    funcaoId: UUID_B,
    inicio: "2026-06-01",
    fim: "2026-06-10",
    meias: ["2026-06-02"],
    faltas: [],
    valorDiaria: 150,
  };

  it("aceita diária por período válida (obra opcional)", () => {
    expect(diariaSchema.safeParse(base).success).toBe(true);
    expect(diariaSchema.safeParse({ ...base, obraId: UUID_A }).success).toBe(true);
  });

  it("recusa sem função, valor zero e data inválida", () => {
    const { funcaoId: _, ...semFuncao } = base;
    expect(diariaSchema.safeParse(semFuncao).success).toBe(false);
    expect(diariaSchema.safeParse({ ...base, valorDiaria: 0 }).success).toBe(false);
    expect(diariaSchema.safeParse({ ...base, inicio: "01/06/2026" }).success).toBe(false);
  });
});

describe("status da folha", () => {
  it("tem os três status da máquina de aprovação e não tem 'fechada'", () => {
    expect(Object.keys(STATUS_FOLHA).sort()).toEqual([
      "aprovado",
      "pendente_aprovacao",
      "rascunho",
    ]);
  });

  it("usa 'aprovado' no masculino para casar com o StatusPadrao canônico", () => {
    // O ApprovalBar compara com 'aprovado' literal: 'aprovada' sumiria com o
    // botão de desaprovar.
    const status: StatusFolha = "aprovado";
    expect(STATUS_FOLHA[status].badge).toBe("aprovado");
  });

  it("mostra rótulo feminino na UI sem mudar o valor do banco", () => {
    expect(STATUS_FOLHA.aprovado.rotulo).toBe("Aprovada");
    expect(STATUS_FOLHA.pendente_aprovacao.rotulo).toBe("Pendente de aprovação");
  });
});
