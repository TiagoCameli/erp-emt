import { createClient } from "@/lib/supabase/server";

import type { CondicaoPagamentoOpcao } from "./regras";

/**
 * Condições de pagamento ativas, em ordem alfabética. Fonte única da lista que
 * aparece na OC, na cotação e no lançamento avulso: quem escolhe condição em
 * qualquer tela vê exatamente as mesmas opções.
 *
 * Só `ativo`: condição desativada continua valendo nos documentos que já a
 * usam, mas não pode ser escolhida em documento novo.
 */
export async function listarCondicoesPagamento(): Promise<
  CondicaoPagamentoOpcao[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("condicoes_pagamento")
    .select("id, descricao")
    .eq("ativo", true)
    .order("descricao", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar as condições de pagamento");
  }

  return (data ?? []).map((condicao) => ({
    id: condicao.id,
    descricao: condicao.descricao,
  }));
}
