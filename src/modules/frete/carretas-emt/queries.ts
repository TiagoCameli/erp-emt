import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DadosCarretas } from "@/modules/frete/carretas-emt/calculo";
import { paraDadosCarretas } from "@/modules/frete/carretas-emt/dados";

/**
 * Tudo da aba numa chamada: `fn_frete_carretas_emt` já devolve agregado (algumas centenas de
 * linhas), e a RPC recusa quem não tem frete.carretas-emt/ver. A mensagem dela volta em `erro`
 * para a tela mostrar como está.
 */
export async function carregarCarretasEmt(): Promise<{ dados: DadosCarretas | null; erro: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_frete_carretas_emt");
  if (error) return { dados: null, erro: error.message || "Não foi possível carregar as Carretas EMT." };
  const dados = paraDadosCarretas(data);
  if (!dados) return { dados: null, erro: "O banco devolveu as Carretas EMT num formato inesperado." };
  return { dados, erro: null };
}
