import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TipoOcorrencia } from "@/modules/rh/ocorrencias/schemas";

/** Filtros opcionais da listagem de ocorrências. */
export interface FiltrosOcorrencias {
  colaboradorId?: string;
  tipo?: TipoOcorrencia;
}

/** Linha da listagem de ocorrências, com o nome do colaborador. */
export interface OcorrenciaLista {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Data da ocorrência (yyyy-MM-dd). */
  data: string;
  tipo: TipoOcorrencia;
  descricao: string;
  observacao: string | null;
  criadoEm: string;
}

/**
 * Lista ocorrências com o nome do colaborador, ordenadas por data (desc) e por
 * criação (desc). O filtro fino é no client; a query aceita colaborador e tipo.
 */
export async function listarOcorrencias(
  filtros: FiltrosOcorrencias = {},
): Promise<OcorrenciaLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_ocorrencias")
    .select(
      "id, colaborador_id, data, tipo, descricao, observacao, created_at, colaboradores(nome)",
    )
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtros.colaboradorId) {
    consulta = consulta.eq("colaborador_id", filtros.colaboradorId);
  }
  if (filtros.tipo) {
    consulta = consulta.eq("tipo", filtros.tipo);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar as ocorrências");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "",
    data: linha.data,
    tipo: linha.tipo as TipoOcorrencia,
    descricao: linha.descricao,
    observacao: linha.observacao,
    criadoEm: linha.created_at,
  }));
}
