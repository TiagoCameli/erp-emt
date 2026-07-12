"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

type ResultadoAcao = { erro: string } | undefined;

/**
 * Restaura um item da lixeira reinserindo o registro na tabela de origem,
 * via RPC fn_restaurar_cadastro (security definer). A função do banco exige
 * permissão de editar a lixeira E de criar no recurso de destino, e marca
 * restaurado_por/restaurado_em. Cobre os cadastros folha da Fase 1.
 */
export async function restaurarItem(lixeiraId: string): Promise<ResultadoAcao> {
  await exigirPermissao("administracao.lixeira", "editar");

  if (!lixeiraId) {
    return { erro: "Item da lixeira inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_restaurar_cadastro", {
    p_lixeira_id: lixeiraId,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("ja foi restaurado")) {
      return { erro: "Este item já foi restaurado" };
    }
    if (msg.includes("nao pode ser restaurada")) {
      return { erro: "Este tipo de registro não pode ser restaurado" };
    }
    if (msg.includes("Sem permissao")) {
      return { erro: "Você não tem permissão para restaurar este registro" };
    }
    if (msg.includes("duplicate key") || msg.includes("23505")) {
      return {
        erro: "Já existe um registro com esses dados. Não foi possível restaurar",
      };
    }
    return erroAcao(
      "administracao.lixeira.restaurar",
      error,
      "Não foi possível restaurar o item. Tente novamente",
    );
  }

  revalidatePath("/administracao/lixeira");
  return undefined;
}
