import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TipoMovimento } from "@/modules/rh/banco-horas/schemas";

/** Filtros opcionais da listagem de movimentos. */
export interface FiltrosMovimentos {
  colaboradorId?: string;
}

/** Linha da listagem de movimentos do banco de horas. */
export interface MovimentoLista {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Data do movimento (yyyy-MM-dd). */
  data: string;
  tipo: TipoMovimento;
  horas: number;
  motivo: string | null;
  observacao: string | null;
  criadoEm: string;
}

/** Saldo de horas de um colaborador (créditos menos débitos). */
export interface SaldoColaborador {
  colaboradorId: string;
  nome: string;
  saldo: number;
}

/**
 * Lista os movimentos do banco de horas com o nome do colaborador, ordenados
 * por data (desc) e criação (desc). O filtro de colaborador é opcional.
 */
export async function listarMovimentos(
  filtros: FiltrosMovimentos = {},
): Promise<MovimentoLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("banco_horas_movimentos")
    .select(
      "id, colaborador_id, data, tipo, horas, motivo, observacao, created_at, colaboradores(nome)",
    )
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtros.colaboradorId) {
    consulta = consulta.eq("colaborador_id", filtros.colaboradorId);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os movimentos");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "",
    data: linha.data,
    tipo: linha.tipo as TipoMovimento,
    horas: linha.horas,
    motivo: linha.motivo,
    observacao: linha.observacao,
    criadoEm: linha.created_at,
  }));
}

/**
 * Saldo de horas por colaborador: soma dos créditos menos soma dos débitos.
 * Agrega em memória num único select (sem N+1), ignorando colaboradores sem
 * movimento. Ordena por nome.
 */
export async function resumoSaldos(): Promise<SaldoColaborador[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("banco_horas_movimentos")
    .select("colaborador_id, tipo, horas, colaboradores(nome)");

  if (error) {
    throw new Error("Não foi possível carregar os saldos");
  }

  const porColaborador = new Map<string, SaldoColaborador>();

  for (const linha of data ?? []) {
    const atual = porColaborador.get(linha.colaborador_id) ?? {
      colaboradorId: linha.colaborador_id,
      nome: linha.colaboradores?.nome ?? "",
      saldo: 0,
    };
    atual.saldo += linha.tipo === "credito" ? linha.horas : -linha.horas;
    porColaborador.set(linha.colaborador_id, atual);
  }

  return [...porColaborador.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome),
  );
}
