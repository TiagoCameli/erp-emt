// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * `carregarMedicoes` junta 3 fontes (mc_medicoes, mc_v_medicao_totais, mc_lancamentos): esta prova
 * garante que o valor (texto, D7) e a contagem de lançamentos não excluídos casam com a medição
 * certa, mesmo quando falta linha de uma medição em alguma das fontes (0 lançamentos, valor nulo).
 */

vi.mock("server-only", () => ({}));

function tabela(resultado: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const encadear = () => builder;
  builder.select = encadear;
  builder.eq = encadear;
  builder.order = encadear;
  builder.is = encadear;
  builder.range = () => Promise.resolve(resultado);
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resultado).then(resolve, reject);
  return builder;
}

const estado = vi.hoisted(() => ({
  medicoes: { data: [] as unknown[], error: null as unknown },
  totais: { data: [] as unknown[], error: null as unknown },
  lancamentos: { data: [] as unknown[], error: null as unknown },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (nome: string) => {
      if (nome === "mc_medicoes") return tabela(estado.medicoes);
      if (nome === "mc_v_medicao_totais") return tabela(estado.totais);
      if (nome === "mc_lancamentos") return tabela(estado.lancamentos);
      throw new Error(`tabela inesperada: ${nome}`);
    },
  }),
}));

import { carregarMedicoes } from "@/modules/medicao/medicoes/queries";

const CONTRATO = "33333333-3333-4333-8333-333333333333";

describe("carregarMedicoes", () => {
  it("junta valor (texto) e contagem de lançamentos por medição, na ordem que a tabela devolveu", async () => {
    estado.medicoes = {
      data: [
        { id: "m2", numero: 2, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "aberta" },
        { id: "m1", numero: 1, periodo_inicio: "2026-01-01", periodo_fim: "2026-01-31", status: "aprovada" },
      ],
      error: null,
    };
    // m2 ainda sem regra de arredondamento (spec 6.2): valor nulo.
    estado.totais = {
      data: [
        { medicao_id: "m1", valor: "100.00" },
        { medicao_id: "m2", valor: null },
      ],
      error: null,
    };
    estado.lancamentos = {
      data: [{ medicao_id: "m1" }, { medicao_id: "m1" }, { medicao_id: "m2" }],
      error: null,
    };

    await expect(carregarMedicoes(CONTRATO)).resolves.toEqual([
      { id: "m2", numero: 2, periodoInicio: "2026-02-01", periodoFim: "2026-02-28", status: "aberta", valor: null, lancamentos: 1 },
      { id: "m1", numero: 1, periodoInicio: "2026-01-01", periodoFim: "2026-01-31", status: "aprovada", valor: "100.00", lancamentos: 2 },
    ]);
  });

  it("medição sem nenhum lançamento: contagem zero, não some da lista", async () => {
    estado.medicoes = {
      data: [{ id: "m1", numero: 1, periodo_inicio: "2026-01-01", periodo_fim: "2026-01-31", status: "aberta" }],
      error: null,
    };
    estado.totais = { data: [{ medicao_id: "m1", valor: "0.00" }], error: null };
    estado.lancamentos = { data: [], error: null };

    await expect(carregarMedicoes(CONTRATO)).resolves.toEqual([
      { id: "m1", numero: 1, periodoInicio: "2026-01-01", periodoFim: "2026-01-31", status: "aberta", valor: "0.00", lancamentos: 0 },
    ]);
  });

  it("contrato sem nenhuma medição: lista vazia", async () => {
    estado.medicoes = { data: [], error: null };
    estado.totais = { data: [], error: null };
    estado.lancamentos = { data: [], error: null };

    await expect(carregarMedicoes(CONTRATO)).resolves.toEqual([]);
  });

  it("erro do banco na tabela de medições sobe para quem chamou", async () => {
    estado.medicoes = { data: [], error: { message: "falhou" } };
    estado.totais = { data: [], error: null };
    estado.lancamentos = { data: [], error: null };

    await expect(carregarMedicoes(CONTRATO)).rejects.toEqual({ message: "falhou" });
  });
});
