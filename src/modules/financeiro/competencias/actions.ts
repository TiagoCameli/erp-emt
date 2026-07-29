"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { mesParaCompetencia } from "@/lib/formatadores";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const RECURSO = "financeiro.competencias" as const;
const ROTA = "/financeiro/competencias";

export type ResultadoCompetencia = { ok: true } | { erro: string };

/** Aceita "2026-07" (input) ou "2026-07-01" (banco). */
function competenciaValida(mes: string): string {
  return /^\d{4}-\d{2}-01$/.test(mes) ? mes : mesParaCompetencia(mes);
}

/**
 * Fecha um mês de referência. Depois disso, lançar naquele mês só é possível
 * para quem pode reabrir a competência, e a exceção fica registrada na
 * auditoria. A regra vive no banco (`fn_fechar_competencia`).
 */
export async function fecharCompetencia(
  mes: string,
  observacao?: string,
): Promise<ResultadoCompetencia> {
  try {
    await exigirPermissao(RECURSO, "aprovar");
  } catch {
    return { erro: "Sem permissão para fechar competência" };
  }

  const competencia = competenciaValida(mes);
  if (competencia === "") return { erro: "Informe o mês a fechar" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fechar_competencia", {
    p_mes: competencia,
    p_observacao: observacao?.trim() ?? "",
  });

  if (error) {
    return erroAcao(
      "financeiro.competencias.fecharCompetencia",
      error,
      error.message || "Não foi possível fechar a competência",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Reabre um mês fechado. Exige motivo: reabrir competência muda número que
 * alguém já olhou, então fica registrado quem reabriu e por quê.
 */
export async function reabrirCompetencia(
  mes: string,
  motivo: string,
): Promise<ResultadoCompetencia> {
  try {
    await exigirPermissao(RECURSO, "desaprovar");
  } catch {
    return { erro: "Sem permissão para reabrir competência" };
  }

  const competencia = competenciaValida(mes);
  if (competencia === "") return { erro: "Informe o mês a reabrir" };
  if (motivo.trim() === "") return { erro: "Informe o motivo da reabertura" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reabrir_competencia", {
    p_mes: competencia,
    p_motivo: motivo.trim(),
  });

  if (error) {
    return erroAcao(
      "financeiro.competencias.reabrirCompetencia",
      error,
      error.message || "Não foi possível reabrir a competência",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
