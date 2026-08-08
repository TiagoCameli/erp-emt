import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de encargos (aba de cadastro). */
export interface EncargoLista {
  id: string;
  nome: string;
  percentual: number;
  ativo: boolean;
  /** Grupo de recolhimento (guia do Financeiro). Nulo: o encargo não vira guia. */
  grupoRecolhimento: string | null;
}

/** Lista todos os encargos, ordenados por nome. Excluídos via lixeira já saem da tabela. */
export async function listarEncargos(): Promise<EncargoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folha_encargos")
    .select("id, nome, percentual, ativo, grupo_recolhimento")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os encargos");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    percentual: linha.percentual,
    ativo: linha.ativo,
    grupoRecolhimento: linha.grupo_recolhimento,
  }));
}

/** Encargo ativo, enxuto — para o cálculo/detalhe da folha. */
export interface EncargoAtivo {
  id: string;
  nome: string;
  percentual: number;
}

/** Lista os encargos ativos, ordenados por nome — para uso em outros módulos da folha. */
export async function listarEncargosAtivos(): Promise<EncargoAtivo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folha_encargos")
    .select("id, nome, percentual")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os encargos ativos");
  }

  return data ?? [];
}
