"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  conferirAnomaliaSchema,
  revisarSemSuprimentoSchema,
  type ConferirAnomaliaInput,
  type RevisarSemSuprimentoInput,
} from "@/modules/combustivel/anomalias/schemas";

const RECURSO = "combustivel.anomalias" as const;
const ROTA = "/combustivel/anomalias";

export type ResultadoAcao = { ok: true } | { erro: string };

/** Texto da trava (P0001) sobe; o resto vira a mensagem genérica, com o real no log. */
function erroDaRpc(contexto: string, error: { code?: string; message?: string }, generica: string) {
  if (error.code === "P0001" && error.message) return erroAcao(contexto, error, error.message);
  return erroAcao(contexto, error, generica);
}

/**
 * Marca (ou desmarca) uma anomalia como conferida. A RPC confere a mesma
 * permissão no banco; a checagem aqui evita a ida ao banco e dá a mensagem certa.
 */
export async function conferirAnomalia(dados: ConferirAnomaliaInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conferir anomalias" };
  }

  const validado = conferirAnomaliaSchema.safeParse(dados);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  const { chave, conferida, motivo } = validado.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_conferir_anomalia", {
      p_chave: chave,
      p_conferida: conferida,
      ...(motivo ? { p_motivo: motivo } : {}),
    });
    if (error) {
      return erroDaRpc(
        "combustivel.anomalias.conferir",
        error,
        conferida ? "Não foi possível marcar a anomalia como conferida" : "Não foi possível desmarcar a anomalia",
      );
    }
  } catch (erro) {
    return erroAcao("combustivel.anomalias.conferir", erro, "Não foi possível gravar a conferência. Tente novamente");
  }

  revalidatePath(ROTA);
  revalidatePath("/combustivel");
  return { ok: true };
}

/** Marca (ou desfaz) a revisão de uma saída sem suprimento. */
export async function revisarSemSuprimento(dados: RevisarSemSuprimentoInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para revisar saídas sem suprimento" };
  }

  const validado = revisarSemSuprimentoSchema.safeParse(dados);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  const { saidaId, revisado, observacao } = validado.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_revisar_sem_suprimento", {
      p_saida: saidaId,
      p_revisado: revisado,
      ...(observacao ? { p_observacao: observacao } : {}),
    });
    if (error) {
      return erroDaRpc(
        "combustivel.anomalias.revisarSemSuprimento",
        error,
        revisado ? "Não foi possível marcar como revisado" : "Não foi possível desfazer a revisão",
      );
    }
  } catch (erro) {
    return erroAcao("combustivel.anomalias.revisarSemSuprimento", erro, "Não foi possível gravar a revisão. Tente novamente");
  }

  revalidatePath(ROTA);
  revalidatePath("/combustivel");
  return { ok: true };
}
