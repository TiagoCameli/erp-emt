import "server-only";

import { createClient } from "@/lib/supabase/server";
import { dataHojeISO } from "@/lib/formatadores";
import type { StatusFerias } from "@/modules/rh/ferias/schemas";

/**
 * Situação de gozo calculada na leitura. Sem inventar lei: o limite de gozo é
 * o fim do período aquisitivo + 12 meses. "vencida" se ainda programada e hoje
 * passou do limite; "a_vencer" se faltam 60 dias ou menos; "gozada" quando já
 * usufruída; "ok" nos demais casos.
 */
export type SituacaoFerias = "vencida" | "a_vencer" | "ok" | "gozada";

/** Filtros opcionais da listagem de férias. */
export interface FiltrosFerias {
  colaboradorId?: string;
}

/** Linha da listagem de férias, com nome do colaborador e a situação. */
export interface FeriasLista {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Início do período aquisitivo (yyyy-MM-dd). */
  periodoAquisitivoInicio: string;
  /** Fim do período aquisitivo (yyyy-MM-dd). */
  periodoAquisitivoFim: string;
  /** Início do gozo (yyyy-MM-dd) ou null se só programada. */
  dataInicio: string | null;
  /** Fim do gozo (yyyy-MM-dd) ou null se só programada. */
  dataFim: string | null;
  dias: number;
  status: StatusFerias;
  observacao: string | null;
  /** Limite de gozo (yyyy-MM-dd): fim do período aquisitivo + 12 meses. */
  limiteGozo: string;
  /** Situação calculada na leitura. */
  situacao: SituacaoFerias;
  criadoEm: string;
}

/** Janela, em dias, para considerar férias "a vencer". */
const DIAS_A_VENCER = 60;

/** Soma 12 meses a uma data yyyy-MM-dd, devolvendo yyyy-MM-dd. */
function limiteEmDozeMeses(dataFim: string): string {
  const [ano, mes, dia] = dataFim.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  base.setUTCFullYear(base.getUTCFullYear() + 1);
  return base.toISOString().slice(0, 10);
}

/** Diferença em dias inteiros entre duas datas yyyy-MM-dd (b menos a). */
function diasEntre(a: string, b: string): number {
  const [a1, a2, a3] = a.split("-").map(Number);
  const [b1, b2, b3] = b.split("-").map(Number);
  const inicio = Date.UTC(a1, a2 - 1, a3);
  const fim = Date.UTC(b1, b2 - 1, b3);
  return Math.round((fim - inicio) / 86_400_000);
}

/** Calcula a situação a partir do status, do limite e da data de hoje. */
function calcularSituacao(
  status: StatusFerias,
  limiteGozo: string,
  hoje: string,
): SituacaoFerias {
  if (status === "gozada") return "gozada";
  if (hoje > limiteGozo) return "vencida";
  if (diasEntre(hoje, limiteGozo) <= DIAS_A_VENCER) return "a_vencer";
  return "ok";
}

/**
 * Lista férias com o nome do colaborador e a situação calculada (limite de
 * gozo, vencida/a vencer/ok/gozada), ordenadas por limite de gozo crescente
 * para deixar as mais urgentes no topo. O filtro fino é no client.
 */
export async function listarFerias(
  filtros: FiltrosFerias = {},
): Promise<FeriasLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_ferias")
    .select(
      "id, colaborador_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim, data_inicio, data_fim, dias, status, observacao, created_at, colaboradores(nome)",
    )
    .order("periodo_aquisitivo_fim", { ascending: true })
    .order("created_at", { ascending: false });

  if (filtros.colaboradorId) {
    consulta = consulta.eq("colaborador_id", filtros.colaboradorId);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar as férias");
  }

  const hoje = dataHojeISO();

  return (data ?? []).map((linha) => {
    const status = linha.status as StatusFerias;
    const limiteGozo = limiteEmDozeMeses(linha.periodo_aquisitivo_fim);
    return {
      id: linha.id,
      colaboradorId: linha.colaborador_id,
      colaboradorNome: linha.colaboradores?.nome ?? "",
      periodoAquisitivoInicio: linha.periodo_aquisitivo_inicio,
      periodoAquisitivoFim: linha.periodo_aquisitivo_fim,
      dataInicio: linha.data_inicio,
      dataFim: linha.data_fim,
      dias: linha.dias,
      status,
      observacao: linha.observacao,
      limiteGozo,
      situacao: calcularSituacao(status, limiteGozo, hoje),
      criadoEm: linha.created_at,
    };
  });
}
