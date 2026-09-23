import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  permitido: true,
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  resposta: { data: null as unknown, error: null as { code?: string; message?: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async (recurso: string, acao: string) => {
    if (!estado.permitido || estado.negadas.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
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
  excluirEsvaziamento,
  registrarEsvaziamento,
  restaurarEsvaziamento,
} from "@/modules/combustivel/esvaziamentos/actions";

const TANQUE = "11111111-1111-4111-8111-111111111111";
const ID = "33333333-3333-4333-8333-333333333333";

const DADOS = { tanqueId: TANQUE, motivo: "Diesel contaminado" };

beforeEach(() => {
  estado.permitido = true;
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: ID, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("registrarEsvaziamento", () => {
  it("sem permissão volta erro e não chama o banco", async () => {
    estado.permitido = false;
    await expect(registrarEsvaziamento(DADOS)).resolves.toEqual({ erro: "Sem permissão para esvaziar tanques" });
    expect(estado.chamadas).toEqual([]);
  });

  it("chama a RPC só com o tanque e o motivo (o banco grava o nível inteiro, agora)", async () => {
    await expect(registrarEsvaziamento(DADOS)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      { fn: "fn_comb_registrar_esvaziamento", args: { p_tanque: TANQUE, p_motivo: "Diesel contaminado" } },
    ]);
  });

  it("motivo com menos de 3 caracteres não chega ao banco", async () => {
    await expect(registrarEsvaziamento({ ...DADOS, motivo: " " })).resolves.toHaveProperty("erro");
    await expect(registrarEsvaziamento({ ...DADOS, motivo: " ab " })).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });

  it("a recusa do banco (P0001) chega à tela", async () => {
    const mensagem = "O tanque já está vazio";
    estado.resposta = { data: null, error: { code: "P0001", message: mensagem } };
    await expect(registrarEsvaziamento(DADOS)).resolves.toEqual({ erro: mensagem });
  });
});

describe("excluirEsvaziamento", () => {
  it("sem permissão não chama o banco", async () => {
    estado.permitido = false;
    await expect(excluirEsvaziamento(ID, "Errado")).resolves.toEqual({
      erro: "Sem permissão para excluir esvaziamentos",
    });
    expect(estado.chamadas).toEqual([]);
  });

  it("exclui pela lixeira com motivo", async () => {
    await expect(excluirEsvaziamento(ID, "Registrado no tanque errado")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      {
        fn: "fn_comb_excluir",
        args: { p_tabela: "combustivel_esvaziamentos", p_id: ID, p_motivo: "Registrado no tanque errado" },
      },
    ]);
  });

  it("ciclo fechado recusa com a mensagem do banco", async () => {
    const mensagem = "Movimento de ciclo fechado (antes do reabastecimento de 20/09/2026 08:00): não se altera nem exclui";
    estado.resposta = { data: null, error: { code: "P0001", message: mensagem } };
    await expect(excluirEsvaziamento(ID, "Errado")).resolves.toEqual({ erro: mensagem });
  });
});

describe("restaurarEsvaziamento", () => {
  it("sem a lixeira OU sem excluir esvaziamentos, não chama o banco", async () => {
    estado.negadas = ["administracao.lixeira/editar"];
    await expect(restaurarEsvaziamento(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar esvaziamentos" });
    estado.negadas = ["combustivel.esvaziamentos/excluir"];
    await expect(restaurarEsvaziamento(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar esvaziamentos" });
    expect(estado.chamadas).toEqual([]);
  });

  it("com as duas, restaura pela RPC", async () => {
    estado.resposta = { data: null, error: null };
    await expect(restaurarEsvaziamento(ID)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      { fn: "fn_comb_restaurar", args: { p_tabela: "combustivel_esvaziamentos", p_id: ID } },
    ]);
  });
});
