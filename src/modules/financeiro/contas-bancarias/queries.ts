import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  extratoFechaNoSaldo,
  montarExtrato,
  type MovimentoExtrato,
  type TipoMovimento,
} from "@/modules/financeiro/contas-bancarias/extrato";
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

/**
 * Principal aplicado menos resgatado, por conta. NÃO é parcela do saldo: desde a
 * opção A (22/08/2026) o `saldoInicial` já vem do extrato COM o que está
 * aplicado, e a varredura não mexe no saldo. Este número é de CONFERÊNCIA, e a
 * regra dele é simples: tem que ser maior ou igual a zero, porque não existe
 * resgatar mais principal do que se aplicou.
 *
 * Negativo significa aplicação que ninguém importou do extrato, e mede
 * exatamente quanto o saldo da conta está abaixo do real por isso.
 */
export interface PosicaoAplicacao {
  aplicado: number;
  resgatado: number;
  /** aplicado − resgatado. Negativo é impossível, e é o tamanho do furo. */
  posicao: number;
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
  /** Null quando a conta nunca teve aplicação nem resgate registrado. */
  posicaoAplicacao: PosicaoAplicacao | null;
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
 *
 * OPÇÃO A (22/08/2026): a RPC também ignora categoria de natureza
 * `movimentacao`, então aplicação e resgate do principal não mexem no saldo. O
 * saldo aqui é o DINHEIRO QUE A EMPRESA TEM naquele banco (corrente mais
 * aplicado), que é o número que o próprio extrato chama de "Saldo". A posição em
 * aplicação vem à parte, como conferência — ver `PosicaoAplicacao`.
 */
export async function listarContas(): Promise<ContaLista[]> {
  const supabase = await createClient();

  const [
    contasResultado,
    movimentosResultado,
    anterioresResultado,
    aplicacaoResultado,
  ] = await Promise.all([
    supabase
      .from("contas_bancarias")
      .select(
        "id, nome, banco, agencia, conta, tipo, saldo_inicial, saldo_inicial_data, ativo",
      )
      .order("nome"),
    supabase.rpc("fn_rel_posicao_bancaria"),
    supabase.rpc("fn_rel_movimento_antes_do_corte"),
    supabase.rpc("fn_rel_posicao_aplicacao"),
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
  if (aplicacaoResultado.error) {
    throw new Error("Não foi possível apurar a posição em aplicação");
  }

  const anteriorPorConta = new Map<string, MovimentoAnteriorAoCorte>();
  for (const linha of anterioresResultado.data ?? []) {
    anteriorPorConta.set(linha.conta_bancaria_id, {
      parcelas: linha.parcelas,
      recebido: Number(linha.recebido),
      pago: Number(linha.pago),
    });
  }

  const aplicacaoPorConta = new Map<string, PosicaoAplicacao>();
  for (const linha of aplicacaoResultado.data ?? []) {
    aplicacaoPorConta.set(linha.conta_bancaria_id, {
      aplicado: Number(linha.aplicado),
      resgatado: Number(linha.resgatado),
      posicao: Number(linha.posicao),
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
    posicaoAplicacao: aplicacaoPorConta.get(conta.id) ?? null,
    ativo: conta.ativo,
  }));
}

/**
 * Uma conta pela chave, com o saldo atual calculado.
 *
 * Chama `listarContas()` e escolhe a linha, em vez de ter uma consulta própria de
 * uma conta. Isso é DE PROPÓSITO, e o motivo é o número: a tela de extrato mostra
 * o saldo atual da conta no cartão e fecha o saldo acumulado da tabela nele. Uma
 * segunda consulta com fórmula própria seria uma segunda fonte do mesmo saldo, e
 * duas fontes divergem na primeira regra acrescentada de um lado só — foi assim
 * que o guard de `fn_pagar_parcela` passou a recusar todo pagamento da conta
 * operacional, com R$ 22.326,46 na tela e R$ -33.173.201,31 no guard.
 *
 * O custo é o de quatro RPCs agregadas, as mesmas que a listagem já roda: elas
 * devolvem no máximo duas linhas por conta, não uma por pagamento.
 */
export async function buscarConta(id: string): Promise<ContaLista | null> {
  const contas = await listarContas();
  return contas.find((conta) => conta.id === id) ?? null;
}

/** O extrato de uma conta, pronto para a tela. */
export interface ExtratoDaConta {
  movimentos: MovimentoExtrato[];
  /**
   * Onde o saldo acumulado fechou. Tem que ser igual a `conta.saldoAtual`; ver
   * `fechaNoSaldo`.
   */
  saldoFinal: number;
  /**
   * LINHA DE CONTROLE: o saldo acumulado do extrato fechou no saldo que a
   * listagem de contas mostra? False é bug de regra de dinheiro, e a tela diz
   * isso em voz alta em vez de exibir dois números diferentes calada.
   */
  fechaNoSaldo: boolean;
}

/** Só os três valores que `fn_extrato_conta` devolve em `tipo_movimento`. */
function tipoDoMovimento(valor: string): TipoMovimento {
  return valor === "transferencia" || valor === "tarifa" ? valor : "parcela";
}

/**
 * Extrato de uma conta: uma linha por movimento, com o saldo acumulado.
 *
 * As linhas saem de `fn_extrato_conta`, gêmea DETALHADA de
 * `fn_rel_posicao_bancaria` (a que dá o saldo da listagem), repetindo o WHERE
 * dela: parcela paga pelo valor líquido, sem lançamento cancelado, sem categoria
 * de natureza 'movimentacao', mais as transferências das duas pontas e a tarifa.
 * É a FUNÇÃO DO BANCO o contrato compartilhado entre extrato e saldo; em
 * PostgREST dois desses filtros não se escrevem sem mentir (o porquê está no
 * comentário da migration 20260826170000).
 *
 * `todasAsLinhas` não é zelo: a BB 102.124-9 tem 5.939 movimentos registrados, e
 * o PostgREST corta a resposta em 1.000 SEM ERRO NENHUM. Uma consulta solta
 * esconderia 4.939 linhas de dinheiro em silêncio, e o extrato fecharia num saldo
 * inventado.
 *
 * A ordenação é repetida aqui, igual à de dentro da função, porque a paginação
 * depende dela: `range()` sem ordem estável repete linha numa página e perde
 * outra na seguinte. O desempate por `chave` é o que dá a estabilidade quando
 * dezenas de movimentos caem no mesmo dia — e uma transferência com tarifa gera
 * duas linhas na mesma data, então nem a data mais o id bastariam.
 */
export async function listarExtratoDaConta(
  conta: ContaLista,
  incluirAnteriores: boolean,
): Promise<ExtratoDaConta> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .rpc("fn_extrato_conta", {
        p_conta: conta.id,
        p_incluir_anteriores: incluirAnteriores,
      })
      .order("data_movimento", { nullsFirst: true })
      .order("chave")
      .range(de, ate),
  );

  // Erro no meio da paginação devolve o que já veio. Meio extrato exibido como se
  // fosse o extrato inteiro é pior que tela de erro: o saldo acumulado fecharia
  // num número que não é o da conta e ninguém teria como saber.
  if (erro) {
    throw new Error("Não foi possível carregar o extrato da conta");
  }

  const { movimentos, saldoFinal } = montarExtrato(
    conta.saldoInicial,
    linhas.map((linha) => ({
      chave: linha.chave,
      tipo: tipoDoMovimento(linha.tipo_movimento),
      lancamentoId: linha.lancamento_id,
      data: linha.data_movimento,
      entrada: linha.sentido === "entrada",
      valor: linha.valor,
      noSaldo: linha.no_saldo,
      numero: linha.numero,
      numeroDocumento: linha.numero_documento,
      descricao: linha.descricao,
      categoriaNome: linha.categoria_nome,
      contraparte: linha.contraparte,
      parcela: linha.parcela,
    })),
  );

  return {
    movimentos,
    saldoFinal,
    fechaNoSaldo: extratoFechaNoSaldo(saldoFinal, conta.saldoAtual),
  };
}
