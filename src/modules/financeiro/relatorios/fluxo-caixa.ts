import {
  GRUPOS_FLUXO,
  SENTIDOS_FLUXO,
  type GrupoFluxo,
  type SentidoFluxo,
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
 * ## Cinco grupos pela natureza (15/10/2026)
 *
 * `fn_rel_fluxo_caixa_por_grupo` devolve de onde veio ou para onde foi o
 * dinheiro, pela NATUREZA da categoria (ver `GrupoFluxo`): a operação, o CAPEX,
 * o mútuo, a dívida e as aplicações, cada um com o sentido (entrada ou
 * saída).
 *
 * Até 15/10 a tela separava por `tipo` em quatro séries e chamava tudo de
 * "operacional": as entradas levavam R$ 9,03 mi de resgate de aplicação, e as
 * saídas, CAPEX 4,86 mi, distribuição 3,71 mi e mútuo 1,33 mi. A soma fechava,
 * a história não: quem lia achava que a obra gastava o que a empresa investia.
 *
 * A origem `aplicacao` (rendimento, ajuste de abertura) fica FORA, e a RPC nem
 * a devolve: é variação dentro da subconta, não passou pela conta corrente.
 *
 * ## Saldo projetado é saldo de verdade, e em duas linhas
 *
 * O ponto de partida é o saldo de hoje das contas correntes e caixa (o
 * DISPONÍVEL), e cada mês dali em diante soma só o que ainda está PREVISTO:
 *
 *   mês corrente  = saldo de hoje + entradas previstas - saídas previstas do mês
 *   mês seguinte  = anterior + entradas previstas - saídas previstas
 *
 * A segunda linha soma o APLICADO de hoje (subcontas de investimento). Ele não
 * paga boleto sem um resgate antes, mas existe: um disponível negativo com
 * R$ 10 mi aplicados é falta de resgate, não falta de dinheiro, e a tela tem de
 * dizer qual das duas é.
 *
 * O realizado do mês corrente não entra de novo: ele já está no saldo de hoje.
 * Mês passado não ganha saldo acumulado nenhum: reconstruir o saldo de junho
 * exigiria o extrato de junho, e um número inventado no gráfico é pior que a
 * linha começar em hoje.
 *
 * Módulo puro: nada de banco, nada de React. As somas passam por centavos
 * inteiros e só voltam a reais no fim, como o resto do módulo.
 */

/** Uma linha de `fn_rel_fluxo_caixa_por_grupo`, como o Postgres devolve. */
export interface LinhaFluxoRpc {
  mes: string;
  /** O grupo pela natureza. A origem aplicação nem vem da RPC. */
  grupo: string;
  /** `entrada` (a receber) ou `saida` (a pagar). */
  sentido: string;
  realizado: boolean;
  total: number;
}

/** Quanto de um lado já aconteceu e quanto ainda está previsto, em reais. */
export interface LadoFluxo {
  realizado: number;
  projetado: number;
  total: number;
}

/** Um grupo num mês ou na janela: os dois lados e o líquido. */
export interface GrupoNoFluxo {
  entrada: LadoFluxo;
  saida: LadoFluxo;
  /** Entrada menos saída. */
  liquido: number;
}

export interface FluxoCaixaMes {
  /** "YYYY-MM" para ordenação. */
  mes: string;
  /** "mm/aaaa" para exibição. */
  rotulo: string;
  grupos: Record<GrupoFluxo, GrupoNoFluxo>;
  /** Os cinco grupos, realizado mais projetado. */
  entradas: number;
  saidas: number;
  /** Entradas menos saídas do mês. Não é saldo: não carrega o mês anterior. */
  liquido: number;
  /**
   * Saldo DISPONÍVEL ao fim do mês, a partir do saldo das contas correntes e
   * caixa. `null` em mês passado e quando o saldo não pode ser calculado (ver
   * `SaldoProjetado`).
   */
  saldoAcumulado: number | null;
  /** O mesmo, mais o aplicado de hoje. `null` também sem aplicado visível. */
  saldoComAplicado: number | null;
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
      /** O disponível projetado. */
      valor: number;
      /** O disponível de hoje, de onde a conta partiu. */
      saldoInicial: number;
      /** O aplicado de hoje. `null` = nenhuma subconta visível. */
      aplicado: number | null;
      /** `valor` mais o aplicado; `null` quando o aplicado é. */
      valorComAplicado: number | null;
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

/**
 * O que está previsto daqui em diante dentro da janela. Existe para a tela
 * avisar quando a projeção só tem saídas: hoje as medições do DNIT não viram
 * parcela a receber, então o saldo projetado desce sem que nada diga por quê.
 */
export interface PrevistoAFrente {
  /** O primeiro mês considerado (o corrente). */
  desde: string;
  /** Entradas da operação previstas do mês corrente ao fim da janela. */
  entradasDaOperacao: number;
  /** Todas as saídas previstas no mesmo intervalo. */
  saidas: number;
  /** De `saidas`, quanto é CAPEX. */
  saidasDeInvestimento: number;
}

export interface FluxoCaixa {
  meses: FluxoCaixaMes[];
  grupos: Record<GrupoFluxo, GrupoNoFluxo>;
  totalEntradas: number;
  totalSaidas: number;
  /** Entradas menos saídas da janela inteira. */
  liquidoJanela: number;
  saldoProjetado: SaldoProjetado;
  /** `null` quando a janela não chega ao mês corrente. */
  previstoAFrente: PrevistoAFrente | null;
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
  /** Saldo de hoje das subcontas de investimento. `null` = nenhuma visível. */
  aplicado?: number | null;
  /** O relatório está recortado por centro em algum dos lados? */
  comCorteDeCentro?: boolean;
}

function ehGrupo(grupo: string): grupo is GrupoFluxo {
  return (GRUPOS_FLUXO as readonly string[]).includes(grupo);
}

function ehSentido(sentido: string): sentido is SentidoFluxo {
  return (SENTIDOS_FLUXO as readonly string[]).includes(sentido);
}

/** Centavos de um lado: o que foi pago e o que está previsto. */
type LadoCentavos = { realizado: number; projetado: number };
type Acumulador = Record<GrupoFluxo, Record<SentidoFluxo, LadoCentavos>>;

function acumuladorVazio(): Acumulador {
  const acc = {} as Acumulador;
  for (const grupo of GRUPOS_FLUXO) {
    acc[grupo] = {
      entrada: { realizado: 0, projetado: 0 },
      saida: { realizado: 0, projetado: 0 },
    };
  }
  return acc;
}

function somarEm(destino: Acumulador, origem: Acumulador): void {
  for (const grupo of GRUPOS_FLUXO) {
    for (const sentido of SENTIDOS_FLUXO) {
      destino[grupo][sentido].realizado += origem[grupo][sentido].realizado;
      destino[grupo][sentido].projetado += origem[grupo][sentido].projetado;
    }
  }
}

/** Entradas menos saídas, em centavos, de uma das metades (ou das duas). */
function liquidoDe(
  acc: Acumulador,
  parte: "realizado" | "projetado" | "tudo",
): number {
  let total = 0;
  for (const grupo of GRUPOS_FLUXO) {
    for (const sentido of SENTIDOS_FLUXO) {
      const lado = acc[grupo][sentido];
      const valor =
        parte === "tudo" ? lado.realizado + lado.projetado : lado[parte];
      total += sentido === "entrada" ? valor : -valor;
    }
  }
  return total;
}

function somaDoSentido(acc: Acumulador, sentido: SentidoFluxo): number {
  let total = 0;
  for (const grupo of GRUPOS_FLUXO) {
    total += acc[grupo][sentido].realizado + acc[grupo][sentido].projetado;
  }
  return total;
}

function ladoEmReais(lado: LadoCentavos): LadoFluxo {
  return {
    realizado: paraReais(lado.realizado),
    projetado: paraReais(lado.projetado),
    total: paraReais(lado.realizado + lado.projetado),
  };
}

function gruposEmReais(acc: Acumulador): Record<GrupoFluxo, GrupoNoFluxo> {
  const grupos = {} as Record<GrupoFluxo, GrupoNoFluxo>;
  for (const grupo of GRUPOS_FLUXO) {
    const { entrada, saida } = acc[grupo];
    grupos[grupo] = {
      entrada: ladoEmReais(entrada),
      saida: ladoEmReais(saida),
      liquido: paraReais(
        entrada.realizado + entrada.projetado - saida.realizado - saida.projetado,
      ),
    };
  }
  return grupos;
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
  aplicado = null,
  comCorteDeCentro = false,
}: EntradaFluxo): FluxoCaixa {
  const porMes = new Map<string, Acumulador>();
  for (const linha of linhas) {
    // Grupo ou lado desconhecido fica fora em vez de cair num lado por
    // engano: somá-lo mudaria o saldo sem ninguém ver de onde.
    if (!ehGrupo(linha.grupo) || !ehSentido(linha.sentido)) continue;
    const { sentido } = linha;
    const acc = porMes.get(linha.mes) ?? acumuladorVazio();
    const centavos = paraCentavos(linha.total);
    if (linha.realizado) acc[linha.grupo][sentido].realizado += centavos;
    else acc[linha.grupo][sentido].projetado += centavos;
    porMes.set(linha.mes, acc);
  }

  const mesesOrdenados = [...porMes.keys()].sort();

  // O saldo só existe se houver de onde partir e se as barras forem da empresa
  // inteira. Em centavos, mês a mês, a partir do mês corrente.
  const podeAcumular = saldoInicial !== null && !comCorteDeCentro;
  const aplicadoCentavos = aplicado === null ? null : paraCentavos(aplicado);
  const acumuladoPorMes = new Map<string, number>();
  if (podeAcumular) {
    let saldo = partidaEmCentavos(saldoInicial, porMes, mesesOrdenados, mesCorrente);
    for (const mes of mesesOrdenados) {
      if (mes < mesCorrente) continue;
      saldo += liquidoDe(porMes.get(mes) ?? acumuladorVazio(), "projetado");
      acumuladoPorMes.set(mes, saldo);
    }
  }

  const naJanela = acumuladorVazio();
  const aFrente = acumuladorVazio();
  const meses: FluxoCaixaMes[] = [];
  for (const mes of mesesOrdenados) {
    if (janela && !dentroDaJanela(mes, janela)) continue;
    const acc = porMes.get(mes) ?? acumuladorVazio();
    somarEm(naJanela, acc);
    if (mes >= mesCorrente) somarEm(aFrente, acc);
    const entradas = somaDoSentido(acc, "entrada");
    const liquido = liquidoDe(acc, "tudo");
    const acumulado =
      mes >= mesCorrente ? acumuladoPorMes.get(mes) ?? null : null;
    meses.push({
      mes,
      rotulo: rotuloMes(mes),
      grupos: gruposEmReais(acc),
      entradas: paraReais(entradas),
      saidas: paraReais(entradas - liquido),
      liquido: paraReais(liquido),
      saldoAcumulado: acumulado === null ? null : paraReais(acumulado),
      saldoComAplicado:
        acumulado === null || aplicadoCentavos === null
          ? null
          : paraReais(acumulado + aplicadoCentavos),
    });
  }

  const entradasCentavos = somaDoSentido(naJanela, "entrada");
  const liquidoCentavos = liquidoDe(naJanela, "tudo");

  return {
    meses,
    grupos: gruposEmReais(naJanela),
    totalEntradas: paraReais(entradasCentavos),
    totalSaidas: paraReais(entradasCentavos - liquidoCentavos),
    liquidoJanela: paraReais(liquidoCentavos),
    saldoProjetado: saldoNoFimDaJanela({
      porMes,
      mesesOrdenados,
      janela,
      mesCorrente,
      saldoInicial,
      aplicado: aplicadoCentavos,
      comCorteDeCentro,
    }),
    previstoAFrente:
      janela?.ate !== undefined && janela.ate < mesCorrente
        ? null
        : {
            desde: mesCorrente,
            entradasDaOperacao: paraReais(aFrente.operacao.entrada.projetado),
            saidas: paraReais(
              GRUPOS_FLUXO.reduce(
                (soma, grupo) => soma + aFrente[grupo].saida.projetado,
                0,
              ),
            ),
            saidasDeInvestimento: paraReais(aFrente.investimento.saida.projetado),
          },
  };
}

/**
 * De onde o acumulado parte: o saldo de hoje mais o que está ATRASADO.
 *
 * Parcela vencida e não paga continua no mês do vencimento, que já passou. Ela
 * não está no saldo (não foi paga) e, sem isto, também nunca entraria na
 * projeção: um a pagar de agosto em aberto deixaria o saldo projetado maior
 * justamente no cartão em que se decide o que pagar. O previsto dos meses
 * passados entra, então, no ponto de partida.
 */
function partidaEmCentavos(
  saldoInicial: number,
  porMes: Map<string, Acumulador>,
  mesesOrdenados: readonly string[],
  mesCorrente: string,
): number {
  let saldo = paraCentavos(saldoInicial);
  for (const mes of mesesOrdenados) {
    if (mes >= mesCorrente) break;
    saldo += liquidoDe(porMes.get(mes) ?? acumuladorVazio(), "projetado");
  }
  return saldo;
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
  aplicado,
  comCorteDeCentro,
}: {
  porMes: Map<string, Acumulador>;
  mesesOrdenados: readonly string[];
  janela?: JanelaFluxo;
  mesCorrente: string;
  saldoInicial: number | null;
  /** Em centavos. */
  aplicado: number | null;
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

  let saldo = partidaEmCentavos(saldoInicial, porMes, mesesOrdenados, mesCorrente);
  for (const mes of mesesOrdenados) {
    if (mes < mesCorrente || mes > mesFinal) continue;
    saldo += liquidoDe(porMes.get(mes) ?? acumuladorVazio(), "projetado");
  }

  return {
    tipo: "calculado",
    mes: mesFinal,
    valor: paraReais(saldo),
    saldoInicial,
    aplicado: aplicado === null ? null : paraReais(aplicado),
    valorComAplicado: aplicado === null ? null : paraReais(saldo + aplicado),
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
 * Os tipos de conta cujo saldo é o APLICADO: a subconta de investimentos e a
 * poupança. Rendem, e não pagam boleto sem um resgate antes. Os mesmos da
 * Posição bancária (`posicao-bancaria.ts`), para o "aplicado" ser um número só.
 */
export const TIPOS_CONTA_APLICADA: readonly string[] = ["investimento", "poupanca"];

/**
 * O saldo de partida: a soma do saldo de hoje das contas ATIVAS correntes e de
 * caixa (o disponível), e, à parte, a das subcontas de investimento (o
 * aplicado). O aplicado não entra no disponível: não paga boleto sem um resgate
 * antes.
 *
 * `saldos` é o que `fn_saldos_das_contas` devolveu, e ela só devolve as contas
 * cujo saldo a pessoa pode ver. Nenhuma conta visível devolve `null`, e não
 * zero: o cartão diz que não há saldo visível em vez de projetar a partir de
 * R$ 0,00. `ocultas` conta as correntes e caixa que existem e ficaram fora,
 * para o cartão avisar que o saldo é parcial.
 */
export function saldoDePartida(
  contas: readonly ContaParaSaldo[],
  saldos: readonly { conta_bancaria_id: string; saldo: number }[],
): {
  saldo: number | null;
  contas: number;
  ocultas: number;
  aplicado: number | null;
  contasAplicadas: number;
} {
  const saldoPorConta = new Map(
    saldos.map((linha) => [linha.conta_bancaria_id, linha.saldo]),
  );
  let centavos = 0;
  let visiveis = 0;
  let ocultas = 0;
  let aplicadoCentavos = 0;
  let aplicadas = 0;
  for (const conta of contas) {
    if (!conta.ativo) continue;
    const saldo = saldoPorConta.get(conta.id);
    if (TIPOS_CONTA_APLICADA.includes(conta.tipo)) {
      if (saldo === undefined) continue;
      aplicadoCentavos += paraCentavos(saldo);
      aplicadas += 1;
      continue;
    }
    if (!TIPOS_CONTA_DO_CAIXA.includes(conta.tipo)) continue;
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
    aplicado: aplicadas === 0 ? null : paraReais(aplicadoCentavos),
    contasAplicadas: aplicadas,
  };
}

/* ------------------------------------------------------------------ */
/* A história: a ponte do caixa e as frases                           */
/* ------------------------------------------------------------------ */

/** Como cada grupo se chama na tela, no cartão, na ponte e na legenda. */
export const ROTULO_GRUPO_FLUXO: Record<GrupoFluxo, string> = {
  operacao: "Operação",
  investimento: "Investimento (CAPEX)",
  socios: "Mútuo com ligadas",
  divida: "Dívida",
  aplicacao: "Aplicações",
};

/** Um degrau da ponte do caixa. `de`/`ate` na escala comum, em reais. */
export interface DegrauCaixa {
  id: string;
  rotulo: string;
  tipo: "total" | "entrada" | "saida";
  valor: number;
  de: number;
  ate: number;
  /** O grupo e o lado que o degrau soma, para o drill. Ausente nos totais. */
  grupo?: GrupoFluxo;
  sentido?: SentidoFluxo;
}

export interface PonteDoCaixa {
  degraus: DegrauCaixa[];
  escala: { min: number; max: number };
}

/**
 * A janela contada como ponte: o que entrou e saiu da operação, a geração
 * operacional, e depois o que cada outro grupo levou ou trouxe, até a sobra.
 *
 * Os outros grupos entram LÍQUIDOS, com o lado do líquido: sócios que mandaram
 * 3,7 mi e devolveram 1,4 mi são uma saída de 2,3 mi, que é a pergunta ("para
 * onde foi o caixa"). Grupo zerado na janela não ganha degrau. Os dois lados da
 * operação ficam sempre, mesmo zerados: "não entrou nada da operação" é a
 * notícia.
 */
export function ponteDoCaixa(fluxo: FluxoCaixa): PonteDoCaixa {
  const crus: Omit<DegrauCaixa, "de" | "ate">[] = [];
  const op = fluxo.grupos.operacao;
  crus.push({
    id: "operacao-entrada",
    rotulo: "Entrou da operação",
    tipo: "entrada",
    valor: op.entrada.total,
    grupo: "operacao",
    sentido: "entrada",
  });
  crus.push({
    id: "operacao-saida",
    rotulo: "Saiu na operação",
    tipo: "saida",
    valor: -op.saida.total,
    grupo: "operacao",
    sentido: "saida",
  });
  crus.push({
    id: "geracao",
    rotulo: "Geração operacional",
    tipo: "total",
    valor: op.liquido,
  });
  for (const grupo of GRUPOS_FLUXO) {
    if (grupo === "operacao") continue;
    const liquido = fluxo.grupos[grupo].liquido;
    if (liquido === 0) continue;
    crus.push({
      id: grupo,
      rotulo: ROTULO_GRUPO_FLUXO[grupo],
      tipo: liquido > 0 ? "entrada" : "saida",
      valor: liquido,
      grupo,
    });
  }
  crus.push({
    id: "sobra",
    rotulo: "Sobra do caixa na janela",
    tipo: "total",
    valor: fluxo.liquidoJanela,
  });

  // Em centavos para o patamar não acumular erro de ponto flutuante.
  let nivel = 0;
  let min = 0;
  let max = 0;
  const degraus: DegrauCaixa[] = crus.map((degrau) => {
    const valor = paraCentavos(degrau.valor);
    let de: number;
    let ate: number;
    if (degrau.tipo === "total") {
      de = 0;
      ate = valor;
      nivel = valor;
    } else {
      de = nivel;
      ate = nivel + valor;
      nivel = ate;
    }
    min = Math.min(min, de, ate);
    max = Math.max(max, de, ate);
    return { ...degrau, de: paraReais(de), ate: paraReais(ate) };
  });

  return { degraus, escala: { min: paraReais(min), max: paraReais(max) } };
}

/**
 * A frase-resumo do topo, com os números: o que a operação gerou, para onde o
 * resto foi e quanto sobrou. É a ponte dita em uma linha, para quem não vai
 * ler o gráfico.
 */
export function fraseDoFluxo(
  fluxo: FluxoCaixa,
  brl: (valor: number) => string,
): string {
  const op = fluxo.grupos.operacao;
  const partes: string[] = [];
  partes.push(
    op.liquido >= 0
      ? `Na janela, a operação gerou ${brl(op.liquido)} (entrou ${brl(op.entrada.total)}, saiu ${brl(op.saida.total)})`
      : `Na janela, a operação consumiu ${brl(-op.liquido)} (entrou ${brl(op.entrada.total)}, saiu ${brl(op.saida.total)})`,
  );
  const destino: string[] = [];
  const inv = fluxo.grupos.investimento.liquido;
  if (inv < 0) destino.push(`o CAPEX levou ${brl(-inv)}`);
  else if (inv > 0) destino.push(`a venda de investimento trouxe ${brl(inv)}`);
  const socios = fluxo.grupos.socios;
  if (socios.liquido !== 0) {
    destino.push(
      socios.liquido < 0
        ? `o mútuo com as ligadas levou ${brl(-socios.liquido)} líquidos`
        : `as ligadas devolveram ${brl(socios.liquido)} líquidos de mútuo`,
    );
  }
  const divida = fluxo.grupos.divida;
  if (divida.liquido !== 0) {
    destino.push(
      `a dívida ${divida.liquido > 0 ? "trouxe" : "levou"} ${brl(Math.abs(divida.liquido))} (tomou ${brl(divida.entrada.total)}, amortizou ${brl(divida.saida.total)})`,
    );
  }
  const aplicacao = fluxo.grupos.aplicacao;
  if (aplicacao.liquido !== 0) {
    destino.push(
      aplicacao.liquido > 0
        ? `o resgate de aplicações trouxe ${brl(aplicacao.liquido)}`
        : `a aplicação levou ${brl(-aplicacao.liquido)}`,
    );
  }
  let frase = partes[0];
  if (destino.length > 0) frase += `; ${juntarComE(destino)}`;
  const sobra = fluxo.liquidoJanela;
  frase +=
    sobra >= 0
      ? `. Somando tudo, sobraram ${brl(sobra)}.`
      : `. Somando tudo, faltaram ${brl(-sobra)}.`;
  return frase;
}

/**
 * A frase do saldo projetado, com o disponível e o aplicado, e o aviso de
 * quando a projeção só tem saídas. `null` sem saldo calculado: o cartão já diz
 * o motivo.
 */
export function fraseDoSaldo(
  fluxo: FluxoCaixa,
  brl: (valor: number) => string,
): { saldo: string; aviso: string | null } | null {
  const saldo = fluxo.saldoProjetado;
  if (saldo.tipo !== "calculado") return null;
  let texto = `O disponível hoje é ${brl(saldo.saldoInicial)} nas contas correntes e caixa`;
  if (saldo.aplicado !== null) texto += `, e há ${brl(saldo.aplicado)} aplicados`;
  texto += `. Mantido o que está lançado, o disponível chega a ${brl(saldo.valor)} em ${rotuloMes(saldo.mes)}`;
  if (saldo.valorComAplicado !== null) {
    texto += `; contando o aplicado, ${brl(saldo.valorComAplicado)}`;
  }
  texto += ".";

  const previsto = fluxo.previstoAFrente;
  let aviso: string | null = null;
  if (previsto && previsto.entradasDaOperacao === 0 && previsto.saidas > 0) {
    aviso = `De ${rotuloMes(previsto.desde)} em diante não há nenhuma entrada da operação lançada, só ${brl(previsto.saidas)} de saídas previstas`;
    if (previsto.saidasDeInvestimento > 0) {
      aviso += ` (${brl(previsto.saidasDeInvestimento)} delas de CAPEX)`;
    }
    aviso +=
      ". As medições a receber ainda não viraram parcela, então a projeção só desce: ela mostra o que já está comprometido, não o caixa que a obra vai ter.";
  }
  return { saldo: texto, aviso };
}

function juntarComE(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}
