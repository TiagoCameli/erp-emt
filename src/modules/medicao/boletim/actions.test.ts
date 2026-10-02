// @vitest-environment node
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  resposta: { data: null as unknown, error: null as { message?: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async (recurso: string, acao: string) => {
    if (estado.negadas.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      return estado.resposta;
    },
  }),
}));

import { gerarPlanilhaBoletim } from "@/modules/medicao/boletim/actions";
import type { Boletim } from "@/modules/medicao/boletim/tipos";

const ID = "33333333-3333-4333-8333-333333333333";

const BOLETIM: Boletim = {
  contrato: { id: ID, codigo: "L09", nome_obra: "BR-364 Lote 09", numero_contrato: "00615/2025", contratante_nome: "DNIT", regra_arredondamento: "item_por_medicao" },
  versao: { id: "v0", numero: 0, vigente_desde: "2025-10-01" },
  ate: 1,
  medicoes: [{ id: "m1", numero: 1, periodo_inicio: "2025-10-26", periodo_fim: "2025-11-25", status: "aprovada", valor: "10.00", reajuste: null, reajuste_situacao: null }],
  linhas: [],
  fora_da_versao: [],
  total: { previsto: "100.00", valor_medicao: "10.00", acumulado: "10.00", saldo: "90.00", pct_executado: "0.1", pct_a_medir: "0.9", reajuste_medicao: "0", reajuste_acumulado: "0" },
};

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: BOLETIM, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("gerarPlanilhaBoletim", () => {
  it("sem medicao.boletim/ver não chama o banco", async () => {
    estado.negadas = ["medicao.boletim/ver"];
    expect(await gerarPlanilhaBoletim(ID, null)).toEqual({ erro: "Sem permissão para exportar o boletim" });
    expect(estado.chamadas).toEqual([]);
  });

  it("contrato inválido não chama o banco", async () => {
    expect(await gerarPlanilhaBoletim("x", null)).toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });

  it("a recusa da RPC volta como está, sem arquivo", async () => {
    estado.resposta = { data: null, error: { message: "A 11ª medição não existe neste contrato" } };
    expect(await gerarPlanilhaBoletim(ID, 11)).toEqual({ erro: "A 11ª medição não existe neste contrato" });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_boletim", args: { p_contrato: ID, p_ate: 11 } }]);
  });

  it("devolve o xlsx em base64 com o nome do arquivo", async () => {
    const r = await gerarPlanilhaBoletim(ID, null);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.nomeArquivo).toBe("boletim-L09-ate-1a-medicao.xlsx");
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(new Uint8Array(Buffer.from(r.base64, "base64")).buffer);
    expect(lido.getWorksheet("Boletim")).toBeDefined();
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_boletim", args: { p_contrato: ID } }]);
  });
});
