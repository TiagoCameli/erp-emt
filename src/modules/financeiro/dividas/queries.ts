import "server-only";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import {
  lerConsorcioRelatorio,
  lerContratoRelatorio,
  numero,
  type ConsorcioRelatorio,
  type ContratoRelatorio,
} from "@/modules/financeiro/dividas/relatorio";

/**
 * Leituras de Dívidas. A lista dos contratos e das cotas vem das mesmas RPCs
 * da aba Créditos (`fn_rel_dividas_contratos`, `fn_rel_consorcios`): o saldo
 * devedor da lista e o do relatório são o mesmo número, contado num lugar só.
 */

export async function relatorioContratos(data: string = dataHojeISO()): Promise<ContratoRelatorio[]> {
  const supabase = await createClient();
  const { data: linhas, error } = await supabase.rpc("fn_rel_dividas_contratos", { p_data: data });
  if (error) throw new Error("Não foi possível carregar os contratos de dívida");
  return (linhas ?? []).map(lerContratoRelatorio);
}

export async function relatorioConsorcios(data: string = dataHojeISO()): Promise<ConsorcioRelatorio[]> {
  const supabase = await createClient();
  const { data: linhas, error } = await supabase.rpc("fn_rel_consorcios", { p_data: data });
  if (error) throw new Error("Não foi possível carregar as cotas de consórcio");
  return (linhas ?? []).map(lerConsorcioRelatorio);
}

/** O lançamento ligado, para o seletor mostrar o que está escolhido. */
export interface LancamentoLigado {
  id: string;
  numero: string;
  descricao: string;
}

export interface ContratoDivida {
  id: string;
  credor: string;
  numero: string;
  tipo: string;
  centroCustoId: string;
  centroNome: string | null;
  lancamento: LancamentoLigado | null;
  lancamentoLiberacao: LancamentoLigado | null;
  valorContratado: number;
  valorLiberado: number;
  dataLiberacao: string;
  taxaAm: number;
  indexador: string;
  sistema: string;
  carenciaMeses: number;
  parcelas: number;
  primeiroVencimento: string;
  garantia: string | null;
  status: string;
  observacoes: string | null;
}

export interface LinhaCronograma {
  id: string;
  versao: number;
  tipo: string;
  numero: number | null;
  vencimento: string;
  principal: number;
  juros: number;
  encargos: number;
  saldoApos: number;
  substituidaEm: string | null;
  /** Parcela do lançamento com o mesmo número já paga. Null sem lançamento ligado. */
  paga: boolean | null;
}

export interface EventoContrato {
  id: string;
  tipo: string;
  data: string;
  valor: number | null;
  motivo: string;
  versaoAnterior: number | null;
  versaoNova: number;
  criadoEm: string;
}

export interface DetalheContrato {
  contrato: ContratoDivida;
  /** A versão atual (substituida_em nulo), em ordem de vencimento. */
  cronograma: LinhaCronograma[];
  /** As versões substituídas, da mais nova para a mais velha. */
  historico: { versao: number; substituidaEm: string; linhas: LinhaCronograma[] }[];
  eventos: EventoContrato[];
  /** Quantas parcelas do lançamento ligado estão pagas (troca livre só com zero). */
  parcelasPagas: number;
}

type LancamentoJoin = { id: string; numero: string; descricao: string } | null;

function ligado(l: LancamentoJoin): LancamentoLigado | null {
  return l ? { id: l.id, numero: l.numero, descricao: l.descricao } : null;
}

/** Números das parcelas pagas do lançamento (vazio sem lançamento ou sem permissão de ver). */
async function parcelasPagasDo(lancamentoId: string | null): Promise<Set<number> | null> {
  if (!lancamentoId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select("numero_parcela")
    .eq("lancamento_id", lancamentoId)
    .eq("status", "pago");
  if (error) return new Set();
  return new Set((data ?? []).map((p) => p.numero_parcela));
}

export async function carregarContrato(id: string): Promise<DetalheContrato | null> {
  const supabase = await createClient();
  const [contrato, cronograma, eventos] = await Promise.all([
    supabase
      .from("contratos_divida")
      .select(
        `id, credor, numero, tipo, centro_custo_id, lancamento_id, lancamento_liberacao_id, valor_contratado,
         valor_liberado, data_liberacao, taxa_am, indexador, sistema, carencia_meses, parcelas,
         primeiro_vencimento, garantia, status, observacoes,
         centro:centros_custo!contratos_divida_centro_custo_id_fkey(nome),
         lancamento:lancamentos!contratos_divida_lancamento_id_fkey(id, numero, descricao),
         liberacao:lancamentos!contratos_divida_lancamento_liberacao_id_fkey(id, numero, descricao)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("contrato_divida_cronograma")
      .select("id, versao, ordem, tipo, numero, vencimento, principal, juros, encargos, saldo_apos, substituida_em")
      .eq("contrato_id", id)
      .order("versao", { ascending: false })
      .order("ordem"),
    supabase
      .from("contrato_divida_eventos")
      .select("id, tipo, data, valor, motivo, versao_anterior, versao_nova, created_at")
      .eq("contrato_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (contrato.error || cronograma.error || eventos.error) {
    throw new Error("Não foi possível carregar o contrato");
  }
  const c = contrato.data;
  if (!c) return null;

  const pagas = await parcelasPagasDo(c.lancamento_id);
  const linhas: LinhaCronograma[] = (cronograma.data ?? []).map((l) => ({
    id: l.id,
    versao: l.versao,
    tipo: l.tipo,
    numero: l.numero,
    vencimento: l.vencimento,
    principal: numero(l.principal),
    juros: numero(l.juros),
    encargos: numero(l.encargos),
    saldoApos: numero(l.saldo_apos),
    substituidaEm: l.substituida_em,
    paga: pagas === null || l.numero === null ? null : pagas.has(l.numero),
  }));

  const historico = new Map<number, { versao: number; substituidaEm: string; linhas: LinhaCronograma[] }>();
  for (const l of linhas) {
    if (l.substituidaEm === null) continue;
    const v = historico.get(l.versao) ?? { versao: l.versao, substituidaEm: l.substituidaEm, linhas: [] };
    v.linhas.push(l);
    historico.set(l.versao, v);
  }

  return {
    contrato: {
      id: c.id,
      credor: c.credor,
      numero: c.numero,
      tipo: c.tipo,
      centroCustoId: c.centro_custo_id,
      centroNome: c.centro?.nome ?? null,
      lancamento: ligado(c.lancamento),
      lancamentoLiberacao: ligado(c.liberacao),
      valorContratado: numero(c.valor_contratado),
      valorLiberado: numero(c.valor_liberado),
      dataLiberacao: c.data_liberacao,
      taxaAm: numero(c.taxa_am),
      indexador: c.indexador,
      sistema: c.sistema,
      carenciaMeses: c.carencia_meses,
      parcelas: c.parcelas,
      primeiroVencimento: c.primeiro_vencimento,
      garantia: c.garantia,
      status: c.status,
      observacoes: c.observacoes,
    },
    cronograma: linhas.filter((l) => l.substituidaEm === null),
    historico: [...historico.values()].sort((a, b) => b.versao - a.versao),
    eventos: (eventos.data ?? []).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      data: e.data,
      valor: e.valor === null ? null : numero(e.valor),
      motivo: e.motivo,
      versaoAnterior: e.versao_anterior,
      versaoNova: e.versao_nova,
      criadoEm: e.created_at,
    })),
    parcelasPagas: pagas?.size ?? 0,
  };
}

export interface CotaConsorcio {
  id: string;
  administradora: string;
  grupo: string;
  cota: string;
  bem: string;
  centroCustoId: string | null;
  centroNome: string | null;
  lancamento: LancamentoLigado | null;
  valorCredito: number;
  prazo: number;
  taxaAdmPct: number;
  fundoReservaPct: number;
  primeiroVencimento: string;
  status: string;
  contemplacaoData: string | null;
  contemplacaoForma: string | null;
  valorLance: number | null;
  valorCarta: number | null;
  bemCentroId: string | null;
  bemCentroNome: string | null;
  observacoes: string | null;
}

export interface LinhaConsorcio {
  id: string;
  numero: number;
  vencimento: string;
  fundoComum: number;
  taxaAdm: number;
  fundoReserva: number;
  paga: boolean | null;
}

export interface DetalheCota {
  cota: CotaConsorcio;
  cronograma: LinhaConsorcio[];
  parcelasPagas: number;
}

export async function carregarCota(id: string): Promise<DetalheCota | null> {
  const supabase = await createClient();
  const [cota, cronograma] = await Promise.all([
    supabase
      .from("consorcio_cotas")
      .select(
        `id, administradora, grupo, cota, bem, centro_custo_id, lancamento_id, valor_credito, prazo, taxa_adm_pct,
         fundo_reserva_pct, primeiro_vencimento, status, contemplacao_data, contemplacao_forma, valor_lance,
         valor_carta, bem_centro_id, observacoes,
         centro:centros_custo!consorcio_cotas_centro_custo_id_fkey(nome),
         bemCentro:centros_custo!consorcio_cotas_bem_centro_id_fkey(nome),
         lancamento:lancamentos!consorcio_cotas_lancamento_id_fkey(id, numero, descricao)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("consorcio_cota_cronograma")
      .select("id, numero, vencimento, fundo_comum, taxa_adm, fundo_reserva")
      .eq("cota_id", id)
      .order("numero"),
  ]);
  if (cota.error || cronograma.error) throw new Error("Não foi possível carregar a cota");
  const q = cota.data;
  if (!q) return null;
  const pagas = await parcelasPagasDo(q.lancamento_id);
  return {
    cota: {
      id: q.id,
      administradora: q.administradora,
      grupo: q.grupo,
      cota: q.cota,
      bem: q.bem,
      centroCustoId: q.centro_custo_id,
      centroNome: q.centro?.nome ?? null,
      lancamento: ligado(q.lancamento),
      valorCredito: numero(q.valor_credito),
      prazo: q.prazo,
      taxaAdmPct: numero(q.taxa_adm_pct),
      fundoReservaPct: numero(q.fundo_reserva_pct),
      primeiroVencimento: q.primeiro_vencimento,
      status: q.status,
      contemplacaoData: q.contemplacao_data,
      contemplacaoForma: q.contemplacao_forma,
      valorLance: q.valor_lance === null ? null : numero(q.valor_lance),
      valorCarta: q.valor_carta === null ? null : numero(q.valor_carta),
      bemCentroId: q.bem_centro_id,
      bemCentroNome: q.bemCentro?.nome ?? null,
      observacoes: q.observacoes,
    },
    cronograma: (cronograma.data ?? []).map((l) => ({
      id: l.id,
      numero: l.numero,
      vencimento: l.vencimento,
      fundoComum: numero(l.fundo_comum),
      taxaAdm: numero(l.taxa_adm),
      fundoReserva: numero(l.fundo_reserva),
      paga: pagas === null ? null : pagas.has(l.numero),
    })),
    parcelasPagas: pagas?.size ?? 0,
  };
}
