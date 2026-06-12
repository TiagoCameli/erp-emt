import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TipoUnidade } from "@/modules/cadastros/unidades/schemas";

/** Linha da listagem de unidades de medida. Sem FK: lê direto da tabela. */
export interface UnidadeLista {
  id: string;
  sigla: string;
  nome: string;
  tipo: TipoUnidade;
  ativo: boolean;
}

/** Lista todas as unidades de medida, ordenadas por sigla. */
export async function listar(): Promise<UnidadeLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("unidades_medida")
    .select("id, sigla, nome, tipo, ativo")
    .order("sigla");

  if (error) {
    throw new Error("Não foi possível carregar as unidades de medida");
  }

  return (data ?? []).map((unidade) => ({
    id: unidade.id,
    sigla: unidade.sigla,
    nome: unidade.nome,
    tipo: unidade.tipo as TipoUnidade,
    ativo: unidade.ativo,
  }));
}
