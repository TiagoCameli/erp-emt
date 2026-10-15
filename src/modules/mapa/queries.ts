import "server-only";

import { createClient } from "@/lib/supabase/server";
import { paraEstadoMapa } from "@/modules/mapa/dados";
import type { EstadoMapa } from "@/modules/mapa/tipos";

/**
 * Tudo que o mapa desenha, numa chamada: `fn_mapa_estado()` já devolve equipamentos no mapa,
 * candidatos a locação, pessoas, trechos (traçado em GeoJSON), áreas, localidades, frentes do
 * dia, modelos 3D e as configurações de snap. A RPC recusa quem não tem mapa.mapa/ver; a
 * mensagem dela volta em `erro` para a tela dizer o que houve.
 */
export async function carregarEstadoMapa(): Promise<{
  estado: EstadoMapa | null;
  erro: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mapa_estado");
  if (error)
    return {
      estado: null,
      erro: error.message || "Não foi possível carregar o mapa.",
    };
  const estado = paraEstadoMapa(data);
  if (!estado)
    return {
      estado: null,
      erro: "O banco devolveu o mapa num formato inesperado.",
    };
  return { estado, erro: null };
}
