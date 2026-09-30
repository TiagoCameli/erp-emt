// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * `listarLancamentos` junta a view (D7: quantidade/km em texto) e devolve camelCase.
 * `servicosParaLancar` é a prova do review focus #1 (spec 7.3): duas medições ABERTAS ao mesmo
 * tempo, mesmo quando compartilham a MESMA versão da planilha (não entrou aditivo entre elas),
 * têm de aparecer as DUAS na lista de serviços lançáveis — uma por medição, nunca só uma por versão.
 */

vi.mock("server-only", () => ({}));

function tabela(resultado: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const encadear = () => builder;
  for (const metodo of ["select", "eq", "is", "gte", "lte", "in", "or", "order"]) {
    builder[metodo] = encadear;
  }
  builder.range = () => Promise.resolve(resultado);
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resultado).then(resolve, reject);
  return builder;
}

const estado = vi.hoisted(() => ({
  lancamentos: { data: [] as unknown[], error: null as unknown },
  medicoes: { data: [] as unknown[], error: null as unknown },
  planilhaLinhas: { data: [] as unknown[], error: null as unknown },
  anexoVinculos: { data: [] as unknown[], error: null as unknown },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (nome: string) => {
      if (nome === "mc_v_lancamentos") return tabela(estado.lancamentos);
      if (nome === "mc_medicoes") return tabela(estado.medicoes);
      if (nome === "mc_v_planilha_linhas") return tabela(estado.planilhaLinhas);
      if (nome === "anexo_vinculos") return tabela(estado.anexoVinculos);
      throw new Error(`tabela inesperada: ${nome}`);
    },
  }),
}));

import { listarLancamentos, servicosParaLancar } from "@/modules/medicao/lancamentos/queries";

const CONTRATO = "33333333-3333-4333-8333-333333333333";

describe("listarLancamentos", () => {
  it("converte para camelCase, mantém quantidade/km como texto (D7) e conta os anexos", async () => {
    estado.anexoVinculos = { data: [{ entidade_id: "l1" }, { entidade_id: "l1" }], error: null };
    estado.lancamentos = {
      data: [
        {
          id: "l1",
          contrato_id: CONTRATO,
          medicao_id: "m1",
          medicao_numero: 11,
          medicao_status: "aberta",
          item_id: "item-1",
          codigo: "02.02",
          descricao: "Escavação",
          unidade: "m3",
          data: "2026-09-10",
          quantidade: "1234.5",
          km_inicial: "10.250",
          km_final: "12.500",
          estaca: "E-10",
          local_texto: null,
          observacao: "Trecho com chuva forte",
          motivo_excesso: null,
          created_at: "2026-09-10T12:00:00Z",
          created_by: "u1",
        },
      ],
      error: null,
    };

    await expect(listarLancamentos({ contratoId: CONTRATO })).resolves.toEqual([
      {
        id: "l1",
        contratoId: CONTRATO,
        medicaoId: "m1",
        medicaoNumero: 11,
        medicaoStatus: "aberta",
        itemId: "item-1",
        codigo: "02.02",
        descricao: "Escavação",
        unidade: "m3",
        data: "2026-09-10",
        quantidade: "1234.5",
        kmInicial: "10.250",
        kmFinal: "12.500",
        estaca: "E-10",
        localTexto: null,
        observacao: "Trecho com chuva forte",
        motivoExcesso: null,
        createdAt: "2026-09-10T12:00:00Z",
        createdBy: "u1",
        anexos: 2,
      },
    ]);
  });

  it("contrato sem nenhum lançamento: lista vazia (não conta anexos)", async () => {
    estado.lancamentos = { data: [], error: null };
    await expect(listarLancamentos({ contratoId: CONTRATO })).resolves.toEqual([]);
  });

  it("erro do banco sobe para quem chamou", async () => {
    estado.lancamentos = { data: [], error: { message: "falhou" } };
    await expect(listarLancamentos({ contratoId: CONTRATO })).rejects.toThrow("falhou");
  });
});

describe("servicosParaLancar", () => {
  it("contrato sem nenhuma medição aberta: lista vazia (não chama a planilha)", async () => {
    estado.medicoes = { data: [], error: null };
    await expect(servicosParaLancar(CONTRATO)).resolves.toEqual([]);
  });

  it("uma medição aberta: um ServicoParaLancar por linha de serviço da versão dela", async () => {
    estado.medicoes = {
      data: [{ id: "m11", numero: 11, periodo_inicio: "2026-09-01", periodo_fim: "2026-09-30", versao_id: "v1" }],
      error: null,
    };
    estado.planilhaLinhas = {
      data: [
        { versao_id: "v1", item_id: "item-1", codigo: "02.02", descricao: "Escavação", unidade: "m3", quantidade_prevista: "1000" },
      ],
      error: null,
    };

    await expect(servicosParaLancar(CONTRATO)).resolves.toEqual([
      {
        medicaoId: "m11",
        medicaoNumero: 11,
        periodoInicio: "2026-09-01",
        periodoFim: "2026-09-30",
        itemId: "item-1",
        codigo: "02.02",
        descricao: "Escavação",
        unidade: "m3",
        quantidadePrevista: "1000",
      },
    ]);
  });

  it("duas medições abertas compartilhando a MESMA versão: a linha vira um serviço por medição (spec 7.3)", async () => {
    estado.medicoes = {
      data: [
        { id: "m10", numero: 10, periodo_inicio: "2026-08-01", periodo_fim: "2026-08-31", versao_id: "v1" },
        { id: "m11", numero: 11, periodo_inicio: "2026-09-01", periodo_fim: "2026-09-30", versao_id: "v1" },
      ],
      error: null,
    };
    estado.planilhaLinhas = {
      data: [
        { versao_id: "v1", item_id: "item-1", codigo: "02.02", descricao: "Escavação", unidade: "m3", quantidade_prevista: "1000" },
      ],
      error: null,
    };

    const servicos = await servicosParaLancar(CONTRATO);
    expect(servicos).toHaveLength(2);
    expect(servicos.map((s) => s.medicaoNumero).sort()).toEqual([10, 11]);
    expect(servicos.every((s) => s.itemId === "item-1" && s.codigo === "02.02")).toBe(true);
  });

  it("ignora linha de planilha sem item_id (título) ", async () => {
    estado.medicoes = {
      data: [{ id: "m11", numero: 11, periodo_inicio: "2026-09-01", periodo_fim: "2026-09-30", versao_id: "v1" }],
      error: null,
    };
    estado.planilhaLinhas = {
      data: [{ versao_id: "v1", item_id: null, codigo: null, descricao: "Terraplenagem", unidade: null, quantidade_prevista: null }],
      error: null,
    };
    await expect(servicosParaLancar(CONTRATO)).resolves.toEqual([]);
  });

  it("erro do banco sobe para quem chamou", async () => {
    estado.medicoes = { data: [], error: { message: "falhou" } };
    await expect(servicosParaLancar(CONTRATO)).rejects.toEqual({ message: "falhou" });
  });
});
