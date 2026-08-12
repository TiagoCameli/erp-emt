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
  /**
   * True quando alguma parcela do adiantamento já foi descontada em folha:
   * linha travada (sem editar/excluir). O vínculo com a folha vive na parcela
   * (`rh_adiantamento_parcelas.folha_id`); `rh_adiantamentos.folha_id` não
   * existe mais.
   */
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
      "id, colaborador_id, competencia, valor, data, descricao, lancamento_id, created_at, colaboradores(nome), lancamentos(numero)",
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

  // `naFolha` também em lote, e também por RPC definer: a policy de select de
  // rh_adiantamento_parcelas exige rh.adiantamentos:ver, então um perfil sem
  // `ver` leria vazio e a listagem mostraria como editável um adiantamento já
  // descontado. A função é fail-closed: sem permissão devolve todos os ids.
  let emFolha = new Set<string>();
  if (linhas.length > 0) {
    const { data: idsEmFolha, error: erroEmFolha } = await supabase.rpc(
      "fn_adiantamentos_em_folha",
      { p_adiantamento_ids: linhas.map((linha) => linha.id) },
    );
    if (erroEmFolha) {
      throw new Error(
        "Não foi possível conferir se os adiantamentos já entraram em folha",
      );
    }
    emFolha = new Set(idsEmFolha ?? []);
  }

  return linhas.map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "",
    competencia: linha.competencia,
    valor: linha.valor,
    data: linha.data,
    descricao: linha.descricao,
    naFolha: emFolha.has(linha.id),
    lancamentoId: linha.lancamento_id,
    lancamentoNumero: linha.lancamentos?.numero ?? null,
    pagamentoComprometido: linha.lancamento_id
      ? comprometidos.has(linha.lancamento_id)
      : false,
    criadoEm: linha.created_at,
  }));
}
