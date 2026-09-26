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

import { definirAcesso, excluirContrato, restaurarContrato, salvarContrato } from "@/modules/medicao/contratos/actions";
import type { ContratoInput } from "@/modules/medicao/contratos/schemas";

const ID = "33333333-3333-4333-8333-333333333333";
const USUARIO = "44444444-4444-4444-8444-444444444444";
const DADOS: ContratoInput = {
  codigo: "L09-BR364", nomeObra: "BR-364 Lote 09", local: "", objeto: "Manutenção", numeroContrato: "00615/2025",
  contratanteNome: "DNIT", contratanteTipo: "federal", contratanteDocumento: "", valorInicial: 243927498.02,
  dataAssinatura: "2025-10-01", dataOrdemServico: "", prazoMeses: 39, inicioPrazo: "assinatura", diaInicioPeriodo: 26,
  tipoLocalizacao: "rodovia", regraArredondamento: null, alertaPrazoDias: 90, alertaValorPct: 90, status: "ativo", observacoes: "",
};

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: ID, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("salvarContrato", () => {
  it("sem medicao.contratos/criar não chama o banco", async () => {
    estado.negadas = ["medicao.contratos/criar"];
    await expect(salvarContrato(null, DADOS)).resolves.toEqual({ erro: "Sem permissão para cadastrar contrato" });
    expect(estado.chamadas).toEqual([]);
  });

  it("criar omite p_id (DEFAULT null no banco) e manda o valor como texto", async () => {
    await expect(salvarContrato(null, DADOS)).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas[0].fn).toBe("fn_mc_contrato_salvar");
    expect(estado.chamadas[0].args.p_id).toBeUndefined();
    expect((estado.chamadas[0].args.p_dados as Record<string, unknown>).valor_inicial).toBe("243927498.02");
  });

  it("editar exige medicao.contratos/editar", async () => {
    estado.negadas = ["medicao.contratos/editar"];
    await expect(salvarContrato(ID, DADOS)).resolves.toEqual({ erro: "Sem permissão para editar contrato" });
  });

  it("código repetido vira mensagem clara", async () => {
    estado.resposta = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"mc_contratos_codigo_uk\"" } };
    await expect(salvarContrato(null, DADOS)).resolves.toEqual({ erro: "Já existe outro contrato ativo com o código L09-BR364" });
  });

  it("erro de negócio do banco (P0001) chega como está", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "Contrato não encontrado" } };
    await expect(salvarContrato(ID, DADOS)).resolves.toEqual({ erro: "Contrato não encontrado" });
  });
});

describe("definirAcesso", () => {
  it("sem editar não chama o banco", async () => {
    estado.negadas = ["medicao.contratos/editar"];
    await expect(definirAcesso(ID, USUARIO, true)).resolves.toEqual({ erro: "Sem permissão para mudar o acesso" });
    expect(estado.chamadas).toEqual([]);
  });

  it("repassa a recusa de tirar o último da lista", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "O contrato ficaria sem ninguém ativo com acesso" } };
    await expect(definirAcesso(ID, USUARIO, false)).resolves.toEqual({ erro: "O contrato ficaria sem ninguém ativo com acesso" });
  });
});

describe("excluirContrato", () => {
  it("exige motivo antes do banco", async () => {
    await expect(excluirContrato(ID, " ")).resolves.toEqual({ erro: "Informe o motivo" });
    expect(estado.chamadas).toEqual([]);
  });
});

describe("restaurarContrato", () => {
  it("sem administracao.lixeira/editar não chama o banco", async () => {
    estado.negadas = ["administracao.lixeira/editar"];
    await expect(restaurarContrato(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar" });
    expect(estado.chamadas).toEqual([]);
  });

  it("sem medicao.contratos/excluir também não chama o banco", async () => {
    estado.negadas = ["medicao.contratos/excluir"];
    await expect(restaurarContrato(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar" });
    expect(estado.chamadas).toEqual([]);
  });

  it("com as duas permissões, restaura", async () => {
    estado.resposta = { data: null, error: null };
    await expect(restaurarContrato(ID)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_restaurar", args: { p_tabela: "mc_contratos", p_id: ID } }]);
  });
});
