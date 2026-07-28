import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Opção {id, nome} para os combos de forma/condição de pagamento. */
export interface OpcaoPagamento {
  id: string;
  nome: string;
}

/** Formas de pagamento ativas (dinheiro, PIX, cartão, boleto, TED...). */
export async function listarFormasPagamento(): Promise<OpcaoPagamento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error("Não foi possível carregar as formas de pagamento");
  return data ?? [];
}
