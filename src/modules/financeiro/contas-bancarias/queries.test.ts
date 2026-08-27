import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A coluna "Saldo atual" de Financeiro > Contas bancárias somava as parcelas
 * pagas no Node, com um select sem paginação. O PostgREST corta em 1.000 linhas
 * SEM ERRO, e a carga da BR-364 cria 1.696 parcelas pagas: a tela ignoraria umas
 * 696 saídas e mostraria saldo mais alto do que a conta tem. É esta coluna que se
 * confere com o extrato do banco.
 *
 * Desde 27/08/2026 o dinheiro por conta vem de UMA função,
 * `fn_saldos_das_contas`, que já soma no banco E já filtra por permissão. O que
 * este arquivo trava:
 *
 *   1. o saldo vem PRONTO do banco (nenhum `.from()` em lancamento_parcelas);
 *   2. `saldo_inicial` NÃO é pedido no select do cadastro — o `authenticated`
 *      perdeu o SELECT nessa coluna, e pedi-la derruba a tela com
 *      "permission denied";
 *   3. conta AUSENTE da função é conta sem permissão: saldo null, nome presente.
 *      Nunca saldo zero;
 *   4. NUMERIC que chega como string vira o real certo;
 *   5. erro na função ESTOURA, em vez de devolver saldo errado.
 */

const { rpc, from, selectRecebido } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  selectRecebido: { valor: "" },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, from }),
}));

const { listarContas } = await import(
  "@/modules/financeiro/contas-bancarias/queries"
);

const CONTA = "11111111-1111-1111-1111-111111111111";
const OUTRA = "22222222-2222-2222-2222-222222222222";

/**
 * Uma conta como a tabela devolve. SEM `saldo_inicial`: a coluna não é mais
 * legível pelo client, e o cadastro só traz identificação.
 */
function conta(
  id: string,
  nome: string,
  saldoInicialData: string | null = null,
) {
  return {
    id,
    nome,
    banco: "outro",
    agencia: null,
    conta: null,
    tipo: "corrente",
    saldo_inicial_data: saldoInicialData,
    ativo: true,
  };
}

/** Uma linha de `fn_saldos_das_contas`. NUMERIC pode chegar como string. */
function dinheiro(opcoes: {
  conta: string;
  saldoInicial: number | string;
  entradas?: number | string;
  saidas?: number | string;
  saldo: number | string;
  saldoInicialData?: string | null;
  anteriorParcelas?: number | null;
  anteriorRecebido?: number | string | null;
  anteriorPago?: number | string | null;
  aplicado?: number | string | null;
  resgatado?: number | string | null;
  posicaoAplicacao?: number | string | null;
}) {
  return {
    conta_bancaria_id: opcoes.conta,
    saldo_inicial: opcoes.saldoInicial,
    saldo_inicial_data: opcoes.saldoInicialData ?? null,
    entradas: opcoes.entradas ?? 0,
    saidas: opcoes.saidas ?? 0,
    saldo: opcoes.saldo,
    anterior_parcelas: opcoes.anteriorParcelas ?? null,
    anterior_recebido: opcoes.anteriorRecebido ?? null,
    anterior_pago: opcoes.anteriorPago ?? null,
    aplicado: opcoes.aplicado ?? null,
    resgatado: opcoes.resgatado ?? null,
    posicao_aplicacao: opcoes.posicaoAplicacao ?? null,
  };
}

/**
 * Responde por NOME da RPC de propósito. Um `mockResolvedValue` único
 * responderia a mesma coisa para qualquer função, e um teste passaria com a
 * função errada recebendo as linhas da outra — verde, medindo nada.
 */
function saldos(
  resposta: { data: unknown[] | null; error: { message: string } | null } = {
    data: [],
    error: null,
  },
) {
  rpc.mockImplementation(async (nome: string) => {
    if (nome === "fn_saldos_das_contas") return resposta;
    // As agregadas antigas perderam o EXECUTE do `authenticated`: se alguma
    // voltar a ser chamada daqui, isto grita em vez de devolver dado.
    throw new Error(`RPC inesperada: ${nome}`);
  });
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  selectRecebido.valor = "";
  from.mockImplementation((tabela: string) => {
    if (tabela !== "contas_bancarias") {
      throw new Error(
        `baixou linha crua de ${tabela} em vez de agregar no banco`,
      );
    }
    return {
      select: (colunas: string) => {
        selectRecebido.valor = colunas;
        return {
          order: () => ({
            data: [conta(CONTA, "Caixa BR-364"), conta(OUTRA, "Caixa escritório")],
            error: null,
          }),
        };
      },
    };
  });
});

describe("listarContas", () => {
  it("tira o saldo da função agregada, não de uma varredura das parcelas", async () => {
    // As 1.696 parcelas pagas da BR-364 chegam como UMA linha, com o total já
    // somado no banco pelo valor líquido.
    saldos({
      data: [
        dinheiro({
          conta: CONTA,
          saldoInicial: "2000000.00",
          entradas: "500.00",
          saidas: "1696000.00",
          saldo: "304500.00",
        }),
        dinheiro({ conta: OUTRA, saldoInicial: 1000, saldo: 1000 }),
      ],
      error: null,
    });

    const contas = await listarContas();

    expect(rpc).toHaveBeenCalledWith("fn_saldos_das_contas");
    // Nenhuma chamada tocou a tabela de volume: se tocasse, o mock estouraria.
    expect(from).toHaveBeenCalledWith("contas_bancarias");
    expect(from).toHaveBeenCalledTimes(1);

    expect(contas.map((c) => [c.nome, c.saldoAtual])).toEqual([
      ["Caixa BR-364", 304500],
      ["Caixa escritório", 1000],
    ]);
  });

  it("NÃO pede saldo_inicial no select do cadastro", async () => {
    // O `authenticated` perdeu o SELECT nessa coluna em 27/08/2026 (é o que
    // impede ler o saldo por consulta direta). Pedi-la aqui devolveria
    // "permission denied for table contas_bancarias" e derrubaria a tela inteira
    // — em produção, para todo mundo, inclusive Admin.
    saldos();

    await listarContas();

    expect(selectRecebido.valor).not.toContain("saldo_inicial,");
    expect(selectRecebido.valor).toContain("saldo_inicial_data");
    expect(selectRecebido.valor).toContain("nome");
  });

  it("conta fora da resposta é conta SEM PERMISSÃO: saldo null, nome presente", async () => {
    // O pedido do Tiago em uma asserção: o nome aparece, o saldo não.
    saldos({
      data: [dinheiro({ conta: CONTA, saldoInicial: 500, saldo: 700 })],
      error: null,
    });

    const contas = await listarContas();

    expect(contas.map((c) => [c.nome, c.podeVerSaldo, c.saldoAtual])).toEqual([
      ["Caixa BR-364", true, 700],
      ["Caixa escritório", false, null],
    ]);
    // E o saldo inicial também fica escondido: ele É dinheiro.
    expect(contas[1].saldoInicial).toBeNull();
  });

  it("saldo null NÃO é saldo zero", async () => {
    // A CAIXINHA DE DINHEIRO tem saldo R$ 0,00 de verdade. Se `null` e `0`
    // ficassem iguais, a tela mostraria zero para uma conta com milhões.
    saldos({
      data: [dinheiro({ conta: CONTA, saldoInicial: 0, saldo: 0 })],
      error: null,
    });

    const contas = await listarContas();

    expect(contas[0].saldoAtual).toBe(0);
    expect(contas[0].podeVerSaldo).toBe(true);
    expect(contas[1].saldoAtual).toBeNull();
    expect(contas[1].podeVerSaldo).toBe(false);
  });

  it("NUMERIC que chega como string vira o real certo", async () => {
    saldos({
      data: [
        dinheiro({
          conta: CONTA,
          saldoInicial: "155484.34",
          saldo: "303864.35",
        }),
      ],
      error: null,
    });

    const contas = await listarContas();

    expect(contas[0].saldoInicial).toBe(155484.34);
    expect(contas[0].saldoAtual).toBe(303864.35);
  });

  it("erro na função do saldo não devolve saldo errado, estoura", async () => {
    saldos({ data: null, error: { message: "boom" } });

    await expect(listarContas()).rejects.toThrow(
      "Não foi possível calcular o saldo das contas",
    );
  });

  it("sem data de corte, a linha diz isso: null, e nada fora do saldo", async () => {
    saldos({
      data: [dinheiro({ conta: CONTA, saldoInicial: 1000, saldo: 1000 })],
      error: null,
    });

    const contas = await listarContas();

    expect(contas[0].saldoInicialData).toBeNull();
    expect(contas[0].movimentoAnteriorAoCorte).toBeNull();
  });

  it("com data de corte, a data e o movimento de fora chegam na linha", async () => {
    // A data vem do CADASTRO (ela não é dinheiro e continua legível sem
    // permissão); o movimento de fora vem da função, porque são valores.
    from.mockImplementation(() => ({
      select: (colunas: string) => {
        selectRecebido.valor = colunas;
        return {
          order: () => ({
            data: [conta(CONTA, "Caixa BR-364", "2026-08-21")],
            error: null,
          }),
        };
      },
    }));
    saldos({
      data: [
        dinheiro({
          conta: CONTA,
          saldoInicial: 1000,
          saldo: 1000,
          anteriorParcelas: 5573,
          anteriorRecebido: "10.00",
          anteriorPago: "4290000.00",
        }),
      ],
      error: null,
    });

    const contas = await listarContas();

    expect(contas[0].saldoInicialData).toBe("2026-08-21");
    expect(contas[0].movimentoAnteriorAoCorte).toEqual({
      parcelas: 5573,
      recebido: 10,
      pago: 4290000,
    });
  });

  it("a posição em aplicação chega na linha, e negativa não é arredondada para zero", async () => {
    // Negativo é IMPOSSÍVEL (não se resgata mais principal do que se aplica) e é
    // o tamanho do furo: some com ele e o alerta da tela some junto.
    saldos({
      data: [
        dinheiro({
          conta: CONTA,
          saldoInicial: 1000,
          saldo: 1000,
          aplicado: "100.00",
          resgatado: "3670000.00",
          posicaoAplicacao: "-3569900.00",
        }),
      ],
      error: null,
    });

    const contas = await listarContas();

    expect(contas[0].posicaoAplicacao).toEqual({
      aplicado: 100,
      resgatado: 3670000,
      posicao: -3569900,
    });
  });

  it("a posição em aplicação NÃO entra no saldo", async () => {
    // Opção A (22/08/2026): o saldo inicial já vem do extrato COM o aplicado
    // dentro, então somar a posição de novo contaria o mesmo dinheiro duas vezes.
    saldos({
      data: [
        dinheiro({
          conta: CONTA,
          saldoInicial: 1000,
          saldo: 1000,
          aplicado: "500.00",
          resgatado: "0.00",
          posicaoAplicacao: "500.00",
        }),
      ],
      error: null,
    });

    const contas = await listarContas();

    expect(contas[0].saldoAtual).toBe(1000);
  });

  it("erro no cadastro das contas estoura com a mensagem do cadastro", async () => {
    from.mockImplementation(() => ({
      select: () => ({ order: () => ({ data: null, error: { message: "x" } }) }),
    }));
    saldos();

    await expect(listarContas()).rejects.toThrow(
      "Não foi possível carregar as contas bancárias",
    );
  });
});
