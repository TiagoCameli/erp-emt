"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const RECURSO = "cadastros.orcamentos" as const;
const ROTA = "/cadastros/orcamentos";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** Exclui um orçamento (os itens caem em cascata pela FK). */
export async function excluir(id: string): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir orçamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Orçamento inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("orcamentos")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível excluir o orçamento. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}
