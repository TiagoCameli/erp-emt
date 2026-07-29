import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Um mês na tela de fechamento de competência. */
export interface CompetenciaMes {
  /** Primeiro dia do mês (yyyy-MM-01). */
  mes: string;
  fechada: boolean;
  fechadoEm: string | null;
  fechadoPorNome: string | null;
  observacao: string | null;
  /** Soma dos rateios dos lançamentos a pagar não cancelados do mês. */
  custo: number;
  /** Quantos lançamentos têm este mês de referência. */
  lancamentos: number;
  /** Quantos deles estão incompletos (previsto): custo que ainda vai mudar. */
  incompletos: number;
  /** Lançamentos que entraram no mês DEPOIS de ele ser fechado, pela exceção. */
  excecoes: number;
  /** Quantas vezes o mês foi reaberto. */
  reaberturas: number;
}

/**
 * Meses para a tela de fechamento: os últimos 13 mais qualquer mês que já tenha
 * lançamento ou fechamento. A agregação (custo, quantidade, incompletos) roda no
 * banco pela `fn_competencias_painel`, que também respeita a permissão de ver.
 */
export async function listarCompetencias(): Promise<CompetenciaMes[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_competencias_painel", {
    p_meses: 13,
  });

  if (error) {
    throw new Error("Não foi possível carregar as competências");
  }

  const linhas = data ?? [];

  // Nome de quem fechou, pela RPC de auditoria (a tabela de usuários não é
  // legível por todo mundo).
  const ids = [
    ...new Set(
      linhas
        .map((linha) => linha.fechado_por)
        .filter((id): id is string => id !== null),
    ),
  ];
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: ids,
    });
    for (const usuario of usuarios ?? []) nomes.set(usuario.id, usuario.nome);
  }

  return linhas.map((linha) => ({
    mes: linha.mes,
    fechada: linha.fechada,
    fechadoEm: linha.fechado_em,
    fechadoPorNome: linha.fechado_por
      ? (nomes.get(linha.fechado_por) ?? null)
      : null,
    observacao: linha.observacao,
    custo: Number(linha.custo ?? 0),
    lancamentos: linha.lancamentos,
    incompletos: linha.incompletos,
    excecoes: linha.excecoes,
    reaberturas: linha.reaberturas,
  }));
}
