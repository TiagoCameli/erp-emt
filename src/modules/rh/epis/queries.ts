import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Filtros opcionais da listagem de EPIs. */
export interface FiltrosEpis {
  colaboradorId?: string;
}

/** Linha da listagem de EPIs, com o nome do colaborador. */
export interface EpiLista {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Nome do EPI. */
  descricao: string;
  /** Certificado de Aprovação. */
  ca: string | null;
  quantidade: number;
  /** Data de entrega (yyyy-MM-dd). */
  dataEntrega: string;
  /** Data de devolução (yyyy-MM-dd) ou null se ainda em uso. */
  dataDevolucao: string | null;
  /** Termo de entrega assinado. */
  assinado: boolean;
  observacao: string | null;
  criadoEm: string;
}

/**
 * Lista EPIs com o nome do colaborador, ordenados por data de entrega (desc) e
 * por criação (desc). O filtro fino é no client; a query aceita colaborador.
 */
export async function listarEpis(filtros: FiltrosEpis = {}): Promise<EpiLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_epis")
    .select(
      "id, colaborador_id, descricao, ca, quantidade, data_entrega, data_devolucao, assinado, observacao, created_at, colaboradores(nome)",
    )
    .order("data_entrega", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtros.colaboradorId) {
    consulta = consulta.eq("colaborador_id", filtros.colaboradorId);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os EPIs");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "",
    descricao: linha.descricao,
    ca: linha.ca,
    quantidade: linha.quantidade,
    dataEntrega: linha.data_entrega,
    dataDevolucao: linha.data_devolucao,
    assinado: linha.assinado,
    observacao: linha.observacao,
    criadoEm: linha.created_at,
  }));
}
