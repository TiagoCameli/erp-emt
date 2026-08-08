import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de faixas de INSS (aba de parâmetros da folha). */
export interface FaixaInssLista {
  id: string;
  limiteAte: number;
  aliquota: number;
}

/** Lista as faixas de INSS, ordenadas pelo limite (a mais baixa primeiro). */
export async function listarFaixasInss(): Promise<FaixaInssLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folha_inss_faixas")
    .select("id, limite_ate, aliquota")
    .order("limite_ate");

  if (error) {
    throw new Error("Não foi possível carregar as faixas de INSS");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    limiteAte: linha.limite_ate,
    aliquota: linha.aliquota,
  }));
}

/** Linha da listagem de faixas de IRRF (aba de parâmetros da folha). */
export interface FaixaIrrfLista {
  id: string;
  limiteAte: number;
  aliquota: number;
  parcelaDeduzir: number;
}

/** Lista as faixas de IRRF, ordenadas pelo limite (a mais baixa primeiro). */
export async function listarFaixasIrrf(): Promise<FaixaIrrfLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folha_irrf_faixas")
    .select("id, limite_ate, aliquota, parcela_deduzir")
    .order("limite_ate");

  if (error) {
    throw new Error("Não foi possível carregar as faixas de IRRF");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    limiteAte: linha.limite_ate,
    aliquota: linha.aliquota,
    parcelaDeduzir: linha.parcela_deduzir,
  }));
}

/** Parâmetros escalares da folha (config singleton, id=1). */
export interface ParametrosFolha {
  irrfDeducaoPorDependente: number;
  irrfDescontoSimplificado: number;
  fgtsPercentual: number;
  /** Dia do mês do pagamento do salário. Nulo: ainda não configurado. */
  diaPagamentoSalario: number | null;
  /** Dia do mês de vencimento das guias (INSS, FGTS e IRRF vencem juntos). */
  diaVencimentoGuias: number | null;
  /** Grupo de recolhimento do INSS retido do trabalhador. Nulo: não vira guia. */
  grupoRecolhimentoInss: string | null;
  /** Grupo de recolhimento do IRRF retido do trabalhador. Nulo: não vira guia. */
  grupoRecolhimentoIrrf: string | null;
}

/**
 * Busca a única linha de `folha_parametros` (id=1). Retorna `null` quando
 * ela ainda não foi criada — o Tiago ainda não salvou os parâmetros.
 */
export async function buscarParametros(): Promise<ParametrosFolha | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folha_parametros")
    .select(
      "irrf_deducao_por_dependente, irrf_desconto_simplificado, fgts_percentual, dia_pagamento_salario, dia_vencimento_guias, grupo_recolhimento_inss, grupo_recolhimento_irrf",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível carregar os parâmetros da folha");
  }

  if (!data) return null;

  return {
    irrfDeducaoPorDependente: data.irrf_deducao_por_dependente,
    irrfDescontoSimplificado: data.irrf_desconto_simplificado,
    fgtsPercentual: data.fgts_percentual,
    diaPagamentoSalario: data.dia_pagamento_salario,
    diaVencimentoGuias: data.dia_vencimento_guias,
    grupoRecolhimentoInss: data.grupo_recolhimento_inss,
    grupoRecolhimentoIrrf: data.grupo_recolhimento_irrf,
  };
}

/**
 * Grupos de recolhimento distintos já cadastrados nos encargos, para o
 * Combobox dos retidos. O nome do grupo casa por igualdade exata na geração da
 * guia: dois inputs de texto livre transformariam "INSS" e "inss" em duas
 * guias, caladas.
 */
export async function listarGruposRecolhimento(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folha_encargos")
    .select("grupo_recolhimento")
    .not("grupo_recolhimento", "is", null);

  if (error) throw new Error("Não foi possível carregar os grupos de recolhimento");

  const grupos = new Set<string>();
  for (const linha of data ?? []) {
    if (linha.grupo_recolhimento) grupos.add(linha.grupo_recolhimento);
  }
  return [...grupos].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
