import {
  calcularCet,
  lerFluxo,
  valorQuitacaoHoje,
  type Cet,
  type PontoFluxo,
} from "@/modules/financeiro/dividas/calculo";

/**
 * As linhas de `fn_rel_dividas_contratos` e `fn_rel_consorcios` em camelCase,
 * com o numeric convertido e o CET calculado. Puro: a página de Dívidas e a aba
 * Créditos leem pelo mesmo caminho, e o teste monta sem servidor.
 */

export interface ParcelaProxima {
  numero: number | null;
  vencimento: string;
  principal: number;
  juros: number;
  encargos: number;
  total: number;
}

export interface ContratoRelatorio {
  contratoId: string;
  credor: string;
  numero: string;
  tipo: string;
  status: string;
  centroCustoId: string;
  centro: string | null;
  valorLiberado: number;
  dataLiberacao: string;
  taxaAm: number;
  sistema: string;
  temCronograma: boolean;
  principalPago: number;
  /** Principal ainda não pago na versão atual do cronograma. */
  saldoDevedor: number;
  jurosPagos: number;
  jurosAPagar: number;
  /** Soma das parcelas em aberto (principal, juros e encargos): o caixa que ainda sai. */
  aPagar: number;
  /** O que o contrato custa pagando tudo no prazo: o já pago mais `aPagar`. */
  totalNoPrazo: number;
  /** Parcelas em aberto a valor presente na taxa do contrato (ver `valorQuitacaoHoje`). */
  quitacaoHoje: number;
  /** Todas as parcelas em aberto (data e valor cheio), inclusive as vencidas: a base do painel. */
  restantes: PontoFluxo[];
  proximas: ParcelaProxima[];
  /** Null sem cronograma (só a liberação no fluxo). */
  cet: Cet | null;
}

export interface ParcelaConsorcioProxima {
  numero: number;
  vencimento: string;
  total: number;
}

export interface ConsorcioRelatorio {
  cotaId: string;
  administradora: string;
  grupo: string;
  cota: string;
  bem: string;
  status: string;
  valorCredito: number;
  prazo: number;
  parcelasPagas: number;
  fundoComumPago: number;
  /** Taxa de administração mais fundo de reserva pagos. */
  taxaPaga: number;
  aPagar: number;
  /** Depois da contemplação, o que falta pagar é dívida (D9). Zero antes. */
  divida: number;
  contemplacaoData: string | null;
  contemplacaoForma: string | null;
  valorCarta: number | null;
  proximas: ParcelaConsorcioProxima[];
}

/** Filtro de status da lista de contratos. "ativos" inclui o renegociado (ainda há o que pagar). */
export type FiltroStatusContrato = "ativos" | "quitados" | "todos";

export const FILTROS_STATUS_CONTRATO: readonly FiltroStatusContrato[] = ["ativos", "quitados", "todos"];

export function filtrarContratosPorStatus<T extends { status: string }>(
  contratos: readonly T[],
  filtro: FiltroStatusContrato,
): T[] {
  if (filtro === "todos") return [...contratos];
  return contratos.filter((c) => (c.status === "quitado") === (filtro === "quitados"));
}

/** NUMERIC chega do PostgREST como string em algumas rotas. */
export function numero(valor: unknown): number {
  const n = typeof valor === "string" ? Number(valor) : typeof valor === "number" ? valor : 0;
  return Number.isFinite(n) ? n : 0;
}

function objetos(json: unknown): Record<string, unknown>[] {
  return Array.isArray(json)
    ? json.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    : [];
}

export interface LinhaRpcContrato {
  contrato_id: string;
  credor: string;
  numero: string;
  tipo: string;
  status: string;
  centro_custo_id: string;
  centro: string | null;
  valor_liberado: number | string;
  data_liberacao: string;
  taxa_am: number | string;
  sistema: string;
  tem_cronograma: boolean;
  principal_pago: number | string;
  saldo_devedor: number | string;
  juros_pagos: number | string;
  juros_a_pagar: number | string;
  proximas: unknown;
  fluxo: unknown;
  restantes: unknown;
}

/** `hoje` é a data em que a RPC foi lida: a base do valor de quitação. */
export function lerContratoRelatorio(l: LinhaRpcContrato, hoje: string): ContratoRelatorio {
  const restantes = lerFluxo(l.restantes);
  const aPagar = Math.round(restantes.reduce((soma, p) => soma + p.valor, 0) * 100) / 100;
  const pago = numero(l.principal_pago) + numero(l.juros_pagos);
  return {
    contratoId: l.contrato_id,
    credor: l.credor,
    numero: l.numero,
    tipo: l.tipo,
    status: l.status,
    centroCustoId: l.centro_custo_id,
    centro: l.centro,
    valorLiberado: numero(l.valor_liberado),
    dataLiberacao: l.data_liberacao,
    taxaAm: numero(l.taxa_am),
    sistema: l.sistema,
    temCronograma: l.tem_cronograma,
    principalPago: numero(l.principal_pago),
    saldoDevedor: numero(l.saldo_devedor),
    jurosPagos: numero(l.juros_pagos),
    jurosAPagar: numero(l.juros_a_pagar),
    aPagar,
    totalNoPrazo: Math.round((pago + aPagar) * 100) / 100,
    quitacaoHoje: valorQuitacaoHoje(restantes, numero(l.taxa_am), hoje),
    restantes,
    proximas: objetos(l.proximas).map((p) => ({
      numero: p.numero === null || p.numero === undefined ? null : numero(p.numero),
      vencimento: String(p.vencimento ?? ""),
      principal: numero(p.principal),
      juros: numero(p.juros),
      encargos: numero(p.encargos),
      total: numero(p.total),
    })),
    cet: l.tem_cronograma ? calcularCet(lerFluxo(l.fluxo)) : null,
  };
}

export interface LinhaRpcConsorcio {
  cota_id: string;
  administradora: string;
  grupo: string;
  cota: string;
  bem: string;
  status: string;
  valor_credito: number | string;
  prazo: number;
  parcelas_pagas: number;
  fundo_comum_pago: number | string;
  taxa_paga: number | string;
  a_pagar: number | string;
  divida: number | string;
  contemplacao_data: string | null;
  contemplacao_forma: string | null;
  valor_carta: number | string | null;
  proximas: unknown;
}

export function lerConsorcioRelatorio(l: LinhaRpcConsorcio): ConsorcioRelatorio {
  return {
    cotaId: l.cota_id,
    administradora: l.administradora,
    grupo: l.grupo,
    cota: l.cota,
    bem: l.bem,
    status: l.status,
    valorCredito: numero(l.valor_credito),
    prazo: l.prazo,
    parcelasPagas: l.parcelas_pagas,
    fundoComumPago: numero(l.fundo_comum_pago),
    taxaPaga: numero(l.taxa_paga),
    aPagar: numero(l.a_pagar),
    divida: numero(l.divida),
    contemplacaoData: l.contemplacao_data,
    contemplacaoForma: l.contemplacao_forma,
    valorCarta: l.valor_carta === null ? null : numero(l.valor_carta),
    proximas: objetos(l.proximas).map((p) => ({
      numero: numero(p.numero),
      vencimento: String(p.vencimento ?? ""),
      total: numero(p.total),
    })),
  };
}

/**
 * O que a cota já pagou: fundo comum + taxa (adm e reserva) das parcelas
 * pagas. É o complemento do `aPagar` (as mesmas linhas do cronograma, do
 * outro lado do `pago`); somado em centavos.
 */
export function valorPagoDaCota(c: Pick<ConsorcioRelatorio, "fundoComumPago" | "taxaPaga">): number {
  return (Math.round(c.fundoComumPago * 100) + Math.round(c.taxaPaga * 100)) / 100;
}

/** Soma em centavos inteiros, para o total da tabela bater com as linhas. */
export function somar<T>(linhas: readonly T[], campo: (l: T) => number): number {
  return linhas.reduce((s, l) => s + Math.round(campo(l) * 100), 0) / 100;
}
