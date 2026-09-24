// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  permitido: true,
  saldo: null as unknown,
  movimentos: [] as unknown[],
  pedidos: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async (recurso: string, acao: string) => {
    estado.pedidos.push(`${recurso}/${acao}`);
    if (!estado.permitido) throw new Error("Sem permissão");
  }),
}));
vi.mock("@/modules/frete/conta-corrente/queries", () => ({
  buscarSaldo: vi.fn(async () => estado.saldo),
  listarMovimentos: vi.fn(async () => estado.movimentos),
}));
vi.mock("@/lib/pdf", () => ({ gerarPdf: vi.fn(async () => Buffer.from("%PDF-1.4")) }));

import { gerarPdfExtratoFrete, gerarPlanilhaExtratoFrete } from "@/modules/frete/conta-corrente/actions";

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  estado.permitido = true;
  estado.pedidos = [];
  estado.saldo = { transportadoraId: ID, nome: "Areacre", saldo: 10, debitoCombustivelTotal: 0, creditoFreteTotal: 10, pagoFreteTotal: 0, qtdMovimentos: 1 };
  estado.movimentos = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      data: "2026-06-01T17:00:00Z",
      createdAt: "2026-06-01T17:00:00Z",
      tipo: "credito_frete",
      valor: 10,
      descricao: "Frete 1 — A → B",
      mesReferencia: "2026-06-01",
    },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("exportações do extrato", () => {
  it("pede frete.conta-corrente/ver e, sem ela, não lê nada", async () => {
    estado.permitido = false;
    await expect(gerarPlanilhaExtratoFrete({ transportadoraId: ID, meses: [] })).resolves.toEqual({
      erro: "Sem permissão para exportar o extrato",
    });
    await expect(gerarPdfExtratoFrete({ transportadoraId: ID, meses: [] })).resolves.toEqual({
      erro: "Sem permissão para exportar o extrato",
    });
    expect(estado.pedidos).toEqual(["frete.conta-corrente/ver", "frete.conta-corrente/ver"]);
  });

  it("recusa pedido com mês fora do formato ou campo a mais", async () => {
    await expect(gerarPlanilhaExtratoFrete({ transportadoraId: ID, meses: ["2026-06"] })).resolves.toHaveProperty("erro");
    await expect(gerarPlanilhaExtratoFrete({ transportadoraId: ID, meses: [], extra: 1 })).resolves.toHaveProperty("erro");
    await expect(gerarPlanilhaExtratoFrete({ transportadoraId: "x", meses: [] })).resolves.toHaveProperty("erro");
  });

  it("gera a planilha com o nome do arquivo da origem", async () => {
    const r = await gerarPlanilhaExtratoFrete({ transportadoraId: ID, meses: ["2026-06-01"] });
    expect(r).toMatchObject({ ok: true });
    if ("ok" in r) {
      expect(r.nomeArquivo).toMatch(/^extrato-transportadora-areacre-\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(r.base64.length).toBeGreaterThan(100);
    }
  });

  it("gera o PDF", async () => {
    const r = await gerarPdfExtratoFrete({ transportadoraId: ID, meses: [] });
    expect(r).toMatchObject({ ok: true });
    if ("ok" in r) expect(r.nomeArquivo).toMatch(/\.pdf$/);
  });

  it("sem movimentos ou transportadora inexistente, avisa", async () => {
    estado.movimentos = [];
    await expect(gerarPlanilhaExtratoFrete({ transportadoraId: ID, meses: [] })).resolves.toEqual({
      erro: "Sem movimentos para exportar",
    });
    estado.saldo = null;
    await expect(gerarPdfExtratoFrete({ transportadoraId: ID, meses: [] })).resolves.toEqual({
      erro: "Transportadora não encontrada",
    });
  });
});
