"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { podeConfigurarCards } from "@/modules/frete/painel/calculo";

export type ResultadoAcao = { ok: true } | { erro: string };

const cardsSchema = z.array(idSchema).max(200, { error: "No máximo 200 cards" });

/**
 * Salva os fornecedores dos cards de saldo do painel, na ordem de marcação (como a
 * origem). Pede frete.painel/ver + frete.pagamentos/criar (plano 4.1); a RPC confere de
 * novo no banco. Na origem não havia checagem na tela, só a RLS de ver_frete.
 */
export async function salvarCardsPainel(fornecedorIds: string[]): Promise<ResultadoAcao> {
  const usuario = await getUsuarioLogado();
  if (!podeConfigurarCards((recurso, acao) => temPermissao(usuario, recurso, acao))) {
    return { erro: "Sem permissão para configurar os cards" };
  }

  const validado = cardsSchema.safeParse(fornecedorIds);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  const ids = [...new Set(validado.data)];

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_painel_config_salvar", { p_fornecedores: ids });
    if (error) {
      return erroAcao(
        "frete.painel.salvarCards",
        error,
        error.code === "P0001" && error.message ? error.message : "Não foi possível salvar os cards",
      );
    }
  } catch (erro) {
    return erroAcao("frete.painel.salvarCards", erro, "Não foi possível salvar os cards. Tente novamente");
  }

  try {
    revalidatePath("/frete");
  } catch {
    // a gravação já aconteceu
  }
  return { ok: true };
}
