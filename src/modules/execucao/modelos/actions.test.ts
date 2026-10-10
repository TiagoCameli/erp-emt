// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  resposta: { data: null as unknown, error: null as { code?: string; message?: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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

import {
  excluirExcecao,
  excluirFeriado,
  salvarCalendario,
  salvarExcecao,
  salvarFeriado,
  salvarServico,
} from "@/modules/execucao/modelos/actions";

const ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: ID, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const servico = { codigo: "EST-01", nome: "Estaca escavada", produtividadePadrao: "12,5", ceuAberto: true, ativo: true };
const calendario = {
  nome: "Padrão", horasSeg: "9", horasTer: "9", horasQua: "9", horasQui: "9", horasSex: "9", horasSab: "5", horasDom: "",
  feriadosAbrangencia: ["nacional", "AC"] as ("nacional" | "AC" | "municipal")[], municipio: "", padraoEmpresa: false,
};

describe("salvarServico", () => {
  it("sem execucao.modelos/criar não chama o banco", async () => {
    estado.negadas = ["execucao.modelos/criar"];
    await expect(salvarServico(null, servico)).resolves.toEqual({ erro: "Sem permissão para cadastrar serviço" });
    expect(estado.chamadas).toEqual([]);
  });
  it("chama fn_ex_servico_salvar com a produtividade normalizada", async () => {
    await expect(salvarServico(null, servico)).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas[0].fn).toBe("fn_ex_servico_salvar");
    expect(estado.chamadas[0].args.p_id).toBeUndefined();
    expect((estado.chamadas[0].args.p_dados as Record<string, unknown>).produtividade_padrao).toBe("12.5");
  });
});

describe("calendários", () => {
  it("salvarCalendario(null) chama fn_ex_calendario_salvar sem p_id e com horas_sab = 5", async () => {
    await expect(salvarCalendario(null, calendario)).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas[0].fn).toBe("fn_ex_calendario_salvar");
    expect(estado.chamadas[0].args.p_id).toBeUndefined();
    expect((estado.chamadas[0].args.p_dados as Record<string, unknown>).horas_sab).toBe("5");
  });
  it("editar passa com execucao.cronogramas/editar mesmo sem execucao.modelos/editar", async () => {
    estado.negadas = ["execucao.modelos/editar"];
    await expect(salvarCalendario(ID, calendario)).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas[0].args.p_id).toBe(ID);
  });
  it("editar sem nenhuma das duas permissões não chama o banco", async () => {
    estado.negadas = ["execucao.modelos/editar", "execucao.cronogramas/editar"];
    await expect(salvarCalendario(ID, calendario)).resolves.toEqual({ erro: "Sem permissão para editar calendário" });
    expect(estado.chamadas).toEqual([]);
  });
  it("salvarExcecao chama fn_ex_calendario_excecao_salvar", async () => {
    await expect(salvarExcecao(ID, { data: "2026-12-24", horas: "4", tipo: "extra", descricao: "Véspera" })).resolves.toEqual({ ok: true });
    expect(estado.chamadas[0]).toEqual({
      fn: "fn_ex_calendario_excecao_salvar",
      args: { p_cal: ID, p_data: "2026-12-24", p_horas: "4", p_tipo: "extra", p_descricao: "Véspera" },
    });
  });
  it("excluirExcecao com data inexistente é recusada sem chamada", async () => {
    await expect(excluirExcecao(ID, "2026-13-01")).resolves.toEqual({ erro: "Dados inválidos" });
    expect(estado.chamadas).toEqual([]);
  });
  it("excluirExcecao válida chama fn_ex_calendario_excecao_excluir", async () => {
    await expect(excluirExcecao(ID, "2026-12-24")).resolves.toEqual({ ok: true });
    expect(estado.chamadas[0]).toEqual({ fn: "fn_ex_calendario_excecao_excluir", args: { p_cal: ID, p_data: "2026-12-24" } });
  });
});

describe("feriados", () => {
  it("salvarFeriado chama fn_ex_feriado_salvar com município null", async () => {
    await expect(salvarFeriado(null, { data: "2026-12-24", nome: "Véspera de Natal", abrangencia: "nacional" })).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas[0].fn).toBe("fn_ex_feriado_salvar");
    expect(estado.chamadas[0].args.p_dados).toEqual({ data: "2026-12-24", nome: "Véspera de Natal", abrangencia: "nacional", municipio: null });
  });
  it("sem execucao.modelos/criar recusa", async () => {
    estado.negadas = ["execucao.modelos/criar"];
    await expect(salvarFeriado(null, { data: "2026-12-24", nome: "Véspera de Natal", abrangencia: "nacional" })).resolves.toEqual({
      erro: "Sem permissão para cadastrar feriado",
    });
    expect(estado.chamadas).toEqual([]);
  });
  it("municipal sem município é recusado pelo schema", async () => {
    await expect(salvarFeriado(null, { data: "2026-06-01", nome: "Aniversário", abrangencia: "municipal" })).resolves.toEqual({ erro: "Informe o município" });
    expect(estado.chamadas).toEqual([]);
  });
  it("excluirFeriado exige execucao.modelos/excluir e chama fn_ex_feriado_excluir", async () => {
    estado.negadas = ["execucao.modelos/excluir"];
    await expect(excluirFeriado(ID)).resolves.toEqual({ erro: "Sem permissão para excluir feriado" });
    estado.negadas = [];
    await expect(excluirFeriado(ID)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_ex_feriado_excluir", args: { p_id: ID } }]);
  });
});
