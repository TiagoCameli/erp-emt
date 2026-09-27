import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { Boletim } from "./tipos";

/** O mínimo que a tela precisa para não quebrar; o resto do formato é contrato da RPC (Task 3). */
function ehBoletim(valor: unknown): valor is Boletim {
  if (typeof valor !== "object" || valor === null) return false;
  const b = valor as Record<string, unknown>;
  return (
    typeof b.contrato === "object" && b.contrato !== null &&
    Array.isArray(b.medicoes) && Array.isArray(b.linhas) && Array.isArray(b.fora_da_versao) &&
    typeof b.total === "object" && b.total !== null
  );
}

/**
 * Boletim do contrato "até a Nª" (`ate` nulo = última medição), montado inteiro pela RPC
 * `fn_mc_boletim`: todo número vem como texto e a tela só formata (D7).
 *
 * A RPC recusa com mensagem em português (sem permissão, contrato fora da lista, medição que não
 * existe): essa mensagem volta em `erro`, para a tela mostrar como está, em vez de um boletim vazio.
 */
export async function carregarBoletim(
  contratoId: string,
  ate: number | null,
): Promise<{ boletim: Boletim | null; erro: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_mc_boletim",
    ate === null ? { p_contrato: contratoId } : { p_contrato: contratoId, p_ate: ate },
  );
  if (error) return { boletim: null, erro: error.message || "Não foi possível carregar o boletim." };
  if (!ehBoletim(data)) return { boletim: null, erro: "O banco devolveu o boletim num formato inesperado." };
  return { boletim: data, erro: null };
}
