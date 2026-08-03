/**
 * Palavras da conferência dos pagamentos que não passam pela aprovação.
 *
 * Estão todas aqui por um motivo concreto: "revisão" JÁ significa outra coisa
 * neste módulo. Na fila ao lado, "Revisar" DEVOLVE a parcela para quem lançou
 * ajustar, e é esse o sentido de `status = 'em_revisao'`, da RPC
 * `fn_revisar_parcela` e do KPI "Em revisão". Aqui a palavra quer dizer o
 * oposto: alguém conferiu um pagamento que já seguiu o caminho dele.
 *
 * Por isso a palavra desta aba é "conferido", decisão do Tiago: duas palavras
 * iguais com sentidos contrários na mesma tela é o que confundia. Se ela mudar
 * de novo, muda-se este arquivo e a aba inteira acompanha: nenhum outro lugar
 * escreve essas palavras à mão.
 */
export const CONFERENCIA = {
  /** Nome da aba. */
  aba: "Dinheiro e cartão",
  /** Estado marcado, no badge e no filtro. */
  marcado: "Conferido",
  /**
   * Estado não marcado. De propósito sem "aguardando" e sem "pendente": a
   * conferência não é fila e não segura pagamento nenhum.
   */
  naoMarcado: "Não conferido",
  /** Botão que carimba a linha. */
  acaoMarcar: "Marcar como conferido",
  /** Botão que desfaz o carimbo de quem marcou errado. */
  acaoDesmarcar: "Desmarcar conferência",
  /** Botões da barra de seleção. */
  acaoMarcarLote: "Marcar selecionados como conferidos",
  acaoDesmarcarLote: "Desmarcar conferência dos selecionados",
  /** Cabeçalho da coluna e rótulo do filtro do estado. */
  coluna: "Conferência",
  /** Títulos dos KPIs do estado. */
  kpiMarcado: "Conferido",
  kpiNaoMarcado: "Ainda não conferido",
} as const;
