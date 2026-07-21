import "server-only";

import { addDays, addMonths, format, parseISO } from "date-fns";

import { dataHojeISO } from "@/lib/formatadores";
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
