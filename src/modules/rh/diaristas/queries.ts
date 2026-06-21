import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Filtros opcionais da listagem de diárias. */
export interface FiltrosDiarias {
  /** Competência completa (yyyy-MM-01) para filtrar por mês. */
  competencia?: string;
  colaboradorId?: string;
}

/** Linha da listagem de diárias. */
export interface DiariaLista {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  obraId: string | null;
  obraNome: string | null;
  obraLote: string | null;
  /** Data da diária (yyyy-MM-dd). */
  data: string;
  /** Competência (yyyy-MM-01): primeiro dia do mês. */
  competencia: string;
  valor: number;
  observacao: string | null;
  /** Id do lançamento a pagar, ou null se ainda em aberto. */
  lancamentoId: string | null;
  /** True quando já fechada/paga: linha travada (sem editar/excluir). */
  fechada: boolean;
}

/**
 * Lista diárias com o nome do diarista, a obra e a flag `fechada` (lançamento
 * setado), ordenadas por data (desc). Os filtros são opcionais: a busca fina é
 * no client, mas a query aceita competência e colaborador.
 */
export async function listarDiarias(
  filtros: FiltrosDiarias = {},
): Promise<DiariaLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_diarias")
    .select(
      "id, colaborador_id, obra_id, data, competencia, valor, observacao, lancamento_id, colaboradores(nome), obras(nome, lote)",
    )
    .order("data", { ascending: false });

  if (filtros.competencia) {
    consulta = consulta.eq("competencia", filtros.competencia);
  }
  if (filtros.colaboradorId) {
    consulta = consulta.eq("colaborador_id", filtros.colaboradorId);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar as diárias");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "",
    obraId: linha.obra_id,
    obraNome: linha.obras?.nome ?? null,
    obraLote: linha.obras?.lote ?? null,
    data: linha.data,
    competencia: linha.competencia,
    valor: linha.valor,
    observacao: linha.observacao,
    lancamentoId: linha.lancamento_id,
    fechada: linha.lancamento_id !== null,
  }));
}

/** Fechamento pendente: diárias em aberto agregadas por colaborador+competência. */
export interface FechamentoPendente {
  colaboradorId: string;
  colaboradorNome: string;
  /** Competência (yyyy-MM-01): primeiro dia do mês. */
  competencia: string;
  qtdDiarias: number;
  total: number;
}

/**
 * Agrega as diárias EM ABERTO (lancamento_id null) por colaborador+competência.
 * Alimenta o painel "A fechar": cada item vira UM lançamento a pagar ao fechar.
 * Ordenado por competência (desc) e nome do diarista (asc).
 */
export async function listarFechamentosPendentes(
  competencia?: string,
): Promise<FechamentoPendente[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_diarias")
    .select("colaborador_id, competencia, valor, colaboradores(nome)")
    .is("lancamento_id", null);

  if (competencia) {
    consulta = consulta.eq("competencia", competencia);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os fechamentos pendentes");
  }

  const grupos = new Map<string, FechamentoPendente>();

  for (const linha of data ?? []) {
    const chave = `${linha.colaborador_id}|${linha.competencia}`;
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.qtdDiarias += 1;
      grupo.total += linha.valor;
    } else {
      grupos.set(chave, {
        colaboradorId: linha.colaborador_id,
        colaboradorNome: linha.colaboradores?.nome ?? "",
        competencia: linha.competencia,
        qtdDiarias: 1,
        total: linha.valor,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => {
    const porCompetencia = b.competencia.localeCompare(a.competencia);
    if (porCompetencia !== 0) return porCompetencia;
    return a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR");
  });
}
