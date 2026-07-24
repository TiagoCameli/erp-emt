"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { dataProgramadaSchema } from "@/modules/financeiro/programados/schemas";

const RECURSO = "financeiro.programados" as const;
const ROTA = "/financeiro/programados";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/**
 * Programa (ou reprograma) a data de pagamento de uma parcela via RPC. A
 * regra de negócio (só parcela `aprovado`, ainda não paga) é validada no
 * banco por `fn_programar_pagamento`, que também confere a permissão via
 * `tem_permissao` — a checagem aqui é a segunda camada (Server Action),
 * a RLS/RPC no banco é a barreira final.
 */
export async function programarPagamento(
  parcelaId: string,
  dataISO: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para programar pagamentos" };
  }

  const idValido = uuidSchema.safeParse(parcelaId);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const dataValida = dataProgramadaSchema.safeParse(dataISO);
  if (!dataValida.success) return { erro: "Informe uma data válida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_programar_pagamento", {
    p_parcela_id: idValido.data,
    p_data_programada: dataValida.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.programados.programarPagamento",
      error,
      error.message || "Não foi possível programar o pagamento",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
