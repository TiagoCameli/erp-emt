"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { conferirAnomaliaSchema, type ConferirAnomaliaInput } from "@/modules/frete/anomalias/schemas";

export type ResultadoAcao = { ok: true } | { erro: string };

/**
 * Marca (ou desmarca) uma anomalia do Frete como conferida. A RPC confere a mesma
 * permissão (frete.anomalias/editar) no banco; a checagem aqui evita a ida ao banco.
 * Na origem "marcar como verificada" só pedia ver_frete e nunca gravava motivo.
 */
export async function conferirAnomaliaFrete(dados: ConferirAnomaliaInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao("frete.anomalias", "editar");
  } catch {
    return { erro: "Sem permissão para conferir anomalias" };
  }

  const validado = conferirAnomaliaSchema.safeParse(dados);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  const { chave, conferida, motivo } = validado.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_conferir_anomalia", {
      p_chave: chave,
      p_conferida: conferida,
      ...(motivo ? { p_motivo: motivo } : {}),
    });
    if (error) {
      const generica = conferida ? "Não foi possível marcar a anomalia como conferida" : "Não foi possível desmarcar a anomalia";
      return erroAcao("frete.anomalias.conferir", error, error.code === "P0001" && error.message ? error.message : generica);
    }
  } catch (erro) {
    return erroAcao("frete.anomalias.conferir", erro, "Não foi possível gravar a conferência. Tente novamente");
  }

  // Depois do commit nada vira falha: revalidar é melhor esforço.
  try {
    revalidatePath("/frete/anomalias");
  } catch {
    // a gravação já aconteceu
  }
  return { ok: true };
}
