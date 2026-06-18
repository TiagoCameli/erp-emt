import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TipoDeposito } from "@/modules/cadastros/depositos/schemas";

/** Linha da listagem de depósitos, com os nomes das FKs resolvidos. */
export interface DepositoLista {
  id: string;
  nome: string;
  tipo: TipoDeposito;
  ativo: boolean;
  obraId: string | null;
  obraNome: string | null;
  insumoId: string | null;
  insumoNome: string | null;
}

/** Opção de obra para o select do formulário. */
export interface ObraOpcao {
  id: string;
  nome: string;
}

/** Opção de insumo para o select do formulário. */
export interface InsumoOpcao {
  id: string;
  nome: string;
}

interface DepositoRow {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  obra_id: string | null;
  insumo_id: string | null;
  obras: { nome: string } | null;
  insumos: { nome: string } | null;
}

/** Lista os depósitos com os nomes da obra e do insumo resolvidos por join. */
export async function listar(): Promise<DepositoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("depositos")
    .select(
      "id, nome, tipo, ativo, obra_id, insumo_id, obras(nome), insumos(nome)",
    )
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os depósitos");
  }

  return (data as DepositoRow[]).map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    tipo: linha.tipo as TipoDeposito,
    ativo: linha.ativo,
    obraId: linha.obra_id,
    obraNome: linha.obras?.nome ?? null,
    insumoId: linha.insumo_id,
    insumoNome: linha.insumos?.nome ?? null,
  }));
}

/** Obras ativas para o select de obra do formulário. */
export async function listarObras(): Promise<ObraOpcao[]> {
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

/** Insumos ativos para o select de insumo do formulário (tanques). */
export async function listarInsumos(): Promise<InsumoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os insumos");
  }

  return data ?? [];
}
