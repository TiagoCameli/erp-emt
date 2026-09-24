import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prova das actions de transferência: a permissão é conferida ANTES de tocar no
 * banco, e a mensagem das travas (P0001) chega à tela. O valor das linhas de
 * controle está em `chamadas` ficar vazia quando a permissão falta.
 */

const estado = vi.hoisted(() => ({
  permitido: true,
  /** "recurso/acao" negados um a um (para a restauração, que pede dois). */
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
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { nome: "Diesel S10" }, error: null }) }),
      }),
    }),
  }),
}));

import {
  consultarCombustivelNaData,
  consultarEstoqueTransferencia,
  consultarPrecoMedioTanque,
  excluirTransferencia,
  restaurarTransferencia,
  salvarTransferencia,
} from "@/modules/combustivel/transferencias/actions";

const ORIGEM = "11111111-1111-4111-8111-111111111111";
const DESTINO = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";

const DADOS = {
  origemId: ORIGEM,
  destinoId: DESTINO,
  litros: 500.1234,
  valorTotal: 3198.3934,
  dataHora: "2026-09-23T14:30:00-05:00",
  observacoes: "",
};

beforeEach(() => {
  estado.permitido = true;
  estado.negadas = [];
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

  it("cria com p_id null, os litros com 4 casas e o valor da tela em p_valor_total", async () => {
    await expect(salvarTransferencia(null, DADOS)).resolves.toEqual({ ok: true, id: ID });
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
          p_valor_total: 3198.3934,
        },
      },
    ]);
  });

  it("edição sem mexer no valor não manda p_valor_total (o banco mantém o salvo)", async () => {
    await expect(salvarTransferencia(ID, { ...DADOS, valorTotal: null })).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas).toHaveLength(1);
    expect(estado.chamadas[0]?.args).not.toHaveProperty("p_valor_total");
    expect(estado.chamadas[0]?.args).toMatchObject({ p_id: ID, p_litros: 500.1234 });
  });

  it("edição com valor digitado manda o valor novo", async () => {
    await salvarTransferencia(ID, { ...DADOS, valorTotal: 1000 });
    expect(estado.chamadas[0]?.args).toMatchObject({ p_id: ID, p_valor_total: 1000 });
  });

  it("dado inválido não chega ao banco", async () => {
    await expect(salvarTransferencia(null, { ...DADOS, litros: 1.12345 })).resolves.toHaveProperty("erro");
    await expect(salvarTransferencia(null, { ...DADOS, destinoId: ORIGEM })).resolves.toHaveProperty("erro");
    await expect(salvarTransferencia(null, { ...DADOS, valorTotal: -1 })).resolves.toHaveProperty("erro");
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

describe("restaurarTransferencia", () => {
  it("sem a lixeira OU sem excluir o recurso, não chama o banco", async () => {
    estado.negadas = ["administracao.lixeira/editar"];
    await expect(restaurarTransferencia(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar transferências" });
    estado.negadas = ["combustivel.transferencias/excluir"];
    await expect(restaurarTransferencia(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar transferências" });
    expect(estado.chamadas).toEqual([]);
  });

  it("com as duas, restaura pela RPC da lixeira do combustível", async () => {
    estado.resposta = { data: null, error: null };
    await expect(restaurarTransferencia(ID)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      { fn: "fn_comb_restaurar", args: { p_tabela: "combustivel_transferencias", p_id: ID } },
    ]);
  });

  it("a recusa do banco chega à tela", async () => {
    const mensagem = "Registro não encontrado ou não está excluído";
    estado.resposta = { data: null, error: { code: "P0001", message: mensagem } };
    await expect(restaurarTransferencia(ID)).resolves.toEqual({ erro: mensagem });
  });
});

describe("consultas do formulário", () => {
  it("preço médio vem da RPC da vida do tanque", async () => {
    estado.resposta = { data: "6.3947", error: null };
    await expect(consultarPrecoMedioTanque(ORIGEM)).resolves.toEqual({ ok: true, preco: 6.3947 });
    expect(estado.chamadas[0]).toEqual({ fn: "fn_comb_preco_medio_tanque", args: { p_tanque: ORIGEM } });
  });

  it("combustível na data volta pelo nome, e null quando o tanque não tem fonte", async () => {
    estado.resposta = { data: "44444444-4444-4444-8444-444444444444", error: null };
    await expect(consultarCombustivelNaData(ORIGEM, DADOS.dataHora)).resolves.toEqual({ ok: true, nome: "Diesel S10" });
    estado.resposta = { data: null, error: null };
    await expect(consultarCombustivelNaData(ORIGEM, DADOS.dataHora)).resolves.toEqual({ ok: true, nome: null });
  });

  it("sem ver, não consulta", async () => {
    estado.permitido = false;
    await expect(consultarPrecoMedioTanque(ORIGEM)).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });
});
