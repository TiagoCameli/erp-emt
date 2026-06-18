import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TipoFornecedor } from "@/modules/cadastros/fornecedores/schemas";

/** Linha da listagem de fornecedores. Sem FK de saída, nada a resolver. */
export interface FornecedorLista {
  id: string;
  tipo: TipoFornecedor;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpjCpf: string | null;
  inscricaoEstadual: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
  observacoes: string | null;
  ativo: boolean;
}

function normalizarTipo(valor: string): TipoFornecedor {
  return valor === "pf" ? "pf" : "pj";
}

/** Lista todos os fornecedores ordenados pela razão social. */
export async function listar(): Promise<FornecedorLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fornecedores")
    .select(
      "id, tipo, razao_social, nome_fantasia, cnpj_cpf, inscricao_estadual, email, telefone, cidade, uf, endereco, observacoes, ativo",
    )
    .order("razao_social");

  if (error) {
    throw new Error("Não foi possível carregar os fornecedores");
  }

  return (data ?? []).map((fornecedor) => ({
    id: fornecedor.id,
    tipo: normalizarTipo(fornecedor.tipo),
    razaoSocial: fornecedor.razao_social,
    nomeFantasia: fornecedor.nome_fantasia,
    cnpjCpf: fornecedor.cnpj_cpf,
    inscricaoEstadual: fornecedor.inscricao_estadual,
    email: fornecedor.email,
    telefone: fornecedor.telefone,
    cidade: fornecedor.cidade,
    uf: fornecedor.uf,
    endereco: fornecedor.endereco,
    observacoes: fornecedor.observacoes,
    ativo: fornecedor.ativo,
  }));
}
