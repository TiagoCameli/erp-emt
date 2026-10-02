"use client";

import type * as React from "react";

import { AprovarDialog } from "@/modules/financeiro/aprovacao-pagamentos/components/aprovar-dialog";
import type {
  AprovacaoComPagamento,
  ProgramacaoPagamento,
} from "@/modules/rh/_shared/programacao-pagamento";

export interface AprovarComPagamentoDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  descricao: React.ReactNode;
  rotuloConfirmar: string;
  /** Valor somado dos pagamentos que a aprovação gera. */
  valorTotal: number;
  aprovacao: AprovacaoComPagamento;
  onConfirmar: (programacao: ProgramacaoPagamento) => Promise<void>;
}

/**
 * Modal de aprovação de folha, 13º e férias: o mesmo da Aprovação de pagamentos,
 * porque aprovar aqui é aprovar o pagamento (a conta que paga e a data).
 *
 * Conta obrigatória: o lançamento do RH nasce sem conta, e não há "conta do
 * lançamento" para manter. A data só aparece para quem também aprova pagamento;
 * para os outros a parcela nasce pendente e a data é escolhida no Financeiro.
 */
export function AprovarComPagamentoDialog({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  rotuloConfirmar,
  valorTotal,
  aprovacao,
  onConfirmar,
}: AprovarComPagamentoDialogProps) {
  return (
    <AprovarDialog
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      quantidade={1}
      valorTotal={valorTotal}
      vencimento={aprovacao.vencimento}
      contas={aprovacao.contas}
      titulo={titulo}
      descricao={descricao}
      rotuloConfirmar={rotuloConfirmar}
      contaObrigatoria
      ajudaConta="Conta que paga tudo o que esta aprovação gera, guias incluídas."
      semEscolhaDeData={
        aprovacao.podeProgramarData
          ? undefined
          : "Os pagamentos vão para a Aprovação de pagamentos, e a data é escolhida lá por quem aprova pagamento."
      }
      dataObrigatoria={aprovacao.vencimento === null}
      onConfirmar={async (dataProgramada, contaId) => {
        // contaObrigatoria garante a conta; o `?? ""` só satisfaz o tipo, e o
        // schema da action recusaria vazio de qualquer jeito.
        await onConfirmar({ contaId: contaId ?? "", dataProgramada });
      }}
    />
  );
}
