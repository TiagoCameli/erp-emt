import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { Painel } from "./tipos";

/** O mínimo que a tela precisa para não quebrar; o resto do formato é contrato da RPC (Task 3). */
function ehPainel(valor: unknown): valor is Painel {
  if (typeof valor !== "object" || valor === null) return false;
  const p = valor as Record<string, unknown>;
  return Array.isArray(p.contratos) && typeof p.total === "object" && p.total !== null;
}

/**
 * Painel dos contratos que o usuário vê (D3, a RPC já filtra pela lista de acesso), uma linha por
 * contrato com o total consolidado, montado inteiro pela RPC `fn_mc_painel`: todo número vem como
 * texto e a tela só formata (D7).
 *
 * `filtros.status`/`filtros.tipos` vazios viram `null` na chamada, omitindo o parâmetro (o mesmo
 * padrão do `p_ate` do boletim): a coluna `Args` da RPC é `p_status?: string[]`, sem `| null`, e a
 * RPC já tem `default null` para "sem filtro nessa dimensão".
 */
export async function carregarPainel(filtros: {
  status: string[];
  tipos: string[];
}): Promise<{ painel: Painel | null; erro: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mc_painel", {
    ...(filtros.status.length > 0 ? { p_status: filtros.status } : {}),
    ...(filtros.tipos.length > 0 ? { p_tipos: filtros.tipos } : {}),
  });
  if (error) return { painel: null, erro: error.message || "Não foi possível carregar o painel." };
  if (!ehPainel(data)) return { painel: null, erro: "O banco devolveu o painel num formato inesperado." };
  return { painel: data, erro: null };
}
