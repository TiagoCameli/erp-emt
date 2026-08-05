import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A coluna "Saldo atual" de Financeiro > Contas bancárias somava as parcelas
 * pagas no Node, com um select sem paginação. O PostgREST corta em 1.000 linhas
 * SEM ERRO, e a carga da BR-364 cria 1.696 parcelas pagas: a tela ignoraria umas
 * 696 saídas e mostraria saldo mais alto do que a conta tem, discordando de
 * Relatórios > Posição bancária. É esta coluna que se confere com o extrato.
 *
 * Este teste trava as duas metades da correção: a soma tem que vir pronta do
 * banco (nenhum `.from()` em lancamento_parcelas) e o NUMERIC que chega como
 * string tem que virar o real certo.
 */

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, from }),
}));

const { listarContas } = await import(
  "@/modules/financeiro/contas-bancarias/queries"
);

const CONTA = "11111111-1111-1111-1111-111111111111";
const OUTRA = "22222222-2222-2222-2222-222222222222";

/** Uma conta como a tabela devolve; NUMERIC pode chegar como string. */
function conta(id: string, nome: string, saldoInicial: number | string) {
  return {
    id,
    nome,
    banco: "outro",
    agencia: null,
    conta: null,
    tipo: "corrente",
    saldo_inicial: saldoInicial,
    ativo: true,
  };
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  from.mockImplementation((tabela: string) => {
    if (tabela !== "contas_bancarias") {
      throw new Error(
        `baixou linha crua de ${tabela} em vez de agregar no banco`,
      );
    }
    return {
      select: () => ({
        order: () => ({
          data: [
            conta(CONTA, "Caixa BR-364", "2000000.00"),
            conta(OUTRA, "Caixa escritório", 1000),
          ],
          error: null,
        }),
      }),
    };
  });
});

describe("listarContas", () => {
  it("tira o saldo da RPC agregada, não de uma varredura das parcelas", async () => {
    // As 1.696 parcelas pagas da BR-364 chegam como UMA linha, com o total já
    // somado no banco pelo valor líquido.
    rpc.mockResolvedValue({
      data: [
        {
          conta_bancaria_id: CONTA,
          tipo: "a_pagar",
          total: "1696000.00",
        },
        { conta_bancaria_id: CONTA, tipo: "a_receber", total: "500.00" },
      ],
      error: null,
    });

    const contas = await listarContas();

    expect(rpc).toHaveBeenCalledWith("fn_rel_posicao_bancaria");
    // Nenhuma chamada tocou a tabela de volume: se tocasse, o mock estouraria.
    expect(from).toHaveBeenCalledWith("contas_bancarias");
    expect(from).toHaveBeenCalledTimes(1);

    expect(contas.map((c) => [c.nome, c.saldoAtual])).toEqual([
      ["Caixa BR-364", 304500],
      ["Caixa escritório", 1000],
    ]);
  });

  it("conta sem parcela paga fica com o saldo inicial", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const contas = await listarContas();

    expect(contas.map((c) => c.saldoAtual)).toEqual([2000000, 1000]);
  });

  it("erro na RPC do saldo não devolve saldo errado, estoura", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(listarContas()).rejects.toThrow(
      "Não foi possível calcular o saldo das contas",
    );
  });
});
