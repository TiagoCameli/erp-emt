import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Filtros opcionais da listagem de adiantamentos. */
export interface FiltrosAdiantamentos {
  /** Competência completa (yyyy-MM-01) para filtrar por mês. */
  competencia?: string;
  colaboradorId?: string;
}

/** Linha da listagem de adiantamentos. */
export interface AdiantamentoLista {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Competência (yyyy-MM-01): primeiro dia do mês. */
  competencia: string;
  valor: number;
  /** Data do adiantamento (yyyy-MM-dd). */
  data: string;
  descricao: string | null;
  /** Id da folha em que o adiantamento entrou, ou null se ainda em aberto. */
  folhaId: string | null;
  /** True quando já entrou numa folha: linha travada (sem editar/excluir). */
  naFolha: boolean;
  criadoEm: string;
}

/**
 * Lista adiantamentos com o nome do colaborador e a flag `naFolha`, ordenados
 * por competência (desc) e por criação (desc). Os filtros são opcionais: o
 * filtro fino é feito no client, mas a query aceita competência e colaborador.
 */
export async function listarAdiantamentos(
  filtros: FiltrosAdiantamentos = {},
): Promise<AdiantamentoLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_adiantamentos")
    .select(
      "id, colaborador_id, competencia, valor, data, descricao, folha_id, created_at, colaboradores(nome)",
    )
    .order("competencia", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtros.competencia) {
    consulta = consulta.eq("competencia", filtros.competencia);
  }
  if (filtros.colaboradorId) {
    consulta = consulta.eq("colaborador_id", filtros.colaboradorId);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os adiantamentos");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "",
    competencia: linha.competencia,
    valor: linha.valor,
    data: linha.data,
    descricao: linha.descricao,
    folhaId: linha.folha_id,
    naFolha: linha.folha_id !== null,
    criadoEm: linha.created_at,
  }));
}
