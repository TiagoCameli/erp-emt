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
 *
 * Desde 22/08/2026 ele também cobre a DATA DE CORTE. O corte é aplicado DENTRO
 * de `fn_rel_posicao_bancaria` (a RPC já devolve só o movimento posterior), então
 * o que se testa aqui é o resto: a data chegar na linha e o movimento anterior
 * ao corte vir junto, para a tela poder dizer o que ficou de fora.
 *
 * O mock despacha por NOME da RPC de propósito. Um `mockResolvedValue` único
 * responderia a mesma coisa para as duas funções, e o teste passaria com a
 * segunda RPC recebendo linhas da primeira — verde, medindo nada.
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
function conta(
  id: string,
  nome: string,
  saldoInicial: number | string,
  saldoInicialData: string | null = null,
) {
  return {
    id,
    nome,
    banco: "outro",
    agencia: null,
    conta: null,
    tipo: "corrente",
    saldo_inicial: saldoInicial,
    saldo_inicial_data: saldoInicialData,
    ativo: true,
  };
}

/**
 * Responde por NOME: `posicao` é o movimento agregado (já com o corte aplicado
 * no banco) e `antes` é o que o corte deixou de fora.
 */
function respostas(opcoes: {
  posicao?: { data: unknown[] | null; error: { message: string } | null };
  antes?: { data: unknown[] | null; error: { message: string } | null };
  aplicacao?: { data: unknown[] | null; error: { message: string } | null };
}) {
  rpc.mockImplementation(async (nome: string) => {
    if (nome === "fn_rel_posicao_bancaria") {
      return opcoes.posicao ?? { data: [], error: null };
    }
    if (nome === "fn_rel_movimento_antes_do_corte") {
      return opcoes.antes ?? { data: [], error: null };
    }
    if (nome === "fn_rel_posicao_aplicacao") {
      return opcoes.aplicacao ?? { data: [], error: null };
    }
    throw new Error(`RPC inesperada: ${nome}`);
  });
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
    respostas({
      posicao: {
        data: [
          {
            conta_bancaria_id: CONTA,
            tipo: "a_pagar",
            total: "1696000.00",
          },
          { conta_bancaria_id: CONTA, tipo: "a_receber", total: "500.00" },
        ],
        error: null,
      },
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
    respostas({});

    const contas = await listarContas();

    expect(contas.map((c) => c.saldoAtual)).toEqual([2000000, 1000]);
  });

  it("erro na RPC do saldo não devolve saldo errado, estoura", async () => {
    respostas({ posicao: { data: null, error: { message: "boom" } } });

    await expect(listarContas()).rejects.toThrow(
      "Não foi possível calcular o saldo das contas",
    );
  });

  it("sem data de corte, a linha diz isso: null, e nada fora do saldo", async () => {
    respostas({});

    const contas = await listarContas();

    expect(contas[0]?.saldoInicialData).toBeNull();
    expect(contas[0]?.movimentoAnteriorAoCorte).toBeNull();
  });

  it("com data de corte, a data e o movimento de fora chegam na linha", async () => {
    from.mockImplementation(() => ({
      select: () => ({
        order: () => ({
          data: [conta(CONTA, "BB 30.893-5", "0.00", "2025-12-31")],
          error: null,
        }),
      }),
    }));
    respostas({
      // A RPC já devolve só o posterior ao corte: são R$ 300 mil de saída.
      posicao: {
        data: [
          { conta_bancaria_id: CONTA, tipo: "a_pagar", total: "300000.00" },
        ],
        error: null,
      },
      antes: {
        data: [
          {
            conta_bancaria_id: CONTA,
            corte: "2025-12-31",
            parcelas: 19,
            recebido: "4297142.81",
            pago: "119056.58",
          },
        ],
        error: null,
      },
    });

    const contas = await listarContas();

    // Saldo = abertura do extrato (0) mais o que veio DEPOIS. O R$ 4,29 milhões
    // anterior ao corte NÃO entra: ele já está representado na abertura.
    expect(contas[0]?.saldoAtual).toBe(-300000);
    expect(contas[0]?.saldoInicialData).toBe("2025-12-31");
    expect(contas[0]?.movimentoAnteriorAoCorte).toEqual({
      parcelas: 19,
      recebido: 4297142.81,
      pago: 119056.58,
    });
  });

  it("a posição em aplicação chega na linha, e negativa não é arredondada para zero", async () => {
    // Opção A (22/08/2026): a varredura não mexe mais no saldo, então a posição
    // em aplicação é número de CONFERÊNCIA. Negativa é impossível e mede o
    // extrato que falta importar: é o caso real da conta da Caixa. Se algum dia
    // alguém "consertar" isso com Math.max(0, ...), este teste cai.
    respostas({
      aplicacao: {
        data: [
          {
            conta_bancaria_id: CONTA,
            aplicado: "4522847.75",
            resgatado: "8093863.71",
            posicao: "-3571015.96",
          },
        ],
        error: null,
      },
    });

    const contas = await listarContas();

    expect(contas[0]?.posicaoAplicacao).toEqual({
      aplicado: 4522847.75,
      resgatado: 8093863.71,
      posicao: -3571015.96,
    });
    // A conta que não aparece na RPC fica null, não zero: "nunca teve aplicação"
    // e "aplicou e resgatou o mesmo valor" são fatos diferentes.
    expect(contas[1]?.posicaoAplicacao).toBeNull();
  });

  it("a posição em aplicação NÃO entra no saldo", async () => {
    // O saldo inicial já vem do extrato com o que está aplicado (opção A), então
    // somar a posição aqui contaria o mesmo dinheiro duas vezes.
    respostas({
      aplicacao: {
        data: [
          {
            conta_bancaria_id: CONTA,
            aplicado: "900000.00",
            resgatado: "100000.00",
            posicao: "800000.00",
          },
        ],
        error: null,
      },
    });

    const contas = await listarContas();

    expect(contas[0]?.saldoAtual).toBe(2000000);
  });

  it("erro ao apurar a posição em aplicação estoura em vez de dizer 'nada'", async () => {
    respostas({ aplicacao: { data: null, error: { message: "boom" } } });

    await expect(listarContas()).rejects.toThrow(
      "Não foi possível apurar a posição em aplicação",
    );
  });

  it("erro ao apurar o que ficou fora do corte estoura em vez de dizer 'nada'", async () => {
    // Devolver null calado faria a tela mostrar "desde 31/12/2025" sem dizer
    // que escondeu R$ 4,29 milhões. É o defeito que a data de corte veio
    // consertar, cometido de novo um nível acima.
    respostas({ antes: { data: null, error: { message: "boom" } } });

    await expect(listarContas()).rejects.toThrow(
      "Não foi possível apurar o movimento anterior ao corte",
    );
  });
});
