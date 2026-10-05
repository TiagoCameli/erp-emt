import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Apelido bancário (Bloco I da conciliação, 05/10/2026): o nome que o banco
 * escreve no histórico para este fornecedor ou colaborador (FORTBRAS
 * AUTOPECAS para RONDOBRAS). Com o apelido, a conciliação casa sem o selo
 * "Confira".
 */
export interface ApelidoBancario {
  id: string;
  apelido: string;
  fornecedorId: string | null;
  colaboradorId: string | null;
  /** Fornecedor (nome fantasia ou razão social) ou colaborador. */
  favorecido: string;
  origem: "conciliacao" | "manual";
  vezesUsado: number;
  ultimoUso: string | null;
  criadoEm: string;
}

export async function listarApelidos(): Promise<ApelidoBancario[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedor_apelidos_bancarios")
    .select(
      "id, apelido, fornecedor_id, colaborador_id, origem, vezes_usado, ultimo_uso, created_at, fornecedores(razao_social, nome_fantasia), colaboradores(nome)",
    )
    .order("apelido");
  if (error) {
    throw new Error("Não foi possível carregar os apelidos bancários");
  }
  return (data ?? []).map((a) => ({
    id: a.id,
    apelido: a.apelido,
    fornecedorId: a.fornecedor_id,
    colaboradorId: a.colaborador_id,
    favorecido:
      a.fornecedores?.nome_fantasia ?? a.fornecedores?.razao_social ?? a.colaboradores?.nome ?? "-",
    origem: a.origem === "manual" ? "manual" : "conciliacao",
    vezesUsado: a.vezes_usado,
    ultimoUso: a.ultimo_uso,
    criadoEm: a.created_at,
  }));
}
