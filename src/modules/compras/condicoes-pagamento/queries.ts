import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Descrições das condições de pagamento ativas, em ordem alfabética.
 * Alimenta o combobox de condição de pagamento em Ordens e Cotações.
 */
export async function listarCondicoesPagamento(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("condicoes_pagamento")
    .select("descricao")
    .eq("ativo", true)
    .order("descricao", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar as condições de pagamento");
  }

  return (data ?? []).map((linha) => linha.descricao);
}
