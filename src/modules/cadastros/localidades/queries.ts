import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de localidades. Sem FK: lê direto da tabela. */
export interface LocalidadeLista {
  id: string;
  nome: string;
  endereco: string | null;
  ativo: boolean;
}

/** Lista todas as localidades, ordenadas por nome. */
export async function listar(): Promise<LocalidadeLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("localidades")
    .select("id, nome, endereco, ativo")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as localidades");
  }

  return (data ?? []).map((localidade) => ({
    id: localidade.id,
    nome: localidade.nome,
    endereco: localidade.endereco,
    ativo: localidade.ativo,
  }));
}
