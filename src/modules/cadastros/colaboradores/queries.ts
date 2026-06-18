import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Vinculo } from "@/modules/cadastros/colaboradores/schemas";

/** Linha da listagem de colaboradores, com os nomes das FKs resolvidos. */
export interface ColaboradorLista {
  id: string;
  nome: string;
  cpf: string | null;
  funcao: string | null;
  vinculo: Vinculo;
  obraId: string | null;
  obraNome: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  dataAdmissao: string | null;
  telefone: string | null;
  ativo: boolean;
}

/** Opção de FK (obra ou centro de custo) para os selects do formulário. */
export interface OpcaoSelecao {
  id: string;
  nome: string;
}

/**
 * Lista todos os colaboradores, com o nome da obra e do centro de custo
 * resolvidos via select aninhado. Ordena por nome.
 */
export async function listar(): Promise<ColaboradorLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select(
      "id, nome, cpf, funcao, vinculo, obra_id, centro_custo_id, data_admissao, telefone, ativo, obras(nome), centros_custo(nome)",
    )
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os colaboradores");
  }

  return (data ?? []).map((colaborador) => ({
    id: colaborador.id,
    nome: colaborador.nome,
    cpf: colaborador.cpf,
    funcao: colaborador.funcao,
    vinculo: colaborador.vinculo as Vinculo,
    obraId: colaborador.obra_id,
    obraNome: colaborador.obras?.nome ?? null,
    centroCustoId: colaborador.centro_custo_id,
    centroCustoNome: colaborador.centros_custo?.nome ?? null,
    dataAdmissao: colaborador.data_admissao,
    telefone: colaborador.telefone,
    ativo: colaborador.ativo,
  }));
}

/** Obras ativas para o select de vínculo do colaborador. */
export async function listarObras(): Promise<OpcaoSelecao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("obras")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as obras");
  }

  return data ?? [];
}

/** Centros de custo ativos para o select do colaborador. */
export async function listarCentrosCusto(): Promise<OpcaoSelecao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("centros_custo")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os centros de custo");
  }

  return data ?? [];
}
