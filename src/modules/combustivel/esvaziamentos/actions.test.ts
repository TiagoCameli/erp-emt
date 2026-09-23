import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  permitido: true,
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  resposta: { data: null as unknown, error: null as { code?: string; message?: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async () => {
    if (!estado.permitido) throw new Error("Sem permissão");
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
  consultarEstoqueEsvaziamento,
  excluirEsvaziamento,
  registrarEsvaziamento,
} from "@/modules/combustivel/esvaziamentos/actions";

const TANQUE = "11111111-1111-4111-8111-111111111111";
const ID = "33333333-3333-4333-8333-333333333333";

const DADOS = {
  tanqueId: TANQUE,
  litros: 155.6,
  motivo: "Diesel contaminado",
  dataHora: "2026-09-23T07:05:00-05:00",
};

beforeEach(() => {
  estado.permitido = true;
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

  it("chama a RPC com os nomes que ela lê", async () => {
    await expect(registrarEsvaziamento(DADOS)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      {
        fn: "fn_comb_registrar_esvaziamento",
        args: {
          p_tanque: TANQUE,
          p_litros: 155.6,
          p_motivo: "Diesel contaminado",
          p_data_hora: "2026-09-23T07:05:00-05:00",
        },
      },
    ]);
  });

  it("sem motivo não chega ao banco", async () => {
    await expect(registrarEsvaziamento({ ...DADOS, motivo: " " })).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });

  it("a recusa do banco (P0001) chega à tela", async () => {
    const mensagem = "Tanque externo não se esvazia: o estoque é do dono";
    estado.resposta = { data: null, error: { code: "P0001", message: mensagem } };
    await expect(registrarEsvaziamento(DADOS)).resolves.toEqual({ erro: mensagem });
  });

  it("saldo negativo (23514 da trava) chega à tela", async () => {
    const mensagem = "O tanque ficaria com saldo negativo em algum momento: confira as datas e os litros";
    estado.resposta = { data: null, error: { code: "23514", message: mensagem } };
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

describe("consultarEstoqueEsvaziamento", () => {
  it("devolve o estoque na data, sem p_excluir", async () => {
    estado.resposta = { data: "155.6000", error: null };
    await expect(consultarEstoqueEsvaziamento(TANQUE, DADOS.dataHora)).resolves.toEqual({ ok: true, litros: 155.6 });
    expect(estado.chamadas[0]).toEqual({
      fn: "fn_comb_estoque_na_data",
      args: { p_tanque: TANQUE, p_data: DADOS.dataHora },
    });
  });
});
