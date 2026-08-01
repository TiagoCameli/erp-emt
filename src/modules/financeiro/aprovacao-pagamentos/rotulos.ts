/**
 * Palavras da conferência dos pagamentos que não passam pela aprovação.
 *
 * Estão todas aqui por um motivo concreto: "revisão" JÁ significa outra coisa
 * neste módulo. Na fila ao lado, "Revisar" DEVOLVE a parcela para quem lançou
 * ajustar, e é esse o sentido de `status = 'em_revisao'`, da RPC
 * `fn_revisar_parcela` e do KPI "Em revisão". Aqui a palavra quer dizer o
 * oposto: alguém conferiu um pagamento que já seguiu o caminho dele.
 *
 * O Tiago pediu "revisado" com a palavra dele, então é ela que vai para a tela.
 * Se ele trocar por "conferido", troca-se este arquivo e a aba inteira
 * acompanha: nenhum outro lugar escreve essas palavras à mão.
 */
export const CONFERENCIA = {
  /** Nome da aba. */
  aba: "Dinheiro e cartão",
  /** Estado marcado, no badge e no filtro. */
  marcado: "Revisado",
  /**
   * Estado não marcado. De propósito sem "aguardando" e sem "pendente": a
   * conferência não é fila e não segura pagamento nenhum.
   */
  naoMarcado: "Não revisado",
  /** Botão que carimba a linha. */
  acaoMarcar: "Marcar como revisado",
  /** Botão que desfaz o carimbo de quem marcou errado. */
  acaoDesmarcar: "Desmarcar revisão",
  /** Botões da barra de seleção. */
  acaoMarcarLote: "Marcar selecionados como revisados",
  acaoDesmarcarLote: "Desmarcar revisão dos selecionados",
  /** Cabeçalho da coluna e rótulo do filtro do estado. */
  coluna: "Revisão",
  /** Títulos dos KPIs do estado. */
  kpiMarcado: "Revisado",
  kpiNaoMarcado: "Ainda não revisado",
} as const;
