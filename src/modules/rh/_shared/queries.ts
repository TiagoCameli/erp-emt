import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Colaborador para os selects. */
export interface ColaboradorOpcao {
  id: string;
  nome: string;
  funcao: string | null;
  vinculo: string;
}

/** Diarista para os selects, com o valor padrão da diária. */
export interface DiaristaOpcao {
  id: string;
  nome: string;
  valorDiaria: number | null;
}

/** Obra para os selects. */
export interface ObraOpcao {
  id: string;
  nome: string;
  lote: string | null;
}

/** Colaboradores ativos, em ordem alfabética. */
export async function listarColaboradores(): Promise<ColaboradorOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select("id, nome, funcao, vinculo")
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os colaboradores");

  return (data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    funcao: c.funcao,
    vinculo: c.vinculo,
  }));
}

/** Diaristas ativos, com o valor da diária do cadastro. */
export async function listarDiaristas(): Promise<DiaristaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select("id, nome, valor_diaria")
    .eq("ativo", true)
    .eq("vinculo", "diarista")
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os diaristas");

  return (data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    valorDiaria: c.valor_diaria,
  }));
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
