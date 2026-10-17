import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { paraEstadoMapa } from "@/modules/mapa/dados";
import type { CentroCustoOpcaoMapa, EstadoMapa } from "@/modules/mapa/tipos";

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

/**
 * Centros de custo ativos para a ficha da pessoa (centro dela no Mapa). Etapa leva o nome da
 * raiz na frente ("Obra 001 › Terraplenagem"): há etapas de nome igual em obras diferentes.
 * Falha de leitura: lista vazia, a ficha só mostra o centro atual.
 */
export async function listarCentrosCustoMapa(): Promise<
  CentroCustoOpcaoMapa[]
> {
  try {
    const centros = await listarCentrosCusto();
    const nomes = new Map(centros.map((c) => [c.id, c.nome]));
    return centros.map((c) => {
      const pai = c.paiId ? nomes.get(c.paiId) : undefined;
      return { id: c.id, nome: pai ? `${pai} › ${c.nome}` : c.nome };
    });
  } catch {
    return [];
  }
}
