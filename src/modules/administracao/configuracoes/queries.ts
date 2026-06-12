import "server-only";

import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export interface Configuracao {
  chave: string;
  valor: Json;
  descricao: string | null;
}

/** Lista todas as configurações do sistema, ordenadas por chave. */
export async function listarConfiguracoes(): Promise<Configuracao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("configuracoes")
    .select("chave, valor, descricao")
    .order("chave");

  if (error) {
    throw new Error("Não foi possível carregar as configurações");
  }

  return data ?? [];
}
