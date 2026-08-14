import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de provisões (aba de cadastro). */
export interface ProvisaoLista {
  id: string;
  nome: string;
  percentual: number;
  ativo: boolean;
}

/** Lista todas as provisões, ordenadas por nome. Excluídas via lixeira já saem da tabela. */
export async function listarProvisoes(): Promise<ProvisaoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folha_provisoes")
    .select("id, nome, percentual, ativo")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as provisões");
  }

  return data ?? [];
}

/** Provisão ativa, enxuta — para o cálculo/detalhe da folha (Task 2). */
export interface ProvisaoAtiva {
  id: string;
  nome: string;
  percentual: number;
}

/** Lista as provisões ativas, ordenadas por nome — para uso em outros módulos da folha. */
export async function listarProvisoesAtivas(): Promise<ProvisaoAtiva[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folha_provisoes")
    .select("id, nome, percentual")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as provisões ativas");
  }

  return data ?? [];
}
