import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  movimentoPorContaEmCentavos,
  saldoAtualDaConta,
} from "@/modules/financeiro/contas-bancarias/saldo";
import type {
  BancoConta,
  TipoConta,
} from "@/modules/financeiro/contas-bancarias/schemas";

/**
 * Movimento que a data de corte deixou FORA do saldo. Existe para a tela poder
 * dizer isso em voz alta: uma data de corte que esconde pagamento em silêncio é
 * um segundo plug, e o primeiro passou meses sem ninguém notar.
 */
export interface MovimentoAnteriorAoCorte {
  parcelas: number;
  recebido: number;
  pago: number;
}

/** Linha da listagem de contas, já com o saldo atual calculado. */
export interface ContaLista {
  id: string;
  nome: string;
  banco: BancoConta;
  agencia: string | null;
  conta: string | null;
  tipo: TipoConta;
  saldoInicial: number;
  /** Data do extrato de onde `saldoInicial` foi lido. Null = conta tudo. */
  saldoInicialData: string | null;
  /** Saldo inicial + movimento das parcelas pagas nesta conta. Ver listarContas. */
  saldoAtual: number;
  /** Null quando não há corte, ou quando o corte não deixou nada de fora. */
  movimentoAnteriorAoCorte: MovimentoAnteriorAoCorte | null;
  ativo: boolean;
}

/**
 * Lista todas as contas bancárias com o saldo atual calculado.
 *
 * Cálculo do saldo atual de cada conta:
 *   saldoAtual = saldo_inicial + soma do movimento das parcelas PAGAS desta conta
 *
 * A soma sai do BANCO, agregada por `fn_rel_posicao_bancaria`, nunca de uma
 * varredura das parcelas somada aqui. Isso não é preferência de estilo: o
 * PostgREST corta a resposta em 1.000 linhas SEM ERRO NENHUM, e a carga da
 * BR-364 cria 1.696 parcelas pagas. Somando no Node, a coluna "Saldo atual"
 * ignoraria em silêncio umas 696 saídas, mostraria saldo MAIS ALTO do que a
 * conta tem e discordaria de Relatórios > Posição bancária. É justamente esta
 * coluna que é conferida contra o extrato do banco.
 *
 * A RPC devolve no máximo duas linhas por conta (uma por tipo de lançamento),
 * então o volume de linhas não cresce com o número de pagamentos e o teto de
 * 1.000 nunca é alcançado. É a mesma função que Posição bancária lê, e é a
 * função do banco (não o TypeScript) o contrato compartilhado entre as duas
 * telas: elas não têm como divergir.
 *
 * O que a RPC soma é `valor_liquido` (valor menos desconto), nunca `valor`: de
 * uma parcela paga com desconto só saiu da conta o líquido. Ela também deixa
 * fora lançamento cancelado, com o mesmo critério das outras fn_rel_*.
 *
 * O sinal do movimento vem do tipo do lançamento: a_receber soma (entrou),
 * a_pagar subtrai (saiu). Parcela sem conta_bancaria_id ou em qualquer status
 * diferente de 'pago' não entra na RPC e não afeta saldo nenhum.
 *
 * A listagem traz conta ativa e inativa, porque dinheiro parado em conta
 * desativada continua existindo; a RPC cobre as duas do mesmo jeito. O sinal e
 * a aritmética em centavos moram em ./saldo.ts, que tem teste.
 *
 * DATA DE CORTE: quando a conta tem `saldo_inicial_data`, a própria RPC só soma
 * o movimento POSTERIOR àquela data, e o saldo passa a ser "o saldo do extrato
 * naquele dia mais o que veio depois". Por isso o corte não aparece na
 * aritmética daqui — ele já veio aplicado. O que esta função busca a mais é o
 * movimento que ficou de fora, para a tela mostrar a escolha em vez de esconder.
 */
export async function listarContas(): Promise<ContaLista[]> {
  const supabase = await createClient();

  const [contasResultado, movimentosResultado, anterioresResultado] =
    await Promise.all([
    supabase
      .from("contas_bancarias")
      .select(
        "id, nome, banco, agencia, conta, tipo, saldo_inicial, saldo_inicial_data, ativo",
      )
      .order("nome"),
    supabase.rpc("fn_rel_posicao_bancaria"),
    supabase.rpc("fn_rel_movimento_antes_do_corte"),
  ]);

  if (contasResultado.error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }
  if (movimentosResultado.error) {
    throw new Error("Não foi possível calcular o saldo das contas");
  }
  if (anterioresResultado.error) {
    throw new Error("Não foi possível apurar o movimento anterior ao corte");
  }

  const anteriorPorConta = new Map<string, MovimentoAnteriorAoCorte>();
  for (const linha of anterioresResultado.data ?? []) {
    anteriorPorConta.set(linha.conta_bancaria_id, {
      parcelas: linha.parcelas,
      recebido: Number(linha.recebido),
      pago: Number(linha.pago),
    });
  }

  // Movimento por conta, em centavos, a partir das linhas já agregadas.
  const movimentoCentavos = movimentoPorContaEmCentavos(
    (movimentosResultado.data ?? []).map((linha) => ({
      contaBancariaId: linha.conta_bancaria_id,
      tipo: linha.tipo,
      total: linha.total,
    })),
  );

  return (contasResultado.data ?? []).map((conta) => ({
    id: conta.id,
    nome: conta.nome,
    banco: conta.banco as BancoConta,
    agencia: conta.agencia,
    conta: conta.conta,
    tipo: conta.tipo as TipoConta,
    saldoInicial: Number(conta.saldo_inicial),
    saldoInicialData: conta.saldo_inicial_data,
    saldoAtual: saldoAtualDaConta(
      conta.saldo_inicial,
      movimentoCentavos.get(conta.id) ?? 0,
    ),
    movimentoAnteriorAoCorte: anteriorPorConta.get(conta.id) ?? null,
    ativo: conta.ativo,
  }));
}
