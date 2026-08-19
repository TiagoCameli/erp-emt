import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/** Tamanho padrão de página da aba "Recebidos". */
export const TAMANHO_PAGINA_PADRAO = 25;

/**
 * Schemas da aba Financeiro > Recebimentos.
 *
 * O LANÇAMENTO de um recebível não mora aqui: ele é o mesmo `lancamentos` com
 * `tipo = 'a_receber'`, e usa o formulário e o schema de
 * `financeiro/lancamentos`. Ter dois formulários para a mesma tabela foi o que
 * deixou o caminho do a receber quebrado por meses (o daqui nem mandava número de
 * documento, e o do lançamento não mandava conta de destino).
 *
 * O que sobra aqui é a única mutação própria da aba: dar um recebimento como
 * recebido.
 */

/** Schema do formulário de "dar como recebido" (client). */
export const darComoRecebidoFormSchema = z.object({
  contaId: idSchemaCom("Selecione a conta que recebeu"),
  dataRecebimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data do recebimento" }),
});

export type DarComoRecebidoFormInput = z.infer<
  typeof darComoRecebidoFormSchema
>;
