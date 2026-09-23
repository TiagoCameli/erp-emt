import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prova das actions de transferência: a permissão é conferida ANTES de tocar no
 * banco, e a mensagem das travas (P0001) chega à tela. O valor das linhas de
 * controle está em `chamadas` ficar vazia quando a permissão falta.
 */

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
  consultarEstoqueTransferencia,
  excluirTransferencia,
  salvarTransferencia,
} from "@/modules/combustivel/transferencias/actions";

const ORIGEM = "11111111-1111-4111-8111-111111111111";
const DESTINO = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";

const DADOS = {
  origemId: ORIGEM,
  destinoId: DESTINO,
  litros: 500.1234,
  dataHora: "2026-09-23T14:30:00-05:00",
  observacoes: "",
};

beforeEach(() => {
  estado.permitido = true;
  estado.chamadas = [];
  estado.resposta = { data: ID, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("salvarTransferencia", () => {
  it("sem permissão volta erro e não chama o banco", async () => {
    estado.permitido = false;
    await expect(salvarTransferencia(null, DADOS)).resolves.toEqual({
      erro: "Sem permissão para lançar transferências",
    });
    await expect(salvarTransferencia(ID, DADOS)).resolves.toEqual({
      erro: "Sem permissão para editar transferências",
    });
    expect(estado.chamadas).toEqual([]);
  });

  it("cria com p_id null e os litros com 4 casas", async () => {
    await expect(salvarTransferencia(null, DADOS)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      {
        fn: "fn_comb_salvar_transferencia",
        args: {
          p_id: null,
          p_origem: ORIGEM,
          p_destino: DESTINO,
          p_litros: 500.1234,
          p_data_hora: "2026-09-23T14:30:00-05:00",
          p_observacoes: "",
        },
      },
    ]);
  });

  it("dado inválido não chega ao banco", async () => {
    await expect(salvarTransferencia(null, { ...DADOS, litros: 1.12345 })).resolves.toHaveProperty("erro");
    await expect(salvarTransferencia(null, { ...DADOS, destinoId: ORIGEM })).resolves.toHaveProperty("erro");
    await expect(salvarTransferencia("x", DADOS)).resolves.toEqual({ erro: "Transferência inválida" });
    expect(estado.chamadas).toEqual([]);
  });

  it("a trava do banco (P0001) chega à tela com a mensagem dela", async () => {
    const mensagem = "Movimento de ciclo fechado (antes do reabastecimento de 20/09/2026 08:00): não se altera nem exclui";
    estado.resposta = { data: null, error: { code: "P0001", message: mensagem } };
    await expect(salvarTransferencia(ID, DADOS)).resolves.toEqual({ erro: mensagem });
  });

  it("erro de infraestrutura não vaza", async () => {
    estado.resposta = { data: null, error: { code: "08006", message: "connection failure" } };
    await expect(salvarTransferencia(null, DADOS)).resolves.toEqual({
      erro: "Não foi possível salvar a transferência. Tente novamente",
    });
  });
});

describe("excluirTransferencia", () => {
  it("sem permissão ou sem motivo não chama o banco", async () => {
    await expect(excluirTransferencia(ID, "   ")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
    estado.permitido = false;
    await expect(excluirTransferencia(ID, "Lançada em duplicidade")).resolves.toEqual({
      erro: "Sem permissão para excluir transferências",
    });
    expect(estado.chamadas).toEqual([]);
  });

  it("exclui pela lixeira do combustível, com o motivo aparado", async () => {
    await expect(excluirTransferencia(ID, "  Lançada em duplicidade ")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      {
        fn: "fn_comb_excluir",
        args: { p_tabela: "combustivel_transferencias", p_id: ID, p_motivo: "Lançada em duplicidade" },
      },
    ]);
  });

  it("saldo negativo ao excluir chega à tela", async () => {
    const mensagem = "O tanque ficaria com saldo negativo em algum momento: confira as datas e os litros";
    estado.resposta = { data: null, error: { code: "23514", message: mensagem } };
    await expect(excluirTransferencia(ID, "Errada")).resolves.toEqual({ erro: mensagem });
  });
});

describe("consultarEstoqueTransferencia", () => {
  it("devolve os litros e passa o id em edição para não contar a própria", async () => {
    estado.resposta = { data: 1234.5678, error: null };
    await expect(consultarEstoqueTransferencia(ORIGEM, DADOS.dataHora, ID)).resolves.toEqual({
      ok: true,
      litros: 1234.5678,
    });
    expect(estado.chamadas[0]).toEqual({
      fn: "fn_comb_estoque_na_data",
      args: { p_tanque: ORIGEM, p_data: DADOS.dataHora, p_excluir: ID },
    });
  });

  it("sem permissão de ver não consulta", async () => {
    estado.permitido = false;
    await expect(consultarEstoqueTransferencia(ORIGEM, DADOS.dataHora, null)).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });
});
