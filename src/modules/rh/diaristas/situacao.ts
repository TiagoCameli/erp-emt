/** Em aberto, fechada com o pagamento por fazer, ou paga. */
export type SituacaoDiaria = "aberto" | "fechada" | "paga";

/** Status de parcela que tiram a diária fechada do alcance de edição. */
const PARCELA_COMPROMETIDA = new Set(["aprovado", "pago"]);

export interface EstadoDiaria {
  lancamentoId: string | null;
  folhaId: string | null;
  /** Status das parcelas do lançamento da diária (vazio se aberta). */
  statusParcelas: readonly string[];
}

/**
 * Situação e "dá para alterar" de uma diária.
 *
 * Fechada não é paga: o pagamento pode ter sido estornado e a conta voltado para
 * a fila do Financeiro (aconteceu com o LAN-2026-7445 em 08/10/2026, que a tela
 * mostrava como "Paga"). Paga é o lançamento com todas as parcelas pagas, ou a
 * diária que a folha pagou.
 *
 * `alteravel` só esconde o menu. Quem decide é o banco (`fn_editar_diaria`,
 * `fn_excluir_diaria`), que também olha conciliação e competência fechada.
 */
export function situacaoDaDiaria(estado: EstadoDiaria): {
  situacao: SituacaoDiaria;
  alteravel: boolean;
} {
  const { lancamentoId, folhaId, statusParcelas } = estado;
  const paga =
    folhaId !== null ||
    (statusParcelas.length > 0 && statusParcelas.every((s) => s === "pago"));
  const comprometida = statusParcelas.some((s) => PARCELA_COMPROMETIDA.has(s));
  return {
    situacao: paga ? "paga" : lancamentoId !== null ? "fechada" : "aberto",
    alteravel: folhaId === null && !comprometida,
  };
}
