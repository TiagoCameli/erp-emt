/**
 * Regras puras do extrato de conta bancária: o saldo acumulado linha a linha e
 * as somas de entrada e saída. Sem React, sem Supabase.
 *
 * O que ESTE módulo resolve, e é o motivo dele existir separado da query:
 *
 * 1. O SALDO ACUMULADO É PROPRIEDADE DO MOVIMENTO, NÃO DA VISTA. Ele é calculado
 *    uma vez, na ordem cronológica que veio do banco, e viaja junto com a linha.
 *    Calcular na tela, sobre as linhas visíveis, quebraria no primeiro clique em
 *    "ordenar por valor" ou em qualquer filtro: a coluna passaria a somar numa
 *    ordem que não é a do dinheiro e mostraria saldo que nunca existiu, sem erro
 *    nenhum aparecer.
 *
 * 2. MOVIMENTO ANTERIOR AO CORTE NÃO ENTRA NO ACUMULADO. Quando a conta tem
 *    `saldo_inicial_data`, o saldo inicial JÁ É o saldo do extrato naquele dia, e
 *    o que veio antes já está dentro dele. Somar de novo contaria o mesmo
 *    dinheiro duas vezes. Essas linhas aparecem na tela (esconder 5.573
 *    pagamentos em silêncio é o defeito que a data de corte veio consertar), mas
 *    com o acumulado vazio, porque para elas o número não existe.
 *
 * 3. CENTAVOS INTEIROS. Mesmo conversor de ./saldo.ts e de relatorios/calculo,
 *    de propósito: o acumulado da última linha TEM que dar exatamente o "Saldo
 *    atual" que a listagem de contas mostra, e um erro de ponto flutuante em
 *    5.939 somas apareceria como divergência de centavos entre as duas telas.
 */

import {
  paraCentavos,
  paraReais,
} from "@/modules/financeiro/relatorios/calculo";

/** Os três tipos de movimento que `fn_extrato_conta` devolve. */
export type TipoMovimento = "parcela" | "transferencia" | "tarifa";

/**
 * Uma linha crua de `fn_extrato_conta`, do jeito que sai do PostgREST.
 *
 * `valor` aceita string porque NUMERIC pode chegar assim, e é sempre POSITIVO: o
 * sinal mora em `entrada`. Ter o valor absoluto separado do sentido é o que
 * permite somar entrada e saída sem varrer sinal.
 */
export interface MovimentoBruto {
  chave: string;
  tipo: TipoMovimento;
  lancamentoId: string | null;
  data: string | null;
  entrada: boolean;
  valor: number | string | null;
  noSaldo: boolean;
  numero: string | null;
  numeroDocumento: string | null;
  descricao: string | null;
  categoriaNome: string | null;
  contraparte: string | null;
  parcela: string | null;
}

/** Uma linha do extrato pronta para a tela. */
export interface MovimentoExtrato
  extends Omit<MovimentoBruto, "valor"> {
  /** Sempre positivo. */
  valor: number;
  /**
   * Valor com sinal (saída negativa). É por ele que a coluna de valor ordena:
   * ordenar pelo absoluto colocaria uma saída de R$ 100 mil ao lado de uma
   * entrada de R$ 100 mil como se fossem a mesma coisa.
   */
  valorComSinal: number;
  /**
   * Saldo da conta DEPOIS deste movimento. Null no movimento anterior à data de
   * corte, que já está dentro do saldo inicial e por isso não tem acumulado
   * próprio.
   */
  saldoAcumulado: number | null;
  /**
   * Posição desta linha na sequência cronológica que o banco devolveu (0 é a
   * mais antiga). É por ela que a coluna Data da tela ordena, e não pela data.
   *
   * O motivo é que DATA NÃO TEM HORA. Dezenas de movimentos caem no mesmo dia (a
   * BB 102.124-9 teve quatro num 28/08), então ordenar por data decrescente
   * inverte a ordem dos DIAS e deixa cada dia internamente crescente: o saldo
   * atual da conta não aparece na primeira linha, mas no fim do primeiro bloco
   * de dia. Foi o que a tela mostrou — R$ 264.170,16 no topo com R$ 159.992,48
   * de saldo atual, quatro linhas abaixo.
   *
   * Este índice é o desempate que a data não tem, e é o MESMO que o servidor
   * usou para acumular o saldo (data, depois `chave`). Ordenar por ele inverte a
   * sequência inteira, e aí a primeira linha do decrescente é, por construção, a
   * última do acumulado: o saldo atual da conta.
   */
  ordem: number;
}

/** Soma de um conjunto de movimentos, em reais. */
export interface SomaMovimentos {
  entradas: number;
  saidas: number;
  /** entradas − saídas. */
  liquido: number;
}

/**
 * Monta o extrato: calcula o saldo acumulado de cada linha a partir do saldo
 * inicial da conta.
 *
 * ORDEM: as linhas têm que chegar na ordem cronológica em que o banco as
 * devolveu (`fn_extrato_conta` já ordena por data e desempata por chave). Esta
 * função NÃO reordena, de propósito: reordenar aqui seria uma segunda regra de
 * ordem, e a do banco é a que a paginação usa.
 *
 * O acumulado só avança nas linhas com `noSaldo`. A última linha com `noSaldo`
 * fecha exatamente no saldo atual da conta — é isso que `saldoFinal` devolve, e
 * é o número que a tela confere contra a listagem de contas.
 *
 * SALDO INICIAL NULL = SEM PERMISSÃO de ver o saldo desta conta (desde
 * 27/08/2026). Nesse caso o acumulado não existe: toda linha volta com
 * `saldoAcumulado` null e `saldoFinal` null, e a tela esconde a coluna. Tratar
 * null como zero seria pior que esconder — o extrato mostraria uma coluna de
 * saldos que começa em R$ 0,00 e nunca existiu, com a cara de número certo.
 */
export function montarExtrato(
  saldoInicial: number | string | null,
  linhas: readonly MovimentoBruto[],
): { movimentos: MovimentoExtrato[]; saldoFinal: number | null } {
  const semSaldo = saldoInicial === null;
  let acumulado = paraCentavos(saldoInicial);

  const movimentos = linhas.map((linha, indice) => {
    const centavos = paraCentavos(linha.valor);
    const comSinal = linha.entrada ? centavos : -centavos;

    if (linha.noSaldo) acumulado += comSinal;

    return {
      ...linha,
      valor: paraReais(centavos),
      valorComSinal: paraReais(comSinal),
      saldoAcumulado:
        semSaldo || !linha.noSaldo ? null : paraReais(acumulado),
      // A linha anterior ao corte também é numerada, mesmo sem saldo próprio:
      // sem número ela não teria como ser ordenada junto com as outras, e o
      // escopo "tudo" voltaria a embaralhar as duas metades do extrato.
      ordem: indice,
    };
  });

  return { movimentos, saldoFinal: semSaldo ? null : paraReais(acumulado) };
}

/**
 * Comparador da coluna Data do extrato: compara pela sequência cronológica, não
 * pela data.
 *
 * Vive aqui, junto de quem carimba `ordem`, porque é a outra metade da mesma
 * regra: o servidor acumulou o saldo numa ordem, e a tela só pode inverter
 * EXATAMENTE essa ordem. Solto do comparador, `ordem` seria um número que
 * ninguém usa e a coluna voltaria calada a ordenar pela data — que é o defeito
 * que ele existe para consertar. Ver `MovimentoExtrato.ordem`.
 */
export function compararOrdem(
  a: Pick<MovimentoExtrato, "ordem">,
  b: Pick<MovimentoExtrato, "ordem">,
): number {
  return a.ordem - b.ordem;
}

/**
 * Soma entradas e saídas de um conjunto de movimentos, em centavos.
 *
 * Serve aos cartões da tela, que somam as linhas que SOBRARAM dos filtros: um
 * cartão que ignora o filtro da tabela ao lado dele responde a uma pergunta que
 * ninguém fez. Por isso recebe a lista, e não um total pronto do servidor.
 */
export function somarMovimentos(
  movimentos: readonly { entrada: boolean; valor: number }[],
): SomaMovimentos {
  let entradas = 0;
  let saidas = 0;

  for (const movimento of movimentos) {
    const centavos = paraCentavos(movimento.valor);
    if (movimento.entrada) entradas += centavos;
    else saidas += centavos;
  }

  return {
    entradas: paraReais(entradas),
    saidas: paraReais(saidas),
    liquido: paraReais(entradas - saidas),
  };
}

/**
 * O extrato fecha no saldo que a listagem de contas mostra?
 *
 * É a LINHA DE CONTROLE da tela. Os dois números vêm de funções diferentes do
 * banco (`fn_extrato_conta`, linha a linha, e `fn_rel_posicao_bancaria`, já
 * somada), com o mesmo WHERE copiado à mão. Duas cópias da mesma regra divergem
 * na primeira alteração feita de um lado só, e a divergência não dá erro em
 * lugar nenhum: o extrato simplesmente fecharia num número diferente do que está
 * no cartão em cima dele.
 *
 * A comparação é em CENTAVOS INTEIROS, e não entre os dois floats: o
 * arredondamento para centavo já absorve o ruído de ponto flutuante, e o que
 * sobra é divergência de regra de verdade. Comparar float com float acusaria
 * diferença de 1e-10 e transformaria o alerta em ruído permanente.
 */
export function extratoFechaNoSaldo(
  saldoFinal: number | null,
  saldoDaListagem: number | null,
): boolean {
  // Sem permissão de ver o saldo não há nada para conferir, e "não fecha" seria
  // um alerta vermelho na cara de quem não fez nada errado. Os dois lados vêm
  // null juntos (mesma permissão, mesma consulta), então um só null é situação
  // que não existe — mas se existir, tratar como "fecha" mantém a tela quieta
  // em vez de acusar defeito que não é defeito.
  if (saldoFinal === null || saldoDaListagem === null) return true;
  return paraCentavos(saldoFinal) === paraCentavos(saldoDaListagem);
}
