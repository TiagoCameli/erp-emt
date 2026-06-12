import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type ClienteRow = Database["public"]["Tables"]["clientes"]["Row"];

/** Subconjunto de colunas que a listagem busca de clientes. */
type ClienteSelecionado = Pick<
  ClienteRow,
  | "id"
  | "tipo"
  | "nome"
  | "nome_fantasia"
  | "cpf_cnpj"
  | "inscricao_estadual"
  | "email"
  | "telefone"
  | "cidade"
  | "uf"
  | "endereco"
  | "observacoes"
  | "ativo"
>;

/** Cliente como aparece na listagem. Sem FKs de saída para resolver. */
export interface ClienteLista {
  id: string;
  tipo: string;
  nome: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  inscricaoEstadual: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
  observacoes: string | null;
  ativo: boolean;
}

function paraLista(row: ClienteSelecionado): ClienteLista {
  return {
    id: row.id,
    tipo: row.tipo,
    nome: row.nome,
    nomeFantasia: row.nome_fantasia,
    cpfCnpj: row.cpf_cnpj,
    inscricaoEstadual: row.inscricao_estadual,
    email: row.email,
    telefone: row.telefone,
    cidade: row.cidade,
    uf: row.uf,
    endereco: row.endereco,
    observacoes: row.observacoes,
    ativo: row.ativo,
  };
}

/**
 * Lista os clientes ordenados por nome. RLS limita ao que o usuário
 * pode ver. Inclui ativos e inativos: o filtro de status é da UI.
 */
export async function listar(): Promise<ClienteLista[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select(
      "id, tipo, nome, nome_fantasia, cpf_cnpj, inscricao_estadual, email, telefone, cidade, uf, endereco, observacoes, ativo",
    )
    .order("nome", { ascending: true });

  if (error || !data) return [];
  return data.map(paraLista);
}
