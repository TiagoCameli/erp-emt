import { z } from "zod";

import { idSchema } from "@/lib/id";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";

/**
 * O que quem aprova folha, 13º ou férias escolhe no modal de aprovação, igual à
 * Aprovação de pagamentos: a conta que paga e, opcionalmente, outra data.
 *
 * A conta é obrigatória: o lançamento do RH nasce sem conta, e sem ela a parcela
 * empaca na fila do Financeiro ("sem conta bancária"). `dataProgramada` null é
 * "paga no vencimento", o mesmo fallback do banco. As travas de verdade estão na
 * `fn_rh_programar_pagamento_aprovado`; isto só barra lixo antes da RPC.
 */
export const programacaoPagamentoSchema = z.object({
  contaId: idSchema,
  dataProgramada: z.iso.date().nullable(),
});

export type ProgramacaoPagamento = z.infer<typeof programacaoPagamentoSchema>;

/** Argumentos da RPC `fn_aprovar_*_com_pagamento`, sem a data quando é null. */
export function argsProgramacao(programacao: ProgramacaoPagamento): {
  p_conta_id: string;
  p_data_programada?: string;
} {
  return programacao.dataProgramada
    ? { p_conta_id: programacao.contaId, p_data_programada: programacao.dataProgramada }
    : { p_conta_id: programacao.contaId };
}

/**
 * O que a página entrega à tela de detalhe para o modal de aprovação: as contas
 * que dá para escolher, se quem aprova também aprova pagamento (só aí a data é
 * escolhida aqui) e o vencimento que vale quando ninguém escolhe outra data.
 */
export interface AprovacaoComPagamento {
  contas: ContaBancariaOpcao[];
  podeProgramarData: boolean;
  vencimento: string | null;
}
