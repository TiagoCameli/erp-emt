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
  /** Id do lançamento a_pagar gerado na concessão, ou null (registro antigo). */
  lancamentoId: string | null;
  /** Número do lançamento (ex. LAN-2026-0001), para o link no Financeiro. */
  lancamentoNumero: string | null;
  /**
   * True quando o lançamento já tem parcela aprovada, paga ou conciliada:
   * linha travada (sem editar/excluir), mesmo fora da folha.
   */
  pagamentoComprometido: boolean;
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
      "id, colaborador_id, competencia, valor, data, descricao, folha_id, lancamento_id, created_at, colaboradores(nome), lancamentos(numero)",
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

  const linhas = data ?? [];

  // Checa o pagamento em lote (1 RPC, não 1 por linha): security definer
  // porque um perfil só-rh.adiantamentos não enxerga lancamento_parcelas /
  // extrato_transacoes pela RLS.
  const idsLancamento = linhas
    .map((linha) => linha.lancamento_id)
    .filter((id): id is string => id !== null);

  let comprometidos = new Set<string>();
  if (idsLancamento.length > 0) {
    const { data: idsComprometidos, error: erroComprometidos } =
      await supabase.rpc("fn_adiantamentos_comprometidos", {
        p_lancamento_ids: idsLancamento,
      });
    if (erroComprometidos) {
      throw new Error("Não foi possível conferir o pagamento dos adiantamentos");
    }
    comprometidos = new Set(idsComprometidos ?? []);
  }

  return linhas.map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "",
    competencia: linha.competencia,
    valor: linha.valor,
    data: linha.data,
    descricao: linha.descricao,
    folhaId: linha.folha_id,
    naFolha: linha.folha_id !== null,
    lancamentoId: linha.lancamento_id,
    lancamentoNumero: linha.lancamentos?.numero ?? null,
    pagamentoComprometido: linha.lancamento_id
      ? comprometidos.has(linha.lancamento_id)
      : false,
    criadoEm: linha.created_at,
  }));
}
