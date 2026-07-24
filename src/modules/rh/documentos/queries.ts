import "server-only";

import { createClient } from "@/lib/supabase/server";
import { dataHojeISO } from "@/lib/formatadores";
import type { TipoDocumento } from "@/modules/rh/documentos/schemas";

/**
 * Situação de vencimento de um documento, calculada na leitura:
 * - "vencido": data_vencimento anterior a hoje.
 * - "a_vencer": vence em até 30 dias (inclusive hoje).
 * - "ok": vence em mais de 30 dias.
 * - "sem_vencimento": documento sem data de vencimento.
 */
export type SituacaoDocumento = "vencido" | "a_vencer" | "ok" | "sem_vencimento";

/** Janela de alerta de "a vencer", em dias. */
const JANELA_A_VENCER_DIAS = 30;

/** Filtros opcionais da listagem de documentos. */
export interface FiltrosDocumentos {
  colaboradorId?: string;
}

/** Linha da listagem de documentos. */
export interface DocumentoLista {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  tipo: TipoDocumento;
  descricao: string;
  /** Data de emissão (yyyy-MM-dd) ou null. */
  dataEmissao: string | null;
  /** Data de vencimento (yyyy-MM-dd) ou null. */
  dataVencimento: string | null;
  observacao: string | null;
  /** Situação de vencimento calculada na leitura. */
  situacao: SituacaoDocumento;
  criadoEm: string;
}

/**
 * Calcula a situação de um documento a partir da data de vencimento e da data
 * de referência (hoje). Compara strings yyyy-MM-dd, que ordenam corretamente.
 */
function calcularSituacao(
  dataVencimento: string | null,
  hoje: string,
): SituacaoDocumento {
  if (!dataVencimento) return "sem_vencimento";
  if (dataVencimento < hoje) return "vencido";

  const limite = new Date(`${hoje}T00:00:00`);
  limite.setDate(limite.getDate() + JANELA_A_VENCER_DIAS);
  const limiteISO = limite.toISOString().slice(0, 10);

  if (dataVencimento <= limiteISO) return "a_vencer";
  return "ok";
}

/**
 * Lista os documentos com o nome do colaborador e a situação de vencimento
 * calculada na leitura, ordenados por vencimento (mais próximo primeiro,
 * nulos por último) e, em empate, por criação (desc). O filtro fino é no
 * client; a query aceita colaborador (usado pela ficha do colaborador).
 */
export async function listarDocumentos(
  filtros: FiltrosDocumentos = {},
): Promise<DocumentoLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_documentos")
    .select(
      "id, colaborador_id, tipo, descricao, data_emissao, data_vencimento, observacao, created_at, colaboradores(nome)",
    )
    .order("created_at", { ascending: false });

  if (filtros.colaboradorId) {
    consulta = consulta.eq("colaborador_id", filtros.colaboradorId);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os documentos");
  }

  const hoje = dataHojeISO();

  const linhas: DocumentoLista[] = (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "",
    tipo: linha.tipo as TipoDocumento,
    descricao: linha.descricao,
    dataEmissao: linha.data_emissao,
    dataVencimento: linha.data_vencimento,
    observacao: linha.observacao,
    situacao: calcularSituacao(linha.data_vencimento, hoje),
    criadoEm: linha.created_at,
  }));

  // Vencimento mais próximo primeiro; documentos sem vencimento por último.
  return linhas.sort((a, b) => {
    if (a.dataVencimento && b.dataVencimento) {
      return a.dataVencimento.localeCompare(b.dataVencimento);
    }
    if (a.dataVencimento) return -1;
    if (b.dataVencimento) return 1;
    return b.criadoEm.localeCompare(a.criadoEm);
  });
}
