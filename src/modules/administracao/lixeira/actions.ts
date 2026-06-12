"use server";

import { exigirPermissao } from "@/lib/permissoes";

type ResultadoAcao = { erro: string } | undefined;

/**
 * Restaura um item da lixeira: reinsere os dados na tabela de origem
 * e marca restaurado_por/restaurado_em.
 *
 * Na Fase 0 ainda não existem tabelas transacionais, então a restauração
 * fica indisponível por decisão de projeto. O código da chamada já está
 * pronto abaixo, comentado, para ser ativado na Fase 1+.
 */
export async function restaurarItem(lixeiraId: string): Promise<ResultadoAcao> {
  await exigirPermissao("administracao.lixeira", "editar");

  if (!lixeiraId) {
    return { erro: "Item da lixeira inválido" };
  }

  // Fase 1+: ativar quando os módulos transacionais existirem.
  // Imports necessários: revalidatePath de "next/cache" e
  // createClient de "@/lib/supabase/server".
  //
  // const usuario = await exigirPermissao("administracao.lixeira", "editar");
  // const supabase = await createClient();
  //
  // const { data: item } = await supabase
  //   .from("lixeira")
  //   .select("id, tabela, registro_id, dados, restaurado_em")
  //   .eq("id", lixeiraId)
  //   .single();
  // if (!item) return { erro: "Item não encontrado na lixeira" };
  // if (item.restaurado_em) return { erro: "Este item já foi restaurado" };
  //
  // 1. Reinserir item.dados na tabela de origem (item.tabela),
  //    respeitando o RLS e o trigger de auditoria da tabela.
  // 2. Marcar o item como restaurado:
  // const { error } = await supabase
  //   .from("lixeira")
  //   .update({
  //     restaurado_por: usuario.id,
  //     restaurado_em: new Date().toISOString(),
  //   })
  //   .eq("id", lixeiraId);
  // if (error) return { erro: "Não foi possível restaurar o item" };
  //
  // revalidatePath("/administracao/lixeira");
  // return undefined;

  return {
    erro: "Restauração estará disponível quando os módulos transacionais existirem (Fase 1+)",
  };
}
