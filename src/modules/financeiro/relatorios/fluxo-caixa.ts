import {
  SERIES_FLUXO,
  type SerieFluxo,
} from "@/modules/financeiro/lancamentos/recorte";
import {
  paraCentavos,
  paraReais,
  rotuloMes,
} from "@/modules/financeiro/relatorios/calculo";
import {
  dentroDaJanela,
  type JanelaFluxo,
} from "@/modules/financeiro/relatorios/filtros-fluxo-caixa";

/**
 * A aritmética do Fluxo de caixa, separada da consulta.
 *
 * ## Quatro séries (D1, 03/10/2026)
 *
 * A movimentação que passa pela conta bancária entra no caixa. Ela entra em
 * série PRÓPRIA, e não misturada no operacional: `fn_rel_fluxo_caixa` devolve em
 * `tipo` uma de quatro, e é daqui que a tela tira os quatro cartões e as barras.
 *
 * - `a_pagar`: saída operacional;
 * - `a_receber`: entrada operacional (os resgates antigos de aplicação também);
 * - `emprestimo_tomado`: entrada de movimentação rateada no centro de
 *   Empréstimos, o dinheiro que o banco liberou;
 * - `amortizacao`: saída de movimentação, a prestação do empréstimo.
 *
 * Entradas são `a_receber + emprestimo_tomado`; saídas, `a_pagar + amortizacao`.
 * Antes da D1 as prestações não apareciam em lugar nenhum do fluxo: nov/2026
 * escondia R$ 380.821,67 e dez/2026 R$ 302.978,51.
 *
 * ## Saldo projetado é saldo de verdade
 *
 * O cartão "Saldo projetado" somava entradas menos saídas da janela: era o
 * líquido de 25 meses chamado de saldo, sem nenhuma relação com o que está no
 * banco. Agora o ponto de partida é o saldo das contas (ver `saldoProjetado`), e
 * cada mês dali em diante soma só o que ainda está PREVISTO:
 *
 *   mês corrente  = saldo de hoje + entradas previstas - saídas previstas do mês
 *   mês seguinte  = anterior + entradas previstas - saídas previstas
 *
 * O realizado do mês corrente não entra de novo: ele já está no saldo de hoje.
 * Mês passado não ganha saldo acumulado nenhum, só o líquido dele: reconstruir o
 * saldo de junho exigiria o extrato de junho, e um número inventado no gráfico é
 * pior que a linha começar em hoje.
 *
 * Módulo puro: nada de banco, nada de React. As somas passam por centavos
 * inteiros e só voltam a reais no fim, como o resto do módulo.
 */

/** Uma linha de `fn_rel_fluxo_caixa`, como o Postgres devolve. */
export interface LinhaFluxoRpc {
  mes: string;
  tipo: string;
  realizado: boolean;
  total: number;
}

export interface FluxoCaixaMes {
  /** "YYYY-MM" para ordenação. */
  mes: string;
  /** "mm/aaaa" para exibição. */
  rotulo: string;
  aReceberRealizado: number;
  aReceberProjetado: number;
  emprestimoTomadoRealizado: number;
  emprestimoTomadoProjetado: number;
  aPagarRealizado: number;
  aPagarProjetado: number;
  amortizacaoRealizado: number;
  amortizacaoProjetado: number;
  /** As duas séries de entrada, realizado mais projetado. */
  entradas: number;
  /** As duas séries de saída, realizado mais projetado. */
  saidas: number;
  /** Entradas menos saídas do mês. Não é saldo: não carrega o mês anterior. */
  liquido: number;
  /**
   * Saldo acumulado ao fim do mês, a partir do saldo das contas. `null` em mês
   * passado e quando o saldo não pode ser calculado (ver `SaldoProjetado`).
   */
  saldoAcumulado: number | null;
}

/** Total de uma série na janela, e quanto dele já aconteceu. */
export interface TotalSerie {
  total: number;
  realizado: number;
}

/**
 * O saldo projetado no fim da janela, ou o motivo de não haver um.
 *
 * Os motivos são separados porque cada um pede uma frase diferente no cartão, e
 * nenhum deles pode virar R$ 0,00: zero é um saldo, e um saldo zero inventado
 * leva a decisão de pagamento errada.
 */
export type SaldoProjetado =
  | {
      tipo: "calculado";
      /** O último mês da janela (yyyy-MM). */
      mes: string;
      valor: number;
      /** O saldo de hoje, de onde a conta partiu. */
      saldoInicial: number;
    }
  /** A pessoa não pode ver o saldo de nenhuma conta corrente ou caixa. */
  | { tipo: "sem_saldo_visivel" }
  /**
   * Há centro escolhido: as barras são FATIA de uma obra, e somar a fatia ao
   * saldo da empresa inteira daria um número que não é de ninguém.
   */
  | { tipo: "com_centro" }
  /** A janela termina antes do mês corrente: não há futuro para projetar. */
  | { tipo: "janela_no_passado" };

export interface FluxoCaixa {
  meses: FluxoCaixaMes[];
  series: Record<SerieFluxo, TotalSerie>;
  totalEntradas: number;
  totalSaidas: number;
  /** Entradas menos saídas da janela inteira. */
  liquidoJanela: number;
  saldoProjetado: SaldoProjetado;
}

export interface EntradaFluxo {
  linhas: readonly LinhaFluxoRpc[];
  janela?: JanelaFluxo;
  /** Mês corrente (yyyy-MM) no fuso de Rio Branco. */
  mesCorrente: string;
  /**
   * Saldo de hoje das contas que entram no caixa. `null` = nenhuma conta
   * visível para quem está olhando.
   */
  saldoInicial: number | null;
  /** O relatório está recortado por centro em algum dos lados? */
  comCorteDeCentro?: boolean;
}

const ENTRADAS: readonly SerieFluxo[] = ["a_receber", "emprestimo_tomado"];

function ehSerie(tipo: string): tipo is SerieFluxo {
  return (SERIES_FLUXO as readonly string[]).includes(tipo);
}

type Acumulador = Record<SerieFluxo, { realizado: number; projetado: number }>;

function acumuladorVazio(): Acumulador {
  return {
    a_pagar: { realizado: 0, projetado: 0 },
    a_receber: { realizado: 0, projetado: 0 },
    emprestimo_tomado: { realizado: 0, projetado: 0 },
    amortizacao: { realizado: 0, projetado: 0 },
  };
}

/** Entradas menos saídas, em centavos, de uma das duas metades do mês. */
function liquidoDe(
  acc: Acumulador,
  parte: "realizado" | "projetado" | "tudo",
): number {
  let total = 0;
  for (const serie of SERIES_FLUXO) {
    const valor =
      parte === "tudo"
        ? acc[serie].realizado + acc[serie].projetado
        : acc[serie][parte];
    total += ENTRADAS.includes(serie) ? valor : -valor;
  }
  return total;
}

/**
 * Monta o relatório a partir do que a RPC devolveu.
 *
 * A JANELA corta os meses e os totais, mas NÃO o saldo acumulado: uma janela que
 * começa em março do ano que vem ainda precisa somar os previstos de hoje até
 * fevereiro para o saldo de março estar certo. Por isso o acumulado percorre
 * todas as linhas, e a janela só escolhe quais meses aparecem.
 */
export function montarFluxoCaixa({
  linhas,
  janela,
  mesCorrente,
  saldoInicial,
  comCorteDeCentro = false,
}: EntradaFluxo): FluxoCaixa {
  const porMes = new Map<string, Acumulador>();
  for (const linha of linhas) {
    // Série que este módulo não conhece fica fora em vez de cair num lado por
    // engano: somá-la como saída mudaria o saldo sem ninguém ver de onde.
    if (!ehSerie(linha.tipo)) continue;
    const acc = porMes.get(linha.mes) ?? acumuladorVazio();
    const centavos = paraCentavos(linha.total);
    if (linha.realizado) acc[linha.tipo].realizado += centavos;
    else acc[linha.tipo].projetado += centavos;
    porMes.set(linha.mes, acc);
  }

  const mesesOrdenados = [...porMes.keys()].sort();

  // O saldo só existe se houver de onde partir e se as barras forem da empresa
  // inteira. Em centavos, mês a mês, a partir do mês corrente.
  const podeAcumular = saldoInicial !== null && !comCorteDeCentro;
  const acumuladoPorMes = new Map<string, number>();
  if (podeAcumular) {
    let saldo = paraCentavos(saldoInicial);
    for (const mes of mesesOrdenados) {
      if (mes < mesCorrente) continue;
      saldo += liquidoDe(porMes.get(mes) ?? acumuladorVazio(), "projetado");
      acumuladoPorMes.set(mes, saldo);
    }
  }

  const series = acumuladorVazio();
  const meses: FluxoCaixaMes[] = [];
  for (const mes of mesesOrdenados) {
    if (janela && !dentroDaJanela(mes, janela)) continue;
    const acc = porMes.get(mes) ?? acumuladorVazio();
    for (const serie of SERIES_FLUXO) {
      series[serie].realizado += acc[serie].realizado;
      series[serie].projetado += acc[serie].projetado;
    }
    const entradas = ENTRADAS.reduce(
      (soma, serie) => soma + acc[serie].realizado + acc[serie].projetado,
      0,
    );
    const liquido = liquidoDe(acc, "tudo");
    const acumulado =
      mes >= mesCorrente ? acumuladoPorMes.get(mes) ?? null : null;
    meses.push({
      mes,
      rotulo: rotuloMes(mes),
      aReceberRealizado: paraReais(acc.a_receber.realizado),
      aReceberProjetado: paraReais(acc.a_receber.projetado),
      emprestimoTomadoRealizado: paraReais(acc.emprestimo_tomado.realizado),
      emprestimoTomadoProjetado: paraReais(acc.emprestimo_tomado.projetado),
      aPagarRealizado: paraReais(acc.a_pagar.realizado),
      aPagarProjetado: paraReais(acc.a_pagar.projetado),
      amortizacaoRealizado: paraReais(acc.amortizacao.realizado),
      amortizacaoProjetado: paraReais(acc.amortizacao.projetado),
      entradas: paraReais(entradas),
      saidas: paraReais(entradas - liquido),
      liquido: paraReais(liquido),
      saldoAcumulado: acumulado === null ? null : paraReais(acumulado),
    });
  }

  const totalSerie = (serie: SerieFluxo): TotalSerie => ({
    total: paraReais(series[serie].realizado + series[serie].projetado),
    realizado: paraReais(series[serie].realizado),
  });
  const liquidoCentavos = liquidoDe(series, "tudo");
  const entradasCentavos = ENTRADAS.reduce(
    (soma, serie) => soma + series[serie].realizado + series[serie].projetado,
    0,
  );

  return {
    meses,
    series: {
      a_pagar: totalSerie("a_pagar"),
      a_receber: totalSerie("a_receber"),
      emprestimo_tomado: totalSerie("emprestimo_tomado"),
      amortizacao: totalSerie("amortizacao"),
    },
    totalEntradas: paraReais(entradasCentavos),
    totalSaidas: paraReais(entradasCentavos - liquidoCentavos),
    liquidoJanela: paraReais(liquidoCentavos),
    saldoProjetado: saldoNoFimDaJanela({
      porMes,
      mesesOrdenados,
      janela,
      mesCorrente,
      saldoInicial,
      comCorteDeCentro,
    }),
  };
}

/**
 * O saldo no ÚLTIMO mês da janela.
 *
 * O último mês é a ponta de cima da janela quando ela tem uma (a janela padrão
 * vai doze meses à frente, tenha ou não parcela no último), e o último mês com
 * movimento quando ela é aberta ("Tudo"). Mês sem parcela não muda o saldo,
 * então somar até a ponta é o mesmo que somar até o último mês com movimento
 * antes dela.
 */
function saldoNoFimDaJanela({
  porMes,
  mesesOrdenados,
  janela,
  mesCorrente,
  saldoInicial,
  comCorteDeCentro,
}: {
  porMes: Map<string, Acumulador>;
  mesesOrdenados: readonly string[];
  janela?: JanelaFluxo;
  mesCorrente: string;
  saldoInicial: number | null;
  comCorteDeCentro: boolean;
}): SaldoProjetado {
  if (comCorteDeCentro) return { tipo: "com_centro" };
  if (saldoInicial === null) return { tipo: "sem_saldo_visivel" };

  const ultimoComMovimento = mesesOrdenados.at(-1);
  const mesFinal =
    janela?.ate ??
    (ultimoComMovimento && ultimoComMovimento > mesCorrente
      ? ultimoComMovimento
      : mesCorrente);
  if (mesFinal < mesCorrente) return { tipo: "janela_no_passado" };

  let saldo = paraCentavos(saldoInicial);
  for (const mes of mesesOrdenados) {
    if (mes < mesCorrente || mes > mesFinal) continue;
    saldo += liquidoDe(porMes.get(mes) ?? acumuladorVazio(), "projetado");
  }

  return {
    tipo: "calculado",
    mes: mesFinal,
    valor: paraReais(saldo),
    saldoInicial,
  };
}

/** Uma conta como o ponto de partida do saldo precisa dela. */
export interface ContaParaSaldo {
  id: string;
  tipo: string;
  ativo: boolean;
}

/** Os tipos de conta cujo saldo é o caixa disponível. */
export const TIPOS_CONTA_DO_CAIXA: readonly string[] = ["corrente", "caixa"];

/**
 * O saldo de partida: a soma do saldo de hoje das contas ATIVAS correntes e de
 * caixa. A subconta de investimentos fica fora: é dinheiro aplicado, que não
 * paga boleto sem um resgate antes.
 *
 * `saldos` é o que `fn_saldos_das_contas` devolveu, e ela só devolve as contas
 * cujo saldo a pessoa pode ver. Nenhuma conta visível devolve `null`, e não
 * zero: o cartão diz que não há saldo visível em vez de projetar a partir de
 * R$ 0,00. `ocultas` conta as que existem e ficaram fora, para o cartão avisar
 * que o saldo é parcial.
 */
export function saldoDePartida(
  contas: readonly ContaParaSaldo[],
  saldos: readonly { conta_bancaria_id: string; saldo: number }[],
): { saldo: number | null; contas: number; ocultas: number } {
  const saldoPorConta = new Map(
    saldos.map((linha) => [linha.conta_bancaria_id, linha.saldo]),
  );
  let centavos = 0;
  let visiveis = 0;
  let ocultas = 0;
  for (const conta of contas) {
    if (!conta.ativo || !TIPOS_CONTA_DO_CAIXA.includes(conta.tipo)) continue;
    const saldo = saldoPorConta.get(conta.id);
    if (saldo === undefined) {
      ocultas += 1;
      continue;
    }
    centavos += paraCentavos(saldo);
    visiveis += 1;
  }
  return {
    saldo: visiveis === 0 ? null : paraReais(centavos),
    contas: visiveis,
    ocultas,
  };
}
