"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  minimoSchema,
  type MinimoInput,
} from "@/modules/estoque/alertas/schemas";

const RECURSO = "estoque.alertas" as const;
const ROTA = "/estoque/alertas";
const TABELA = "estoque_minimos" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

/**
 * Define ou atualiza o estoque mínimo de um insumo num depósito. Upsert por
 * (insumo_id, deposito_id): se já existe o par, atualiza o valor; senão cria.
 */
export async function salvarMinimo(
  dados: MinimoInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar alertas" };
  }

  const validado = minimoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).upsert(
    {
      insumo_id: validado.data.insumoId,
      deposito_id: validado.data.depositoId,
      minimo: validado.data.minimo,
    },
    { onConflict: "insumo_id,deposito_id" },
  );

  if (error) {
    return erroAcao(
      "estoque.alertas.salvarMinimo",
      error,
      "Não foi possível salvar o mínimo. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
