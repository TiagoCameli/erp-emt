import "server-only";

import { addDays, addMonths, format, parseISO } from "date-fns";

import { dataHojeISO, mesHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";

export interface ResumoCompras {
  ocsAprovar: { contagem: number; valor: number };
  ocsAbertas: { contagem: number; valor: number };
  cotacoesAbertas: number;
}

export interface ResumoFinanceiro {
  aPagar: { contagem: number; vencidas: number; valor: number };
  aAprovar: { contagem: number; valor: number };
  pagoNoMes: { contagem: number; valor: number };
}

export interface ResumoRh {
  colaboradoresAtivos: number;
  folha: { competencia: string | null; custoTotal: number };
  apontamentosAbertos: number;
}

/** Soma segura de valores NUMERIC que podem vir como string ou null do banco. */
function somar(valores: Array<number | string | null>): number {
  return valores.reduce<number>((total, v) => total + Number(v ?? 0), 0);
}

/** Resumo de Compras: OCs a aprovar, OCs abertas e cotações em aberto. */
export async function comprasResumo(): Promise<ResumoCompras> {
  const supabase = await createClient();

  const [aprovar, abertas, cotacoes] = await Promise.all([
    supabase
      .from("ordens_compra")
      .select("valor_total")
      .eq("status", "pendente_aprovacao"),
    supabase.from("ordens_compra").select("valor_total").eq("status", "aprovado"),
    supabase
      .from("cotacoes")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta"),
  ]);

  if (aprovar.error || abertas.error || cotacoes.error) {
    throw new Error("Não foi possível carregar o resumo de Compras");
  }

  return {
    ocsAprovar: {
      contagem: aprovar.data?.length ?? 0,
      valor: somar((aprovar.data ?? []).map((o) => o.valor_total)),
    },
    ocsAbertas: {
      contagem: abertas.data?.length ?? 0,
      valor: somar((abertas.data ?? []).map((o) => o.valor_total)),
    },
    cotacoesAbertas: cotacoes.count ?? 0,
  };
}

/** Resumo do Financeiro: a pagar (aprovadas vencendo/vencidas), a aprovar e pago no mês. */
export async function financeiroResumo(): Promise<ResumoFinanceiro> {
  const supabase = await createClient();

  const hoje = dataHojeISO();
  const limite7 = format(addDays(parseISO(hoje), 7), "yyyy-MM-dd");
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const proximoMes = format(addMonths(parseISO(inicioMes), 1), "yyyy-MM-dd");

  const [aPagar, aAprovar, pagas] = await Promise.all([
    supabase
      .from("lancamento_parcelas")
      .select("valor, data_vencimento, lancamentos!inner(tipo)")
      .eq("status", "aprovado")
      .eq("lancamentos.tipo", "a_pagar")
      .lte("data_vencimento", limite7),
    supabase
      .from("lancamento_parcelas")
      .select("valor, lancamentos!inner(tipo)")
      .eq("status", "pendente")
      .eq("lancamentos.tipo", "a_pagar"),
    supabase
      .from("lancamento_parcelas")
      .select("valor, lancamentos!inner(tipo)")
      .eq("status", "pago")
      .eq("lancamentos.tipo", "a_pagar")
      .gte("data_pagamento", inicioMes)
      .lt("data_pagamento", proximoMes),
  ]);

  if (aPagar.error || aAprovar.error || pagas.error) {
    throw new Error("Não foi possível carregar o resumo do Financeiro");
  }

  const vencidas = (aPagar.data ?? []).filter(
    (p) => p.data_vencimento != null && p.data_vencimento < hoje,
  ).length;

  return {
    aPagar: {
      contagem: aPagar.data?.length ?? 0,
      vencidas,
      valor: somar((aPagar.data ?? []).map((p) => p.valor)),
    },
    aAprovar: {
      contagem: aAprovar.data?.length ?? 0,
      valor: somar((aAprovar.data ?? []).map((p) => p.valor)),
    },
    pagoNoMes: {
      contagem: pagas.data?.length ?? 0,
      valor: somar((pagas.data ?? []).map((p) => p.valor)),
    },
  };
}

/** Resumo do RH: colaboradores ativos, custo da folha mais recente, apontamentos em aberto. */
export async function rhResumo(): Promise<ResumoRh> {
  const supabase = await createClient();

  const [colaboradores, folha, apontamentos] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true),
    supabase
      .from("folhas")
      .select("competencia, custo_total")
      .order("competencia", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("rh_pontos")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberto"),
  ]);

  if (colaboradores.error || folha.error || apontamentos.error) {
    throw new Error("Não foi possível carregar o resumo do RH");
  }

  return {
    colaboradoresAtivos: colaboradores.count ?? 0,
    folha: {
      competencia: folha.data?.competencia ?? null,
      custoTotal: Number(folha.data?.custo_total ?? 0),
    },
    apontamentosAbertos: apontamentos.count ?? 0,
  };
}

/** Custo por mês de referência, para o painel de custo da obra. */
export interface CustoMes {
  /** Primeiro dia do mês (yyyy-MM-01). */
  mes: string;
  total: number;
  lancamentos: number;
}

export interface ResumoCusto {
  /** Meses em ordem crescente, os últimos 6. */
  meses: CustoMes[];
  /** Mês corrente (pode não existir na lista se não houver custo). */
  mesAtual: CustoMes | null;
  /** Mês anterior, para a comparação. */
  mesAnterior: CustoMes | null;
}

/**
 * Custo por MÊS DE REFERÊNCIA (regime de competência), somando o rateio dos
 * lançamentos a pagar por centro de custo.
 *
 * Este é o gasto da obra: como toda OC vira lançamento e existem lançamentos
 * avulsos, o custo está nos lançamentos. Não usa data de pagamento (isso é
 * caixa) nem data de criação.
 */
export async function custoResumo(): Promise<ResumoCusto> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_rel_custo_por_mes", {
    p_meses: 6,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo por mês");
  }

  const meses: CustoMes[] = (data ?? []).map((linha) => ({
    mes: linha.mes,
    total: Number(linha.total ?? 0),
    lancamentos: linha.lancamentos,
  }));

  const atual = mesCompetenciaHoje();
  const anterior = mesAnteriorDe(atual);

  return {
    meses,
    mesAtual: meses.find((m) => m.mes === atual) ?? null,
    mesAnterior: meses.find((m) => m.mes === anterior) ?? null,
  };
}

/** Primeiro dia do mês corrente no fuso de Rio Branco (yyyy-MM-01). */
function mesCompetenciaHoje(): string {
  return `${mesHojeISO()}-01`;
}

/** Primeiro dia do mês anterior a um yyyy-MM-01. */
function mesAnteriorDe(competencia: string): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  return `${anoAnterior}-${String(mesAnterior).padStart(2, "0")}-01`;
}

/** Custo do mês corrente por grupo de insumo, para o painel. */
export interface CustoGrupoMes {
  nome: string;
  valor: number;
}

/**
 * Custo do mês corrente quebrado pelos 4 grupos de insumo. Mesma fonte do
 * relatório (fn_rel_custo_por_grupo), então os números batem entre as telas.
 */
export async function custoPorGrupoDoMes(): Promise<CustoGrupoMes[]> {
  const supabase = await createClient();

  const mes = mesCompetenciaHoje();
  const [ano, mesNumero] = [Number(mes.slice(0, 4)), Number(mes.slice(5, 7))];
  const proximo =
    mesNumero === 12
      ? `${ano + 1}-01-01`
      : `${ano}-${String(mesNumero + 1).padStart(2, "0")}-01`;

  const { data, error } = await supabase.rpc("fn_rel_custo_por_grupo", {
    p_inicio: mes,
    p_fim: proximo,
  });

  if (error) {
    throw new Error("Não foi possível carregar o custo por grupo");
  }

  return (data ?? []).map((linha) => ({
    nome: linha.grupo_nome,
    valor: Number(linha.total ?? 0),
  }));
}
