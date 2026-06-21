import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Obra para os selects, com o lote para desambiguar. */
export interface ObraOpcao {
  id: string;
  nome: string;
  lote: string | null;
}

/** Unidade de medida para os itens da planilha. */
export interface UnidadeOpcao {
  id: string;
  sigla: string;
  nome: string;
}

/** Obras ativas, em ordem alfabética. */
export async function listarObras(): Promise<ObraOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("obras")
    .select("id, nome, lote")
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error("Não foi possível carregar as obras");

  return (data ?? []).map((o) => ({ id: o.id, nome: o.nome, lote: o.lote }));
}

/** Unidades de medida ativas, em ordem de sigla. */
export async function listarUnidades(): Promise<UnidadeOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("unidades_medida")
    .select("id, sigla, nome")
    .eq("ativo", true)
    .order("sigla");

  if (error) throw new Error("Não foi possível carregar as unidades");

  return (data ?? []).map((u) => ({ id: u.id, sigla: u.sigla, nome: u.nome }));
}
