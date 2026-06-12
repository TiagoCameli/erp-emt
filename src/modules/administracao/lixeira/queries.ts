import "server-only";

import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export interface ItemLixeira {
  id: string;
  tabela: string;
  registroId: string;
  motivo: string;
  dados: Json;
  excluidoPor: string;
  excluidoPorNome: string | null;
  excluidoEm: string;
  restauradoPor: string | null;
  restauradoPorNome: string | null;
  restauradoEm: string | null;
}

export interface ListarLixeiraParams {
  /** Página atual, base 0. */
  pagina: number;
  /** Registros por página. */
  tamanho: number;
  /** true: somente itens na lixeira (restaurado_em nulo). false: inclui o histórico de restaurados. */
  somenteAtivos: boolean;
}

export interface ResultadoLixeira {
  itens: ItemLixeira[];
  total: number;
}

/**
 * Lista a lixeira paginada no servidor, mais recente primeiro.
 * Faz o join manual dos nomes de quem excluiu e de quem restaurou.
 */
export async function listarLixeira({
  pagina,
  tamanho,
  somenteAtivos,
}: ListarLixeiraParams): Promise<ResultadoLixeira> {
  const supabase = await createClient();

  const inicio = pagina * tamanho;
  let consulta = supabase
    .from("lixeira")
    .select(
      "id, tabela, registro_id, motivo, dados, excluido_por, excluido_em, restaurado_por, restaurado_em",
      { count: "exact" },
    )
    .order("excluido_em", { ascending: false })
    .range(inicio, inicio + tamanho - 1);

  if (somenteAtivos) {
    consulta = consulta.is("restaurado_em", null);
  }

  const { data, count, error } = await consulta;
  if (error) {
    throw new Error("Não foi possível carregar a lixeira");
  }

  const linhas = data ?? [];

  const idsUsuarios = new Set<string>();
  for (const linha of linhas) {
    idsUsuarios.add(linha.excluido_por);
    if (linha.restaurado_por) idsUsuarios.add(linha.restaurado_por);
  }

  // RPC com security definer: nomes pra quem tem permissão de lixeira
  // mesmo sem administracao.usuarios ver (RLS da tabela).
  const nomes = new Map<string, string>();
  if (idsUsuarios.size > 0) {
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: [...idsUsuarios],
    });
    for (const usuario of usuarios ?? []) {
      nomes.set(usuario.id, usuario.nome);
    }
  }

  return {
    itens: linhas.map((linha) => ({
      id: linha.id,
      tabela: linha.tabela,
      registroId: linha.registro_id,
      motivo: linha.motivo,
      dados: linha.dados,
      excluidoPor: linha.excluido_por,
      excluidoPorNome: nomes.get(linha.excluido_por) ?? null,
      excluidoEm: linha.excluido_em,
      restauradoPor: linha.restaurado_por,
      restauradoPorNome: linha.restaurado_por
        ? (nomes.get(linha.restaurado_por) ?? null)
        : null,
      restauradoEm: linha.restaurado_em,
    })),
    total: count ?? 0,
  };
}
