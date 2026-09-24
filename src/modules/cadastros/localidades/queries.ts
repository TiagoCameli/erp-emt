import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

/**
 * Linha da listagem de localidades. `fornecedorId` é a pedreira: o fornecedor que
 * vende o material nesta localidade (liga o frete ao pedido de material no saldo na
 * pedreira). O nome vem do embed; sem permissão de ler fornecedores, vem nulo.
 */
export interface LocalidadeLista {
  id: string;
  nome: string;
  endereco: string | null;
  ativo: boolean;
  fornecedorId: string | null;
  fornecedorNome: string | null;
}

export interface FornecedorOpcao {
  id: string;
  nome: string;
}

function nomeFornecedor(f: { razao_social: string; nome_fantasia: string | null } | null): string | null {
  if (!f) return null;
  return f.nome_fantasia?.trim() || f.razao_social;
}

/** Fornecedores ativos para a pedreira (são mais de 900: `todasAsLinhas`). */
export async function listarFornecedoresAtivos(): Promise<FornecedorOpcao[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os fornecedores");
  return linhas.map((f) => ({ id: f.id, nome: nomeFornecedor(f) ?? f.razao_social }));
}

/** Lista todas as localidades, ordenadas por nome. */
export async function listar(): Promise<LocalidadeLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("localidades")
    .select("id, nome, endereco, ativo, fornecedor_id, fornecedores(razao_social, nome_fantasia)")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as localidades");
  }

  return (data ?? []).map((localidade) => ({
    id: localidade.id,
    nome: localidade.nome,
    endereco: localidade.endereco,
    ativo: localidade.ativo,
    fornecedorId: localidade.fornecedor_id,
    fornecedorNome: nomeFornecedor(localidade.fornecedores),
  }));
}
