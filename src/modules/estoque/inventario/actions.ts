"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  ajusteSchema,
  type AjusteInput,
} from "@/modules/estoque/inventario/schemas";

const RECURSO = "estoque.inventario" as const;
const ROTA = "/estoque/inventario";

export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

/**
 * Registra um ajuste de inventário via fn_estoque_ajuste (acerta o saldo do
 * sistema contra a contagem física, gerando um ajuste positivo ou negativo a
 * custo médio, com o motivo auditado). A função carimba a data de hoje no
 * banco. Barreira tripla: a UI esconde o botão, esta action checa permissão e
 * a RPC revalida no banco.
 */
export async function registrarAjuste(
  dados: AjusteInput,
): Promise<ResultadoCriacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para lançar ajustes" };
  }

  const validado = ajusteSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_estoque_ajuste", {
    p_insumo: validado.data.insumoId,
    p_deposito: validado.data.depositoId,
    p_quantidade_nova: validado.data.quantidadeNova,
    p_motivo: validado.data.motivo,
  });

  if (error || !data) {
    return erroAcao(
      "estoque.inventario.registrarAjuste",
      error,
      error?.message || "Não foi possível registrar o ajuste",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}
